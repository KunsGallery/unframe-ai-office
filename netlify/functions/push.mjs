// 🔔 웹 푸시 보내기 — 멤버만 호출. 받는 사람의 기기 구독(pushSubs)을 찾아 휴대폰·PC로 알림을 보낸다.
// 필요한 환경변수: VAPID_PRIVATE_KEY (공개 키는 web/push-config.js)
// Firestore는 서비스 계정 없이, 호출한 멤버의 로그인 토큰으로 REST API를 부른다 (보안 규칙이 그대로 적용됨).
import crypto from 'node:crypto';
import webpush from 'web-push';
import { verifyIdToken } from '../lib/verify-token.mjs';
import { MEMBERS } from '../../web/members.js';
import { firebaseConfig } from '../../web/firebase-config.js';
import { VAPID_PUBLIC_KEY } from '../../web/push-config.js';

const emailHash = email => crypto.createHash('sha256').update('claude-office:' + email).digest('hex');
const memberOf = email => MEMBERS.find(m => m.emailHash === emailHash(email)) || null;
// 받는 사람 쪽 설정(kinds)으로 거르는 알림 종류. claude-*·test는 자기 기기로만 보낼 수 있다
const KINDS = ['chat', 'request', 'board', 'event', 'cheer', 'claude-wait', 'claude-done', 'test'];
const SELF_ONLY = new Set(['claude-wait', 'claude-done', 'test']);

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');

export default async req => {
  if (req.method !== 'POST') return json(405, { error: 'POST 요청만 받아요' });
  if (!process.env.VAPID_PRIVATE_KEY) return json(500, { error: 'Netlify 환경변수 VAPID_PRIVATE_KEY가 설정되지 않았어요' });

  const projectId = process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId;
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  let user;
  try { user = await verifyIdToken(token, projectId); } catch (e) { return json(401, { error: '로그인 확인 실패: ' + e.message }); }
  const me = user.email_verified === true ? memberOf(String(user.email || '').toLowerCase()) : null;
  if (!me) return json(403, { error: '멤버만 쓸 수 있어요' });

  const body = await req.json().catch(() => ({}));
  const kind = body.kind;
  if (!KINDS.includes(kind)) return json(400, { error: '알 수 없는 알림 종류' });
  const ids = new Set(MEMBERS.map(m => m.id));
  let to = [...new Set(Array.isArray(body.to) ? body.to : [])].filter(id => ids.has(id));
  if (SELF_ONLY.has(kind)) to = [me.id];
  if (!to.length) return json(200, { sent: 0 });
  const payload = JSON.stringify({
    title: str(body.title, 80) || 'Unframe Log', body: str(body.body, 240), tag: str(body.tag, 80),
    url: /^[#./?a-z0-9=&_-]*$/i.test(body.url || '') ? body.url || './' : './', kind, from: me.id,
  });

  // 받는 사람의 기기 구독 찾기
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const auth = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  const q = await fetch(`${base}:runQuery`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: 'pushSubs' }],
      where: { fieldFilter: { field: { fieldPath: 'owner' }, op: 'IN', value: { arrayValue: { values: to.map(id => ({ stringValue: id })) } } } },
    } }),
  });
  if (!q.ok) return json(502, { error: '구독 정보를 읽지 못했어요 (' + q.status + ')' });
  const subs = (await q.json()).filter(r => r.document).map(r => {
    const f = r.document.fields || {}, k = (f.keys && f.keys.mapValue && f.keys.mapValue.fields) || {};
    return {
      name: r.document.name,
      kinds: ((f.kinds && f.kinds.arrayValue && f.kinds.arrayValue.values) || []).map(v => v.stringValue),
      sub: { endpoint: f.endpoint && f.endpoint.stringValue, keys: { p256dh: k.p256dh && k.p256dh.stringValue, auth: k.auth && k.auth.stringValue } },
    };
  }).filter(s => s.sub.endpoint && s.sub.keys.p256dh && s.sub.keys.auth && (kind === 'test' || s.kinds.includes(kind) || (kind === 'cheer' && s.kinds.includes('chat'))));

  webpush.setVapidDetails(new URL(req.url).origin.startsWith('http://localhost') ? 'https://unframe-office.netlify.app' : new URL(req.url).origin, VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  let sent = 0, removed = 0;
  await Promise.all(subs.map(async s => {
    try {
      await webpush.sendNotification(s.sub, payload, { TTL: 6 * 3600, urgency: kind === 'claude-done' ? 'normal' : 'high', topic: undefined });
      sent++;
    } catch (e) {
      // 앱을 지웠거나 알림을 끈 기기 → 구독 지우기
      if (e.statusCode === 404 || e.statusCode === 410) {
        await fetch(`https://firestore.googleapis.com/v1/${s.name}`, { method: 'DELETE', headers: auth }).catch(() => {});
        removed++;
      }
    }
  }));
  return json(200, { sent, removed, devices: subs.length });
};
