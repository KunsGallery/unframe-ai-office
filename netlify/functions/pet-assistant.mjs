// 🐾 펫 비서 — 10분마다 돌면서 각자 정한 시간이 된 알림(아침 브리핑·점심·마감·저녁 습관)을 보낸다.
// 필요한 환경변수: FIREBASE_SERVICE_ACCOUNT, VAPID_PRIVATE_KEY, ANTHROPIC_API_KEY(없으면 정해진 문구)
import { runPet } from '../lib/pet.mjs';

export default async () => {
  try {
    const out = await runPet({ site: process.env.URL || 'https://unframe-office.netlify.app' });
    if (out.length) console.log('pet sent', JSON.stringify(out.map(o => ({ m: o.member, s: o.slot, n: o.sent }))));
  } catch (e) { console.error('pet error', e.message); }
  return new Response('ok');
};
export const config = { schedule: '*/10 * * * *' };
