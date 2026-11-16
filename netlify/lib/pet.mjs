// 🐾 펫 비서: 각자의 펫이 정해진 시간에 휴대폰으로 말을 건다.
//  - brief(아침, 기본 08:30): 인사 + 오늘 기분 묻기 + 날씨 + 오늘 일정 + 마감 할 일
//  - lunch(13:00): 점심 뭐 먹었는지 묻고 오후 응원
//  - due(16:00): 오늘 마감·지난 할 일이 남아 있으면 챙기기
//  - evening(21:00): 오늘 아직 안 한 습관 챙기기 (다 했으면 칭찬)
//  - letter(일요일 20:00): 한 주를 돌아보는 회고 편지 (letters 컬렉션에 남고 둘이 같이 본다)
// 글은 Claude가 그 사람의 기록·말투 설정을 보고 매일 새로 쓴다. 실패하면 정해진 문구로.
import Anthropic from '@anthropic-ai/sdk';
import webpush from 'web-push';
import { MEMBERS } from '../../web/members.js';
import { VAPID_PUBLIC_KEY } from '../../web/push-config.js';
import { serviceAccount, saToken, firestore, petVault, idTokenFromRefresh } from './gauth.mjs';

export const SLOTS = ['brief', 'lunch', 'due', 'evening', 'letter'];
export const DEFAULTS = { briefOn: true, briefTime: '08:30', lunchOn: true, lunchTime: '13:00', dueOn: true, dueTime: '16:00', eveningOn: true, eveningTime: '21:00', letterOn: true, letterTime: '20:00', weekend: false, city: 'seoul', style: '', shareMood: true };
export const CITIES = {
  seoul: ['서울', 37.5665, 126.978], seongnam: ['성남·판교', 37.4, 127.11], suwon: ['수원', 37.263, 127.028], incheon: ['인천', 37.456, 126.705],
  goyang: ['고양·일산', 37.658, 126.832], busan: ['부산', 35.18, 129.075], daegu: ['대구', 35.871, 128.601], daejeon: ['대전', 36.35, 127.385],
  gwangju: ['광주', 35.16, 126.851], ulsan: ['울산', 35.539, 129.311], jeju: ['제주', 33.499, 126.531],
};
const PET_KO = { collie: '보더콜리', husky: '허스키', golden: '골든 리트리버', dog: '치와와', cat: '고양이', rabbit: '토끼' };
const PET_EMOJI = { collie: '🐕', husky: '🐺', golden: '🦮', dog: '🐶', cat: '🐈', rabbit: '🐇' };
const MOOD = ['', '😫', '😕', '😐', '🙂', '😄'];
const WX = { 0: '맑음', 1: '대체로 맑음', 2: '구름 조금', 3: '흐림', 45: '안개', 48: '안개', 51: '이슬비', 53: '이슬비', 55: '이슬비', 61: '비', 63: '비', 65: '강한 비', 66: '어는 비', 67: '어는 비', 71: '눈', 73: '눈', 75: '많은 눈', 77: '싸락눈', 80: '소나기', 81: '소나기', 82: '강한 소나기', 85: '눈 소나기', 86: '눈 소나기', 95: '뇌우', 96: '뇌우', 99: '뇌우' };

// ---------- 한국 시간 ----------
const pad = n => String(n).padStart(2, '0');
export function kstNow(ms = Date.now()) {
  const d = new Date(ms + 9 * 3600e3);   // UTC 기준 시각을 9시간 밀어 KST 숫자로 쓴다
  return { day: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, min: d.getUTCHours() * 60 + d.getUTCMinutes(), wd: d.getUTCDay(), hhmm: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` };
}
const addDay = (day, n) => { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const toMin = t => { const m = /^(\d{2}):(\d{2})$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : -1; };
const WDK = ['일', '월', '화', '수', '목', '금', '토'];

export function settingsOf(doc) { return { ...DEFAULTS, ...(doc || {}) }; }
export function petOf(member, profile) {
  const idx = Math.max(0, MEMBERS.findIndex(m => m.id === member.id));
  const kind = (profile && profile.pet) || ['collie', 'rabbit', 'cat'][idx % 3];
  if (kind === 'none') return { kind, name: `${member.name}의 비서`, emoji: '🐾', ko: '비서' };
  return { kind, name: ((profile && profile.petName) || '').trim() || `${member.name}의 ${PET_KO[kind] || '펫'}`, emoji: PET_EMOJI[kind] || '🐾', ko: PET_KO[kind] || '펫' };
}

async function weather(cityKey) {
  const [name, lat, lon] = CITIES[cityKey] || CITIES.seoul;
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FSeoul&forecast_days=1`, { signal: AbortSignal.timeout(5000) });
    const j = await r.json();
    return { city: name, now: Math.round(j.current.temperature_2m), sky: WX[j.daily.weather_code[0]] || '', max: Math.round(j.daily.temperature_2m_max[0]), min: Math.round(j.daily.temperature_2m_min[0]), rain: j.daily.precipitation_probability_max[0] };
  } catch { return null; }
}

/** 한 사람의 오늘 자료를 모은다 */
async function gather(db, member, slot, kst, s) {
  const today = kst.day, other = MEMBERS.filter(m => m.id !== member.id);
  const [profile, events, board, trackers, logs, moodToday, moodYest] = await Promise.all([
    db.get(`profiles/${member.id}`).catch(() => null),
    // 보안 규칙이 증명할 수 있게: 내 일정 + 함께 보기 일정을 따로 묻는다
    Promise.all([db.query('events', [['owner', '==', member.id]]).catch(() => []), db.query('events', [['shared', '==', true]]).catch(() => [])])
      .then(([a, b]) => [...new Map([...a, ...b].map(e => [e.id, e])).values()]),
    db.query('board', []).catch(() => []),
    db.query('trackers', [['owner', '==', member.id]]).catch(() => []),
    db.query('logs', [['owner', '==', member.id]]).catch(() => []),
    db.get(`moods/${member.id}__${today}`).catch(() => null),
    db.get(`moods/${member.id}__${addDay(today, -1)}`).catch(() => null),
  ]);
  const endOf = e => (e.endDay && e.endDay > e.day ? e.endDay : e.day);   // 기간 일정 (전시 등)
  const weekEvents = events.filter(e => e.day <= today && endOf(e) >= addDay(today, -6)).map(e => `${e.day.slice(5)}${endOf(e) > e.day ? '~' + endOf(e).slice(5) : ''} ${e.title}`);
  const ev = events.filter(e => e.day <= today && endOf(e) >= today && (e.owner === member.id || e.shared)).sort((a, b) => (a.time || '99') < (b.time || '99') ? -1 : 1)
    .map(e => `${endOf(e) > e.day ? (e.day === today ? `${e.time || ''} ${e.title} 시작 (~${endOf(e).slice(5)})` : endOf(e) === today ? `${e.title} 마지막 날${e.endTime ? ` (~${e.endTime})` : ''}` : `${e.title} 진행 중 (${e.day.slice(5)}~${endOf(e).slice(5)})`).trim() : `${e.time || '하루 종일'} ${e.title}`}${e.cal === 'unframe' ? ' [언프레임]' : e.cal === 'kuns' ? ' [쿤스갤러리]' : e.owner !== member.id ? ` (${(MEMBERS.find(m => m.id === e.owner) || {}).name}님 일정)` : ''}`);
  const doneWeek = board.filter(b => b.done && b.doneBy === member.id && b.doneDay >= addDay(today, -6)).map(b => b.text);
  const mine = board.filter(b => !b.done && (b.assignee === member.id || (!b.assignee && b.by === member.id)));
  const due = mine.filter(b => b.due && b.due <= today).map(b => `${b.text}${b.due < today ? ' (마감 지남)' : ' (오늘 마감)'}`);
  const myLogs = logs.filter(l => l.owner === member.id);
  const amt = (t, d) => { const l = myLogs.find(x => x.tracker === t.id && x.day === d); return l ? l.amount : 0; };
  const habits = trackers.filter(t => !t.archived).map(t => {
    let streak = 0, d = amt(t, today) > 0 ? today : addDay(today, -1);
    while (amt(t, d) > 0 && streak < 60) { streak++; d = addDay(d, -1); }
    const unit = t.unit === 'minutes' ? '분' : t.unit === 'count' ? (t.unitLabel || '개') : '';
    const goal = t.unit === 'check' ? 1 : t.dailyGoal || 0, a = amt(t, today);
    const week = []; for (let i = 6; i >= 0; i--) week.push(amt(t, addDay(today, -i)));
    return { week, name: `${t.emoji || ''} ${t.name}`.trim(), today: t.unit === 'check' ? (a ? '했음' : '안 함') : `${a}${unit}${goal ? ` / 목표 ${goal}${unit}` : ''}`, done: goal ? a >= goal : a > 0, streak, yest: amt(t, addDay(today, -1)) };
  });
  return {
    profile, pet: petOf(member, profile), today, weekday: WDK[kst.wd], events: ev, due, openTasks: mine.length, habits,
    moodToday: moodToday && moodToday.score ? MOOD[moodToday.score] + (moodToday.note ? ` "${moodToday.note}"` : '') : '',
    moodYesterday: moodYest && moodYest.score ? MOOD[moodYest.score] : '', lunch: moodToday && moodToday.lunch || '',
    weather: slot === 'brief' ? await weather(s.city) : null, partner: other.map(m => m.name).join(', '),
    weekEvents, doneWeek,
    weekMoods: slot === 'letter' ? await Promise.all([...Array(7)].map((_, i) => db.get(`moods/${member.id}__${addDay(today, -6 + i)}`).catch(() => null))).then(l => l.map(m => (m && m.score ? MOOD[m.score] : '·')).join(' ')) : '',
  };
}

const TASK = {
  brief: '아침 인사를 하고, 오늘 기분이 어떤지 물어봐. 날씨(지역·최저/최고 기온, 비 확률 50% 이상이면 우산)를 짧게, 오늘 일정은 시간 순으로 최대 3개, 마감 할 일이 있으면 한 줄로. 일정이 없으면 여유로운 하루라고.',
  lunch: '점심 뭐 먹었는지 물어보고, 오후도 힘내자고 그 사람 스타일에 맞게 응원해. 오후 일정이 있으면 하나만 살짝 언급.',
  due: '오늘 마감이거나 마감이 지난 할 일을 부드럽게 챙겨줘. 개수와 가장 급한 것 하나를 말해.',
  evening: '오늘 아직 목표를 못 채운 습관을 챙겨줘. 연속 기록(🔥n일)이 끊길 수 있는 습관을 먼저. 모두 다 했으면 크게 칭찬해.',
  letter: '이번 한 주(습관의 week 배열은 6일 전→오늘 순서의 날마다 양)를 돌아보는 짧은 편지를 써. "○○님께"로 시작해서 펫 이름으로 끝내. 잘한 점 1~2개(숫자로 구체적으로), 아쉬웠던 요일이나 습관 하나, 기분 흐름(weekMoods), 끝낸 할 일·있었던 일정 한두 개, 다음 주 작은 제안 하나. 따뜻하게.',
};
function fallback(slot, d) {
  const n = d.pet.name;
  if (slot === 'brief') return `좋은 아침! 오늘 기분은 어때요? ${d.weather ? `${d.weather.city} ${d.weather.sky}, ${d.weather.min}~${d.weather.max}°C${d.weather.rain >= 50 ? ', 우산 챙겨요' : ''}. ` : ''}${d.events.length ? `오늘 일정: ${d.events.slice(0, 3).join(', ')}` : '오늘은 일정이 없어요.'}`;
  if (slot === 'lunch') return '점심은 뭐 먹었어요? 오후도 같이 힘내요! 🐾';
  if (slot === 'letter') return `${n}가 보내는 이번 주 편지 📮 일주일 동안 ${d.habits.map(h => `${h.name} ${h.week.filter(x => x > 0).length}일`).join(', ') || '기록을 쉬었어요'}. 다음 주도 작게, 꾸준히 같이 가요!`;
  if (slot === 'due') return `마감 챙길 일이 ${d.due.length}개 있어요: ${d.due[0]}`;
  const left = d.habits.filter(h => !h.done);
  return left.length ? `오늘 ${left.map(h => h.name).slice(0, 2).join(', ')} 아직이에요. ${left[0].streak ? `🔥${left[0].streak}일 연속, 이어가요!` : '조금만 해볼까요?'}` : `오늘 습관 다 했어요! 최고예요 — ${n}`;
}

async function write(slot, member, d, s) {
  if (!process.env.ANTHROPIC_API_KEY) return fallback(slot, d);
  const client = new Anthropic();
  const sys = `너는 ${member.name}님의 반려 ${d.pet.ko} "${d.pet.name}"이고, ${member.name}님의 다정한 개인 비서야. 휴대폰 알림 하나에 들어갈 말을 써.
규칙: 한국어. ${slot === 'letter' ? '편지 형식, 6~9문장, 500자 이내, 줄바꿈 몇 번. 이모지는 2~4개.' : '2~3문장, 140자 이내. 이모지는 1~2개.'} ${d.pet.ko}다운 귀여운 말투(과하지 않게). 제목·따옴표·목록 기호 없이 본문만.
<data> 안의 사실만 쓰고 없는 일정·숫자는 지어내지 마. 숫자(시간, 기온, 연속 일수)는 그대로.
${s.style ? `${member.name}님이 원하는 말투·스타일: ${s.style}` : ''}`;
  const data = { 지금: `${d.today} (${d.weekday})`, 날씨: d.weather, 오늘일정: d.events, 마감할일: d.due, 남은할일수: d.openTasks, 습관: d.habits, 오늘기분: d.moodToday, 어제기분: d.moodYesterday, 오늘점심: d.lunch,
    ...(slot === 'letter' ? { 이번주일정: d.weekEvents, 이번주끝낸할일: d.doneWeek, weekMoods: d.weekMoods } : {}) };
  try {
    const msg = await client.beta.messages.create({
      model: 'claude-opus-5-5', max_tokens: 1500, system: sys,
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', output_config: { effort: 'low' },
      messages: [{ role: 'user', content: `할 일: ${TASK[slot]}\n<data>\n${JSON.stringify(data)}\n</data>` }],
    }, { timeout: 20000 });
    const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('').trim().replace(/^["“]|["”]$/g, '');
    return text && msg.stop_reason !== 'refusal' ? text.slice(0, slot === 'letter' ? 900 : 220) : fallback(slot, d);
  } catch { return fallback(slot, d); }
}

/** 보낼지 말지: 내용이 없으면 건너뛴다 */
const worth = (slot, d) => slot === 'due' ? d.due.length > 0 : slot === 'evening' ? d.habits.length > 0 : true;
const URL_OF = { brief: './#mood', lunch: './#lunch', due: './#together', evening: './#today', letter: './#letters' };
const weekStart = day => { const d = new Date(day + 'T00:00:00Z'); return addDay(day, -((d.getUTCDay() + 6) % 7)); };   // 월요일

async function pushTo(db, memberId, payload, site) {
  if (!process.env.VAPID_PRIVATE_KEY) return 0;
  webpush.setVapidDetails(site, VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const subs = await db.query('pushSubs', [['owner', '==', memberId]]).catch(() => []);
  let sent = 0;
  await Promise.all(subs.map(async s => {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload), { TTL: 3 * 3600, urgency: 'normal' }); sent++; }
    catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await db.remove(s._name); }
  }));
  return sent;
}

/**
 * 정해진 시간이 된 알림을 보낸다. force: { memberId, slot } 이면 시간·중복 확인 없이 지금 바로 (설정 화면의 "지금 받아 보기")
 */
export async function runPet({ now = Date.now(), force = null, site = 'https://unframe-office.netlify.app', callerToken = null } = {}) {
  const sa = serviceAccount(), projectId = (sa && sa.projectId) || 'unframe-ai-office';
  const saDb = sa ? firestore(projectId, await saToken(sa)) : null;
  // 서비스 계정이 없으면: 각자 맡긴 로그인으로 그 사람 권한의 접속을 만든다
  const vault = saDb ? null : petVault();
  async function dbFor(member) {
    if (saDb) return saDb;
    if (force && callerToken && force.memberId === member.id) return firestore(projectId, callerToken);
    const v = await vault.get('rt-' + member.id, { type: 'json' }).catch(() => null);
    if (!v || !v.refreshToken) return null;
    try { return firestore(projectId, (await idTokenFromRefresh(v.refreshToken, site)).idToken); } catch { return null; }
  }
  const kst = kstNow(now), out = [];
  for (const member of MEMBERS) {
    if (force && force.memberId !== member.id) continue;
    const db = await dbFor(member);
    if (!db) { if (force) throw new Error('펫 비서가 아직 연결되지 않았어요. 펫 비서 설정에서 저장을 한 번 눌러 주세요'); continue; }
    const s = settingsOf(await db.get(`assistant/${member.id}`).catch(() => null));
    const weekend = kst.wd === 0 || kst.wd === 6;
    for (const slot of SLOTS) {
      const markId = `petNotes/${member.id}__${kst.day}__${slot}`;
      if (force) { if (force.slot !== slot) continue; }
      else {
        if (!s[slot + 'On']) continue;
        if (slot === 'letter' ? kst.wd !== 0 : (weekend && !s.weekend)) continue;   // 편지는 일요일에만
        const t = toMin(s[slot + 'Time']);
        if (t < 0 || kst.min < t || kst.min > t + 50) continue;   // 정한 시각부터 50분 안에만 (10분마다 돈다)
        // 먼저 표시를 만들어 같은 알림이 두 번 가지 않게
        if (!await db.create(markId, { member: member.id, day: kst.day, slot, text: '', at: new Date(now) }, { onlyIfMissing: true }).catch(() => false)) continue;
      }
      const d = await gather(db, member, slot, kst, s);
      if (!force && !worth(slot, d)) { await db.create(markId, { member: member.id, day: kst.day, slot, text: '', skipped: true, at: new Date(now) }).catch(() => {}); continue; }
      const text = await write(slot, member, d, s);
      await db.create(`${markId}${force ? '-test' : ''}`, { member: member.id, day: kst.day, slot, text, at: new Date(now) }).catch(() => {});
      if (slot === 'letter') await db.create(`letters/${member.id}__${weekStart(kst.day)}`, { member: member.id, week: weekStart(kst.day), text, pet: d.pet.name, at: new Date(now) }).catch(() => {});
      const sent = await pushTo(db, member.id, { title: slot === 'letter' ? `📮 ${d.pet.name}의 편지` : `${d.pet.emoji} ${d.pet.name}`, body: slot === 'letter' ? text.replace(/\s+/g, ' ').slice(0, 120) + '…' : text, tag: 'pet-' + slot, url: URL_OF[slot], kind: 'pet' }, site);
      out.push({ member: member.id, slot, sent, text });
    }
  }
  return out;
}
