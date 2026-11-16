// Unframe Log 그림: 365점 그리드, 원형 연간 달력, 월별 막대 (SVG 문자열)
import { daysInMonth, daysInYear, levelOf, dayOfYear } from './model.js';

const pad = n => String(n).padStart(2, '0');
const OP = [0, 0.35, 0.55, 0.78, 1];

function yearMax(days, year) {
  let m = 0;
  for (const l of days.values()) if (+l.day.slice(0, 4) === year) m = Math.max(m, l.amount);
  return m;
}

/** 365점 그리드: 12줄(달) × 31칸(날). 오늘은 고리, 앞으로 올 날은 옅게 */
export function yearGrid({ year, days, goal, color, today }) {
  const max = yearMax(days, year), cell = 11, r = 4, left = 30, top = 4;
  let out = '';
  for (let m = 0; m < 12; m++) {
    const y = top + m * cell + cell / 2;
    out += `<text x="${left - 8}" y="${y + 3.2}" text-anchor="end" class="g-lbl">${m + 1}</text>`;
    for (let d = 1; d <= daysInMonth(year, m); d++) {
      const k = `${year}-${pad(m + 1)}-${pad(d)}`, x = left + (d - 1) * cell + cell / 2;
      const a = days.get(k) ? days.get(k).amount : 0, lv = levelOf(a, goal, max);
      const future = k > today;
      if (lv) out += `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" fill-opacity="${OP[lv]}"><title>${k} · ${a}</title></circle>`;
      else out += `<circle cx="${x}" cy="${y}" r="${future ? 1.4 : 3.2}" class="${future ? 'g-fut' : 'g-off'}"><title>${k}</title></circle>`;
      if (k === today) out += `<circle cx="${x}" cy="${y}" r="${r + 1.8}" fill="none" stroke="currentColor" stroke-width="1.3"/>`;
    }
  }
  return `<svg class="g-year" viewBox="0 0 ${left + 31 * cell + 2} ${top + 12 * cell + 4}" role="img" aria-label="${year}년 날짜별 기록">${out}</svg>`;
}

/** 원형 연간 달력: 한 해의 날들이 고리를 따라 돈다. 한 날 = 점 하나 (파랑 화면용, 흰 점) */
export function yearRing({ year, days, goal, today, center }) {
  const n = daysInYear(year), max = yearMax(days, year), C = 180, R = 150;
  let out = '';
  for (let m = 0; m < 12; m++) {
    const i0 = dayOfYear(`${year}-${pad(m + 1)}-01`), a = (i0 / n) * 2 * Math.PI - Math.PI / 2;
    const am = ((i0 + daysInMonth(year, m) / 2) / n) * 2 * Math.PI - Math.PI / 2;
    out += `<line x1="${C + Math.cos(a) * (R - 22)}" y1="${C + Math.sin(a) * (R - 22)}" x2="${C + Math.cos(a) * (R + 14)}" y2="${C + Math.sin(a) * (R + 14)}" class="r-tick"/>`;
    out += `<text x="${C + Math.cos(am) * (R + 22)}" y="${C + Math.sin(am) * (R + 22) + 3.5}" text-anchor="middle" class="r-lbl">${m + 1}</text>`;
  }
  for (let i = 0; i < n; i++) {
    const d = new Date(year, 0, 1 + i), k = `${year}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const amt = days.get(k) ? days.get(k).amount : 0, lv = levelOf(amt, goal, max);
    const a = (i / n) * 2 * Math.PI - Math.PI / 2;
    const rr = lv ? R - 8 + lv * 3.2 : R - 6;
    const x = C + Math.cos(a) * rr, y = C + Math.sin(a) * rr;
    if (lv) out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${1.4 + lv * 0.5}" class="r-on" fill-opacity="${OP[lv]}"/>`;
    else out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${k > today ? 0.8 : 1.2}" class="r-off"/>`;
    if (k === today) out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5.5" class="r-today"/>`;
  }
  return `<svg class="g-ring" viewBox="0 0 ${C * 2} ${C * 2}" role="img" aria-label="${year}년 원형 달력">${out}
    <text x="${C}" y="${C + 8}" text-anchor="middle" class="r-big">${center.big}</text>
    <text x="${C}" y="${C + 36}" text-anchor="middle" class="r-sub">${center.sub}</text></svg>`;
}

/** 월별 막대 */
export function monthBars({ values, color, fmt, current }) {
  const max = Math.max(1, ...values), W = 360, H = 150, bw = W / 12;
  let out = '';
  values.forEach((v, i) => {
    const h = Math.round((v / max) * (H - 34)), x = i * bw + 4, y = H - 18 - h;
    out += `<rect x="${x}" y="${y}" width="${bw - 8}" height="${Math.max(h, v > 0 ? 2 : 0)}" fill="${color}" fill-opacity="${i === current ? 1 : 0.55}" rx="1"><title>${i + 1}월 · ${fmt(v)}</title></rect>`;
    if (v > 0 && v === max) out += `<text x="${x + (bw - 8) / 2}" y="${y - 4}" text-anchor="middle" class="b-top">${fmt(v)}</text>`;
    out += `<text x="${x + (bw - 8) / 2}" y="${H - 4}" text-anchor="middle" class="b-lbl${i === current ? ' b-now' : ''}">${i + 1}</text>`;
  });
  return `<svg class="g-bars" viewBox="0 0 ${W} ${H}" role="img" aria-label="월별 기록">${out}</svg>`;
}
