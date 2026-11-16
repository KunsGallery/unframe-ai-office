// Unframe Log — 날짜·통계·업적·숫자 표기 (화면과 저장소에 상관없는 순수 계산)
const pad = n => String(n).padStart(2, '0');
export const dayKey = (d = new Date()) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
export const parseDay = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (k, n) => { const d = parseDay(k); d.setDate(d.getDate() + n); return dayKey(d); };
export const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();   // m: 0~11
export const daysInYear = y => (new Date(y, 1, 29).getMonth() === 1 ? 366 : 365);
export const dayOfYear = k => { const d = parseDay(k); return Math.round((d - new Date(d.getFullYear(), 0, 1)) / 86400000); };
const WD = ['일', '월', '화', '수', '목', '금', '토'];
export const fmtDate = k => { const d = parseDay(k); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${WD[d.getDay()]}요일`; };

export const UNIT_KO = { minutes: '시간(분)', count: '횟수·개수', check: '했다/안 했다' };
// 어두운 AI 테마에서 잘 보이는 색. 예전 색으로 저장된 습관은 vivid()로 바꿔 보여준다
export const COLORS = ['#8b9cff', '#fb7185', '#34d399', '#fbbf24', '#c084fc', '#67e8f9'];
const OLD_COLORS = { '#1f3fbf': '#8b9cff', '#e4572e': '#fb7185', '#17a673': '#34d399', '#f0a202': '#fbbf24', '#8e44ad': '#c084fc', '#111111': '#67e8f9' };
export const vivid = c => OLD_COLORS[String(c || '').toLowerCase()] || c || '#8b9cff';
export const STEPS = { minutes: [5, 10, 15, 30], count: [1, 5], check: [1] };

const nf = n => Math.round(n).toLocaleString('ko-KR');
const nf1 = n => (Math.round(n * 10) / 10).toLocaleString('ko-KR', { maximumFractionDigits: 1 });
export const num = nf;
export const num1 = nf1;

/** 큰 숫자 + 단위로 나누기: 분 → 시간, 개수 → 단위, 체크 → 일 */
export function bigParts(t, amount, { days } = {}) {
  if (t.unit === 'check') return { num: nf(days ?? amount), unit: '일' };
  if (t.unit === 'count') return { num: nf(amount), unit: t.unitLabel || '개' };
  if (amount < 60) return { num: nf(amount), unit: '분' };
  // 내림: 99.8시간을 '100시간'으로 보여 업적보다 먼저 달성한 것처럼 보이지 않게
  return { num: amount < 600 ? nf1(Math.floor(amount / 6) / 10) : nf(Math.floor(amount / 60)), unit: '시간' };
}
/** 짧은 글자 표기: "1시간 20분", "35쪽", "했어요" */
export function fmtAmount(t, a) {
  if (t.unit === 'check') return a > 0 ? '했어요' : '아직';
  if (t.unit === 'count') return `${nf(a)}${t.unitLabel || '개'}`;
  const h = Math.floor(a / 60), m = Math.round(a % 60);
  return h ? (m ? `${h}시간 ${m}분` : `${h}시간`) : `${m}분`;
}
export const goalOf = t => (t.unit === 'check' ? 1 : Math.max(0, +t.dailyGoal || 0));

/** logs: [{tracker, day, amount, note}] → Map(trackerId → Map(day → log)) */
export function indexLogs(logs) {
  const by = new Map();
  for (const l of logs) {
    if (!by.has(l.tracker)) by.set(l.tracker, new Map());
    by.get(l.tracker).set(l.day, l);
  }
  return by;
}

/** 습관 하나의 통계 */
export function statsFor(t, days, today = dayKey(), year = +today.slice(0, 4)) {
  days = days || new Map();
  const goal = goalOf(t);
  const done = [...days.values()].filter(l => l.amount > 0).sort((a, b) => (a.day < b.day ? -1 : 1));
  let total = 0, yearTotal = 0, yearDays = 0, best = 0, run = 0, prev = null, first = null;
  const monthly = Array(12).fill(0), monthlyDays = Array(12).fill(0);
  const ym = today.slice(0, 7);
  let monthTotal = 0, monthDays = 0;
  for (const l of done) {
    if (l.day > today) continue;
    first = first || l.day;
    total += l.amount;
    if (+l.day.slice(0, 4) === year) { yearTotal += l.amount; yearDays++; monthly[+l.day.slice(5, 7) - 1] += l.amount; monthlyDays[+l.day.slice(5, 7) - 1]++; }
    if (l.day.slice(0, 7) === ym) { monthTotal += l.amount; monthDays++; }
    run = prev && addDays(prev, 1) === l.day ? run + 1 : 1;
    best = Math.max(best, run); prev = l.day;
  }
  const amt = k => (days.get(k) ? days.get(k).amount : 0);
  // 지금 연속: 오늘 했으면 오늘부터, 아니면 어제부터 거꾸로 센다 (오늘 아직 안 했어도 끊긴 건 아님)
  let streak = 0, k = amt(today) > 0 ? today : addDays(today, -1);
  while (amt(k) > 0) { streak++; k = addDays(k, -1); }
  let sum30 = 0, days30 = 0;
  for (let i = 0; i < 30; i++) { const a = amt(addDays(today, -i)); if (a > 0) { sum30 += a; days30++; } }
  const todayAmt = amt(today);
  return {
    goal, total, yearTotal, yearDays, monthTotal, monthDays, monthly, monthlyDays, best, streak, first,
    daysDone: done.filter(l => l.day <= today).length, sum30, days30, todayAmt,
    todayNote: days.get(today) ? days.get(today).note || '' : '',
    todayMet: goal > 0 ? todayAmt >= goal : todayAmt > 0,
  };
}

/** 강도 0~4 (점 그리드 진하기). 목표가 있으면 목표 대비, 없으면 그 해 최대값 대비 */
export function levelOf(amount, goal, max) {
  if (!(amount > 0)) return 0;
  const r = goal > 0 ? amount / goal : amount / Math.max(1, max);
  return r >= 1 ? 4 : r >= 0.66 ? 3 : r >= 0.33 ? 2 : 1;
}

// ===================== 업적 =====================
const TH = {
  streak: [7, 30, 100, 365],
  hours: [10, 50, 100, 500, 1000],
  count: [100, 500, 1000, 5000, 10000],
  days: [30, 100, 200, 365],
};
/**
 * 내 습관들로 업적 목록을 계산. earned: 달성한 것, next: 다음 목표(진행률).
 * id는 다시 계산해도 같아야 한다 (축하 화면을 한 번만 보이려고 profiles.seenAchievements에 저장).
 */
export function achievements(trackers, byTracker, today = dayKey()) {
  const earned = [], next = [];
  let firstDay = null, firstT = null;
  for (const t of trackers) {
    const days = byTracker.get(t.id) || new Map();
    const s = statsFor(t, days, today);
    if (s.first && (!firstDay || s.first < firstDay)) { firstDay = s.first; firstT = t; }
    const tag = `${t.emoji || ''} ${t.name}`.trim();
    const ladder = (kind, list, value, mk) => {
      let gotAny = false;
      for (const n of list) {
        if (value >= n) { earned.push({ id: `${t.id}:${kind}:${n}`, tracker: t.id, ...mk(n) }); gotAny = true; }
        else { next.push({ id: `${t.id}:${kind}:${n}`, tracker: t.id, ...mk(n), progress: value / n, now: value }); break; }
      }
      return gotAny;
    };
    ladder('streak', TH.streak, s.best, n => ({ tag, big: nf(n), unit: '일 연속', title: `${tag} · ${n}일 연속`, kind: 'streak' }));
    if (t.unit === 'minutes') ladder('hours', TH.hours, s.total / 60, n => ({ tag, big: nf(n), unit: '시간', title: `${tag} · 누적 ${n}시간`, kind: 'total' }));
    if (t.unit === 'count') ladder('count', TH.count, s.total, n => ({ tag, big: nf(n), unit: t.unitLabel || '개', title: `${tag} · 누적 ${nf(n)}${t.unitLabel || '개'}`, kind: 'total' }));
    ladder('days', TH.days, s.daysDone, n => ({ tag, big: nf(n), unit: '일 기록', title: `${tag} · ${n}일 기록`, kind: 'days' }));
    // 한 달 개근: 지난 달들 중 매일 기록한 달 (이번 달은 끝나야 셈)
    const months = new Set([...days.values()].filter(l => l.amount > 0 && l.day < today.slice(0, 7)).map(l => l.day.slice(0, 7)));
    for (const ym of [...months].sort()) {
      const [y, m] = ym.split('-').map(Number), n = daysInMonth(y, m - 1);
      let all = true;
      for (let d = 1; d <= n && all; d++) all = (days.get(`${ym}-${pad(d)}`) || {}).amount > 0;
      if (all) earned.push({ id: `${t.id}:month:${ym}`, tracker: t.id, tag, big: String(m), unit: '월 개근', title: `${tag} · ${y}년 ${m}월 개근`, kind: 'month' });
    }
  }
  if (firstDay) earned.unshift({ id: 'first', tracker: firstT.id, tag: `${firstT.emoji || ''} ${firstT.name}`.trim(), big: '1', unit: '번째 기록', title: '첫 기록', kind: 'first', day: firstDay });
  next.sort((a, b) => b.progress - a.progress);
  return { earned, next };
}

// ===================== "이 속도면" 계산기 =====================
/** 기본값: 최근 30일 평균 → 하루 양(한 날 평균) × 주당 일수 */
export function paceDefaults(t, s) {
  const perDay = s.days30 ? s.sum30 / s.days30 : goalOf(t) || (t.unit === 'minutes' ? 10 : 1);
  const step = t.unit === 'minutes' ? 5 : 1;
  return {
    amount: t.unit === 'check' ? 1 : Math.max(step, Math.round(perDay / step) * step),
    perWeek: Math.max(1, Math.min(7, Math.round((s.days30 || 15) / 30 * 7))),
    weeks: 52,
  };
}
/** 계산 결과: 식과 환산 줄 */
export function paceResult(t, p) {
  const total = p.amount * p.perWeek * p.weeks;
  const lines = [];
  if (t.unit === 'minutes') {
    const h = total / 60;
    return {
      formula: [`${nf(p.amount)}분`, `${p.perWeek}일`, `${p.weeks}주`], big: h >= 10 ? nf(h) : nf1(h), unit: '시간',
      lines: [
        { op: '÷ 8시간', big: nf1(h / 8), unit: '일', note: '하루 8시간 일한다면 꼬박 이만큼' },
        { op: '÷ 2시간', big: nf(h / 2), unit: '편', note: '영화 한 편(2시간)으로 치면' },
        { op: '× 10년', big: nf(h * 10), unit: '시간', note: `10년이면 — 1만 시간의 ${nf1(h * 10 / 100)}%` },
      ],
    };
  }
  if (t.unit === 'count') {
    const u = t.unitLabel || '개';
    if (/쪽|페이지|p$/i.test(u)) lines.push({ op: '÷ 300쪽', big: nf1(total / 300), unit: '권', note: '300쪽 책으로 치면' });
    if (/잔/.test(u)) lines.push({ op: '× 250㎖', big: nf1(total * 0.25), unit: 'ℓ', note: '한 잔 250㎖로 치면' });
    if (/km/i.test(u)) lines.push({ op: '÷ 42.195', big: nf1(total / 42.195), unit: '번', note: '마라톤 완주 거리로 치면' });
    lines.push({ op: '÷ 12달', big: nf(total / 12), unit: u, note: '한 달에 이만큼' });
    lines.push({ op: '× 10년', big: nf(total * 10), unit: u, note: '10년이면' });
    return { formula: [`${nf(p.amount)}${u}`, `${p.perWeek}일`, `${p.weeks}주`], big: nf(total), unit: u, lines };
  }
  const daysY = p.perWeek * p.weeks;
  return {
    formula: [`${p.perWeek}일`, `${p.weeks}주`], big: nf(daysY), unit: '일',
    lines: [
      { op: '÷ 365일', big: nf(daysY / 365 * 100), unit: '%', note: '한 해 가운데 이만큼의 날' },
      { op: '× 10년', big: nf(daysY * 10), unit: '일', note: '10년이면' },
    ],
  };
}
