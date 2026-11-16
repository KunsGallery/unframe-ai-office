// 🐾 펫 비서 "지금 받아 보기" — 멤버가 설정 화면에서 누르면 그 알림을 바로 만들어 내 기기로 보낸다.
import crypto from 'node:crypto';
import { verifyIdToken } from '../lib/verify-token.mjs';
import { MEMBERS } from '../../web/members.js';
import { firebaseConfig } from '../../web/firebase-config.js';
import { runPet, SLOTS } from '../lib/pet.mjs';

const emailHash = email => crypto.createHash('sha256').update('claude-office:' + email).digest('hex');
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export default async req => {
  if (req.method !== 'POST') return json(405, { error: 'POST 요청만 받아요' });
  let user;
  try { user = await verifyIdToken((req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''), process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId); }
  catch (e) { return json(401, { error: '로그인 확인 실패: ' + e.message }); }
  const me = user.email_verified === true && MEMBERS.find(m => m.emailHash === emailHash(String(user.email || '').toLowerCase()));
  if (!me) return json(403, { error: '멤버만 쓸 수 있어요' });
  const { slot } = await req.json().catch(() => ({}));
  if (!SLOTS.includes(slot)) return json(400, { error: '알 수 없는 알림' });
  try {
    const [r] = await runPet({ force: { memberId: me.id, slot }, site: new URL(req.url).origin });
    return json(200, r || { sent: 0, text: '' });
  } catch (e) { return json(500, { error: e.message }); }
};
