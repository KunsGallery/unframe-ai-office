// Firebase 로그인 토큰(ID 토큰) 검증 — 외부 패키지 없이 Google 공개 인증서로 서명을 확인한다.
import crypto from 'node:crypto';

const CERT_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
let cache = { keys: null, exp: 0 };

async function googleCerts() {
  if (cache.keys && Date.now() < cache.exp) return cache.keys;
  const res = await fetch(CERT_URL);
  if (!res.ok) throw new Error('인증서를 가져오지 못했어요');
  const maxAge = Number((/max-age=(\d+)/.exec(res.headers.get('cache-control') || '') || [])[1] || 3600);
  cache = { keys: await res.json(), exp: Date.now() + maxAge * 1000 };
  return cache.keys;
}

const part = s => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

// 성공하면 토큰 내용(payload)을, 실패하면 예외를 던진다. keys는 테스트용으로 주입 가능.
export async function verifyIdToken(token, projectId, keys) {
  const [h, p, sig] = String(token || '').split('.');
  if (!h || !p || !sig) throw new Error('토큰 형식이 아니에요');
  const header = part(h), payload = part(p);
  if (header.alg !== 'RS256') throw new Error('지원하지 않는 서명 방식');
  const pem = (keys || await googleCerts())[header.kid];
  if (!pem) throw new Error('알 수 없는 서명 키');
  const ok = crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), new crypto.X509Certificate(pem).publicKey, Buffer.from(sig, 'base64url'));
  if (!ok) throw new Error('서명이 맞지 않아요');
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId) throw new Error('다른 프로젝트의 토큰');
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('발급자가 달라요');
  if (!(payload.exp > now)) throw new Error('토큰이 만료됐어요');
  if (!(payload.iat <= now + 300)) throw new Error('발급 시각이 이상해요');
  if (!payload.sub) throw new Error('사용자 정보가 없어요');
  return payload;
}
