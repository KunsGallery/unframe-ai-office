// 월간·연간 리포트: 스크롤로 넘기는 스토리 (밝음 → 파랑 → 어두움) + 이미지로 저장
import { statsFor, bigParts, daysInMonth, daysInYear, dayKey, num, num1 } from './model.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad = n => String(n).padStart(2, '0');

/** 기간 안의 숫자들 */
function summarize(period, trackers, byT) {
  const today = dayKey();
  const keys = [];
  if (period.kind === 'month') for (let d = 1; d <= daysInMonth(period.y, period.m); d++) keys.push(`${period.y}-${pad(period.m + 1)}-${pad(d)}`);
  else for (let i = 0; i < daysInYear(period.y); i++) { const d = new Date(period.y, 0, 1 + i); keys.push(`${period.y}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`); }
  const passed = keys.filter(k => k <= today).length;
  const active = new Set();
  const rows = trackers.filter(t => !t.archived || keys.some(k => (byT.get(t.id) || new Map()).get(k))).map(t => {
    const days = byT.get(t.id) || new Map();
    let total = 0, n = 0;
    for (const k of keys) { const a = days.get(k) ? days.get(k).amount : 0; if (a > 0 && k <= today) { total += a; n++; active.add(k); } }
    const s = statsFor(t, days, keys[keys.length - 1] < today ? keys[keys.length - 1] : today);
    return { t, total, days: n, best: s.best, parts: bigParts(t, total, { days: n }) };
  }).filter(r => r.days > 0).sort((a, b) => b.days - a.days);
  return { keys, passed, active, rows, label: period.kind === 'month' ? `${period.y}년 ${period.m + 1}월` : `${period.y}년` };
}

/** 이 속도로 1년이면: 시간 단위 습관 중 가장 많이 한 것으로 계산식을 만든다 */
function paceLine(sum) {
  const r = sum.rows.find(x => x.t.unit === 'minutes') || sum.rows.find(x => x.t.unit === 'count') || sum.rows[0];
  if (!r || !sum.passed) return null;
  const perDay = r.total / sum.passed;
  if (r.t.unit === 'minutes') {
    const yearH = perDay * 365 / 60;
    return { r, a: `하루 평균 ${num(perDay)}분`, b: '× 365일', eq: num(yearH), unit: '시간', then: `÷ 8시간 = ${num1(yearH / 8)}일`, note: '하루 8시간 일한다면 꼬박 이만큼' };
  }
  if (r.t.unit === 'count') {
    const u = r.t.unitLabel || '개', y = perDay * 365;
    return { r, a: `하루 평균 ${num1(perDay)}${u}`, b: '× 365일', eq: num(y), unit: u, then: `× 10년 = ${num(y * 10)}${u}`, note: '10년이면' };
  }
  const y = (r.days / sum.passed) * 365;
  return { r, a: `${num(sum.passed)}일 중 ${num(r.days)}일`, b: '→ 1년이면', eq: num(y), unit: '일', then: `× 10년 = ${num(y * 10)}일`, note: '10년이면' };
}

export function openReport(period, { trackers, byT, earned, toast }) {
  const sum = summarize(period, trackers, byT), pace = paceLine(sum);
  let el = document.getElementById('lgReport');
  if (!el) { el = document.createElement('div'); el.id = 'lgReport'; el.className = 'lg-report'; document.body.appendChild(el); }
  const dots = sum.keys.map(k => `<i class="${sum.active.has(k) ? 'on' : k > dayKey() ? 'fut' : ''}"></i>`).join('');
  el.innerHTML = `
    <div class="lg-rbar"><button class="lg-btn ghost" data-r="close" type="button">← 닫기</button><button class="lg-btn primary" data-r="save" type="button">이미지로 저장</button></div>
    <section class="lg-story light">
      <div class="lg-kicker">Unframe Log · ${esc(sum.label)}</div>
      <h1 class="lg-display xl"><span class="lg-n">${num(sum.active.size)}</span><span class="lg-u">일</span></h1>
      <p class="lg-lede">${esc(sum.label)}, ${period.kind === 'month' ? `${sum.keys.length}일` : `${sum.keys.length}일`} 가운데 무언가를 기록한 날.</p>
      <div class="lg-rdots ${period.kind}">${dots}</div>
      <p class="lg-scroll">아래로 ↓</p>
    </section>
    <section class="lg-story blue">
      <div class="lg-kicker">무엇을 쌓았나</div>
      ${sum.rows.length ? sum.rows.map(r => `<div class="lg-rrow"><span>${esc(r.t.emoji || '•')} ${esc(r.t.name)}</span><b>${r.parts.num}</b><em>${esc(r.parts.unit)}</em><small>${num(r.days)}일 · 최장 ${num(r.best)}일 연속</small></div>`).join('') : '<p class="lg-lede">이 기간에는 기록이 없어요.</p>'}
    </section>
    <section class="lg-story dark">
      <div class="lg-kicker">이 속도면</div>
      ${pace ? `<p class="lg-formula">${esc(pace.r.t.emoji || '')} ${esc(pace.r.t.name)} · ${esc(pace.a)} ${esc(pace.b)}</p>
        <h2 class="lg-display xl"><span class="lg-n">${pace.eq}</span><span class="lg-u">${esc(pace.unit)}</span></h2>
        <p class="lg-formula">${esc(pace.then)}</p><p class="lg-lede">${esc(pace.note)}. 아주 짧은 노력도 이렇게 커져요.</p>` : '<p class="lg-lede">기록이 쌓이면 여기에 한 해 예상이 나와요.</p>'}
      <p class="lg-foot">지금까지 모은 업적 <b>${num(earned.length)}개</b></p>
    </section>`;
  el.hidden = false; el.scrollTop = 0;
  document.body.classList.add('lg-noscroll');
  const close = () => { el.hidden = true; document.body.classList.remove('lg-noscroll'); };
  el.onclick = async e => {
    const b = e.target.closest('[data-r]'); if (!b) return;
    if (b.dataset.r === 'close') close();
    if (b.dataset.r === 'save') {
      b.disabled = true;
      try { await saveImage(sum, pace, earned, period); } catch (err) { toast('이미지를 만들지 못했어요: ' + err.message); }
      b.disabled = false;
    }
  };
  el.onkeydown = e => { if (e.key === 'Escape') close(); };
  el.tabIndex = -1; el.focus();
}

// ---------- 이미지 (1080 × 1920, 세 가지 톤) ----------
const DISPLAY = '"Oswald", "Pretendard Variable", Pretendard, sans-serif';
const BODY = '"Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", sans-serif';
async function saveImage(sum, pace, earned, period) {
  const texts = [sum.label, ...sum.rows.map(r => r.t.name + r.parts.unit), pace ? pace.a + pace.then + pace.note : '', '가운데 무언가를 기록한 날 무엇을 쌓았나 이 속도면 업적 일 연속 최장'].join(' ');
  await Promise.all([document.fonts.load(`600 200px Oswald`, '0123456789,.'), document.fonts.load(`700 40px "Pretendard Variable"`, texts)]).catch(() => {});
  const W = 1080, H = 1920, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const band = (y, h, bg) => { g.fillStyle = bg; g.fillRect(0, y, W, h); };
  const text = (s, x, y, font, color, align = 'left') => { g.font = font; g.fillStyle = color; g.textAlign = align; g.fillText(s, x, y); return g.measureText(s).width; };
  const P = 84;
  // 1) 밝음
  band(0, 640, '#f3f1ec');
  text(`UNFRAME LOG · ${sum.label}`, P, 120, `600 34px ${BODY}`, '#1f3fbf');
  const w1 = text(num(sum.active.size), P - 6, 380, `600 260px ${DISPLAY}`, '#111');
  text('일', P + w1 + 10, 380, `700 64px ${BODY}`, '#111');
  text(`${sum.keys.length}일 가운데 무언가를 기록한 날`, P, 450, `500 36px ${BODY}`, '#555');
  // 점
  const n = sum.keys.length, cols = period.kind === 'month' ? 16 : 31, gap = (W - P * 2) / cols, r = period.kind === 'month' ? 14 : 6.5;
  sum.keys.forEach((k, i) => {
    const x = P + gap * (i % cols) + gap / 2, y = 510 + Math.floor(i / cols) * (period.kind === 'month' ? 44 : 9.5) + r;
    if (period.kind === 'year' && y > 630) return;
    g.beginPath(); g.arc(x, y, sum.active.has(k) ? r : r * 0.45, 0, Math.PI * 2);
    g.fillStyle = sum.active.has(k) ? '#1f3fbf' : '#c9c5bb'; g.fill();
  });
  // 2) 파랑
  band(640, 700, '#1f3fbf');
  text('무엇을 쌓았나', P, 730, `600 34px ${BODY}`, 'rgba(255,255,255,.75)');
  sum.rows.slice(0, 4).forEach((row, i) => {
    const y = 870 + i * 130;
    text(`${row.t.emoji || ''} ${row.t.name}`, P, y - 18, `600 36px ${BODY}`, '#fff');
    text(`${num(row.days)}일 · 최장 ${num(row.best)}일 연속`, P, y + 26, `400 28px ${BODY}`, 'rgba(255,255,255,.7)');
    const uw = text(row.parts.unit, W - P, y + 20, `700 40px ${BODY}`, '#fff', 'right');
    text(row.parts.num, W - P - uw - 12, y + 20, `600 110px ${DISPLAY}`, '#fff', 'right');
  });
  if (!sum.rows.length) text('이 기간에는 기록이 없어요', P, 900, `500 40px ${BODY}`, '#fff');
  // 3) 어두움
  band(1340, 580, '#0e0e10');
  text('이 속도면', P, 1430, `600 34px ${BODY}`, '#7f95ff');
  if (pace) {
    text(`${pace.r.t.emoji || ''} ${pace.r.t.name} · ${pace.a} ${pace.b}`, P, 1500, `500 36px ${BODY}`, 'rgba(255,255,255,.8)');
    const w3 = text(pace.eq, P - 6, 1710, `600 220px ${DISPLAY}`, '#fff');
    text(pace.unit, P + w3 + 10, 1710, `700 60px ${BODY}`, '#fff');
    text(pace.then, P, 1790, `600 40px ${BODY}`, '#7f95ff');
  }
  text(`업적 ${earned.length}개 · unframe-office.netlify.app`, P, 1870, `400 26px ${BODY}`, 'rgba(255,255,255,.45)');

  const blob = await new Promise(res => c.toBlob(res, 'image/png'));
  const name = `unframe-log-${period.kind === 'month' ? `${period.y}-${pad(period.m + 1)}` : period.y}.png`;
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ files: [file], title: `Unframe Log ${sum.label}` }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
