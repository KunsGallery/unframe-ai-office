// 🐾 펫 비서 — 설정 화면에서 부른다.
//  { slot }                         : "지금 받아 보기" — 그 알림을 바로 만들어 내 기기로 보낸다
//  { action: 'enable', refreshToken }: 정해진 시간 알림 켜기 — 내 로그인(refresh token)을 Netlify Blobs에 맡긴다
//  { action: 'disable' }            : 맡긴 로그인 지우기
import crypto from 'node:crypto';
import { verifyIdToken } from '../lib/verify-token.mjs';
import { MEMBERS } from '../../web/members.js';
import { firebaseConfig } from '../../web/firebase-config.js';
import { runPet, SLOTS } from '../lib/pet.mjs';
import { petVault, idTokenFromRefresh } from '../lib/gauth.mjs';

const emailHash = email => crypto.createHash('sha256').update('claude-office:' + email).digest('hex');
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export default async req => {
  if (req.method !== 'POST') return json(405, { error: 'POST 요청만 받아요' });
  let user;
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  try { user = await verifyIdToken(token, process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId); }
  catch (e) { return json(401, { error: '로그인 확인 실패: ' + e.message }); }
  const me = user.email_verified === true && MEMBERS.find(m => m.emailHash === emailHash(String(user.email || '').toLowerCase()));
  if (!me) return json(403, { error: '멤버만 쓸 수 있어요' });
  const body = await req.json().catch(() => ({}));
  const site = new URL(req.url).origin;
  if (body.action === 'enable') {
    // 맡기려는 로그인이 정말 이 사람 것인지 확인한 뒤에만 저장
    try {
      const t = await idTokenFromRefresh(String(body.refreshToken || ''), site);
      if (t.uid !== user.user_id && t.uid !== user.sub) return json(403, { error: '다른 계정의 로그인이에요' });
      await petVault().setJSON('rt-' + me.id, { refreshToken: body.refreshToken, at: Date.now() });
      return json(200, { ok: true });
    } catch (e) { return json(400, { error: '연결하지 못했어요: ' + e.message }); }
  }
  if (body.action === 'disable') { await petVault().delete('rt-' + me.id).catch(() => {}); return json(200, { ok: true }); }
  if (body.action === 'status') { const v = await petVault().get('rt-' + me.id, { type: 'json' }).catch(() => null); return json(200, { connected: !!(v && v.refreshToken), since: v && v.at }); }
  const { slot } = body;
  if (!SLOTS.includes(slot)) return json(400, { error: '알 수 없는 알림' });
  try {
    const [r] = await runPet({ force: { memberId: me.id, slot }, site, callerToken: token });
    return json(200, r || { sent: 0, text: '' });
  } catch (e) { return json(500, { error: e.message }); }
};
