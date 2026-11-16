// Firebase 서비스 계정으로 Firestore REST 쓰기 (정해진 시간에 서버가 혼자 도는 펫 비서용).
// 환경변수 FIREBASE_SERVICE_ACCOUNT: Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → 새 비공개 키(JSON) 내용 그대로
// 외부 패키지 없이 JWT(RS256)를 만들어 액세스 토큰으로 바꾼다. 서비스 계정 요청은 보안 규칙을 거치지 않으니 서버에서만 쓴다.
import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { firebaseConfig } from '../../web/firebase-config.js';

let cache = { token: null, exp: 0 };
export function serviceAccount() {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (!raw) return null;
  const j = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
  return { email: j.client_email, key: j.private_key, projectId: j.project_id };
}
export async function saToken(sa) {
  if (cache.token && Date.now() < cache.exp - 60_000) return cache.token;
  const now = Math.floor(Date.now() / 1000);
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ iss: sa.email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.key, 'base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + sig }),
  });
  if (!res.ok) throw new Error('서비스 계정 토큰 실패 (' + res.status + ')');
  const j = await res.json();
  cache = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return cache.token;
}

// ---------- Firestore REST (값 변환 + 읽기·쓰기) ----------
export function decode(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, decode(x)]));
  return null;
}
export function encode(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)])) } };
}
const docOf = d => ({ id: d.name.split('/').pop(), _name: d.name, ...decode({ mapValue: { fields: d.fields || {} } }) });

/** token: 서비스 계정 토큰 또는 멤버 ID 토큰 (Bearer) */
export function firestore(projectId, token) {
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  const OPS = { '==': 'EQUAL', '>=': 'GREATER_THAN_OR_EQUAL', '<=': 'LESS_THAN_OR_EQUAL', in: 'IN' };
  return {
    async get(path) {
      const r = await fetch(`${base}/${path}`, { headers });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`get ${path} ${r.status}`);
      return docOf(await r.json());
    },
    async query(collection, filters = []) {
      const f = filters.map(([field, op, value]) => ({ fieldFilter: { field: { fieldPath: field }, op: OPS[op], value: encode(value) } }));
      const where = f.length === 1 ? f[0] : f.length ? { compositeFilter: { op: 'AND', filters: f } } : undefined;
      const r = await fetch(`${base}:runQuery`, { method: 'POST', headers, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }], ...(where ? { where } : {}) } }) });
      if (!r.ok) throw new Error(`query ${collection} ${r.status}`);
      return (await r.json()).filter(x => x.document).map(x => docOf(x.document));
    },
    /** onlyIfMissing: 이미 있으면 false (같은 알림을 두 번 보내지 않게 먼저 표시를 만든다) */
    async create(path, data, { onlyIfMissing = false } = {}) {
      const r = await fetch(`${base}/${path}${onlyIfMissing ? '?currentDocument.exists=false' : ''}`, { method: 'PATCH', headers, body: JSON.stringify({ fields: encode(data).mapValue.fields }) });
      if (onlyIfMissing && !r.ok) {
        const e = await r.json().catch(() => ({}));
        if (['ALREADY_EXISTS', 'FAILED_PRECONDITION'].includes(e.error && e.error.status)) return false;
      }
      if (!r.ok) throw new Error(`write ${path} ${r.status}`);
      return true;
    },
    async remove(name) { await fetch(name.startsWith('projects/') ? `https://firestore.googleapis.com/v1/${name}` : `${base}/${name}`, { method: 'DELETE', headers }).catch(() => {}); },
  };
}

// ---------- 서비스 계정 없이: 멤버가 맡긴 로그인(refresh token)으로 그 사람의 ID 토큰 받기 ----------
// 조직 정책으로 서비스 계정 키를 만들 수 없을 때 쓰는 방법. 각자 앱에서 "펫 비서"를 켜면 refresh token이
// Netlify Blobs(서버 전용 저장소)에 들어가고, 정해진 시간에 서버가 그 사람 권한으로 Firestore를 읽는다 (보안 규칙 그대로 적용)

export const petVault = () => getStore('pet-assistant');
export async function idTokenFromRefresh(refreshToken, site) {
  const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(firebaseConfig.apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(site ? { Referer: site + '/' } : {}) },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  if (!r.ok) throw new Error('로그인 갱신 실패 (' + r.status + ')');
  const j = await r.json();
  return { idToken: j.id_token, uid: j.user_id };
}
