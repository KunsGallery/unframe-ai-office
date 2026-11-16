// Unframe Log 화면: 오늘 / 내 기록 / 성취 (+ 축하 화면, 습관 만들기)
import {
  dayKey, fmtDate, bigParts, fmtAmount, goalOf, indexLogs, statsFor, achievements, paceDefaults, paceResult,
  STEPS, COLORS, UNIT_KO, num, num1, daysInYear, dayOfYear, vivid,
} from './model.js';
import { yearGrid, yearRing, monthBars } from './charts.js';
import { openReport } from './report.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = id => document.getElementById(id);

export function initLog(ctx) {
  const { store, me, members, avatar, toast, toastAction, saveSeen } = ctx;
  const others = members.filter(m => m.id !== me.id);
  let trackers = [], logs = [], byT = new Map(), tLoaded = false, lLoaded = false;
  let profileLoaded = false, seen;          // seen: undefined = 아직 한 번도 저장 안 함
  let current = 'today', sel = null, year = new Date().getFullYear(), showArchived = false;
  const listeners = [];                    // 문서·캘린더가 데이터 바뀜을 듣는다
  const pace = {};                          // 습관별 계산기 값
  const undo = [];                          // 이번 접속에서 누른 기록 (되돌리기용)
  const shown = {};                         // 오늘 카드에 마지막으로 보인 양 (숫자 올라가는 애니메이션)
  const keepId = 'unframe-log-sel';
  try { sel = localStorage.getItem(keepId); } catch {}

  const mine = () => trackers.filter(t => t.owner === me.id && !t.archived).sort((a, b) => (a.order || 0) - (b.order || 0));
  const theirs = id => trackers.filter(t => t.owner === id && !t.archived && !t.private).sort((a, b) => (a.order || 0) - (b.order || 0));
  const S = t => statsFor(t, byT.get(t.id), dayKey());

  store.onTrackers(list => { trackers = list.map(t => ({ ...t, color: vivid(t.color) })); tLoaded = true; changed(); }, e => toast('습관을 불러오지 못했어요 (' + (e.code || e.message) + ')'));
  store.onLogs(list => { logs = list; byT = indexLogs(logs); lLoaded = true; changed(); }, e => toast('기록을 불러오지 못했어요 (' + (e.code || e.message) + ')'));

  function changed() { render(); checkAchievements(); if (tLoaded && lLoaded) listeners.forEach(fn => fn()); }
  function render() {
    if (!tLoaded || !lLoaded) return;
    if (current === 'today') renderToday();
    else if (current === 'log') renderDetail();
    else if (current === 'achieve') renderAchieve();
  }

  // ==================================================================
  //  오늘
  // ==================================================================
  function renderToday() {
    const el = $('paneToday'), list = mine(), today = dayKey();
    const stats = list.map(S), met = stats.filter(s => s.todayMet).length;
    const top = Math.max(0, ...stats.map(s => s.streak));
    if (!list.length) { el.innerHTML = '<div id="lgPetSlot"></div>' + emptyToday(); ctx.afterToday && ctx.afterToday(); return; }
    el.innerHTML = `<div id="lgPetSlot"></div>
      <section class="lg-sec light lg-hero">
        <div class="lg-kicker">${fmtDate(today)}</div>
        <h1 class="lg-display"><span class="lg-n">${met}</span><span class="lg-of">/${list.length}</span></h1>
        <p class="lg-lede">오늘 목표를 채운 습관${top ? ` · 가장 긴 연속 <b>🔥 ${top}일</b>` : ''}</p>
      </section>
      <section class="lg-list">${list.map((t, i) => card(t, stats[i])).join('')}
        <button class="lg-add" data-act="new" type="button">+ 새 습관</button>
      </section>
      ${others.map(partnerBlock).join('')}`;
    ctx.afterToday && ctx.afterToday();
    // 숫자가 올라가는 애니메이션
    list.forEach((t, i) => {
      const v = stats[i].todayAmt, before = shown[t.id + today];
      shown[t.id + today] = v;
      if (before == null || before === v) return;
      const n = el.querySelector(`[data-id="${t.id}"] .lg-amt .lg-n`);
      if (n && t.unit !== 'check') countUp(n, before, v, t);
      const c = el.querySelector(`[data-id="${t.id}"]`);
      if (c && v > before) { c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); floatPlus(c, t, v - before); }
    });
  }
  function card(t, s) {
    const goal = s.goal, pct = goal ? Math.min(100, (s.todayAmt / goal) * 100) : s.todayAmt > 0 ? 100 : 0;
    const p = t.unit === 'check' ? null : bigParts({ ...t, unit: t.unit === 'minutes' ? 'count' : t.unit, unitLabel: t.unit === 'minutes' ? '분' : t.unitLabel }, s.todayAmt);
    const canUndo = undo.some(u => u.t.id === t.id && u.day === dayKey());
    const btns = t.unit === 'check'
      ? `<button class="lg-do${s.todayAmt > 0 ? ' on' : ''}" data-act="check" type="button">${s.todayAmt > 0 ? '✓ 했어요' : '했어요'}</button>`
      : STEPS[t.unit].map(n => `<button class="lg-step" data-add="${n}" type="button">+${n}</button>`).join('') + `<button class="lg-step lg-more" data-act="custom" type="button" aria-label="직접 입력">…</button>`;
    return `<article class="lg-card${s.todayMet ? ' met' : ''}" data-id="${t.id}" style="--c:${esc(t.color || '#8b9cff')}">
      <header><button class="lg-name" data-act="open" type="button"><span class="lg-emo">${esc(t.emoji || '•')}</span>${esc(t.name)}${t.private ? ' <small title="나만 보기">🔒</small>' : ''}</button>
        ${s.streak ? `<span class="lg-streak" title="연속 기록">🔥 ${s.streak}일</span>` : '<span class="lg-streak"></span>'}<button class="lg-ico" data-act="note" type="button" aria-label="오늘 한마디">✎</button></header>
      <div class="lg-amt">${t.unit === 'check'
        ? `<span class="lg-n">${s.todayAmt > 0 ? '✓' : '—'}</span><span class="lg-goal">${s.streak ? `${s.streak}일째` : '오늘 했나요?'}</span>`
        : `<span class="lg-n" data-v="${s.todayAmt}">${p.num}</span><span class="lg-u">${esc(p.unit)}</span>${goal ? `<span class="lg-goal">/ ${esc(fmtAmount(t, goal))}</span>` : ''}`}</div>
      <div class="lg-bar"><i style="width:${pct}%"></i></div>
      <div class="lg-btns">${btns}<button class="lg-undo" data-act="undo" type="button" ${canUndo ? '' : 'hidden'} aria-label="되돌리기" title="되돌리기">↶</button></div>
      <form class="lg-custom" hidden><input type="number" inputmode="numeric" min="1" max="100000" placeholder="${t.unit === 'minutes' ? '분' : esc(t.unitLabel || '개')}" aria-label="직접 입력"><button class="lg-step" type="submit">더하기</button></form>
      <form class="lg-noteform" hidden><input type="text" maxlength="200" placeholder="오늘 한마디 (선택)" value="${esc(s.todayNote)}" aria-label="오늘 한마디"><button class="lg-step" type="submit">저장</button></form>
      ${s.todayNote ? `<p class="lg-note">“${esc(s.todayNote)}”</p>` : ''}
    </article>`;
  }
  function partnerBlock(m) {
    const list = theirs(m.id), mood = ctx.moodOf ? ctx.moodOf(m.id) : null;
    if (!list.length && !mood) return '';
    const st = list.map(S), met = st.filter(s => s.todayMet).length, top = Math.max(0, ...st.map(s => s.streak));
    return `<section class="lg-partner">
      <div class="lg-ph"><img alt="" src="${avatar(m)}"><b>${esc(m.name)}님</b> <span class="lg-pn">${met}/${list.length} 완료</span>${top ? ` <span class="lg-streak">🔥${top}일</span>` : ''}${mood && mood.score ? ` <span class="lg-pmood" title="오늘 기분">${ctx.moodEmoji(mood.score)}</span>` : ''}</div>
      ${mood && (mood.note || mood.lunch) ? `<p class="lg-pnote">${mood.note ? `“${esc(mood.note)}”` : ''}${mood.lunch ? ` 🍱 ${esc(mood.lunch)}` : ''}</p>` : ''}
      <ul>${list.map((t, i) => `<li class="${st[i].todayMet ? 'met' : ''}" style="--c:${esc(t.color || '#8b9cff')}"><span>${esc(t.emoji || '•')} ${esc(t.name)}</span><b>${st[i].todayAmt ? esc(fmtAmount(t, st[i].todayAmt)) : '—'}</b></li>`).join('')}</ul>
    </section>`;
  }
  const TEMPLATES = [
    { name: '독서', emoji: '📖', unit: 'count', unitLabel: '쪽', dailyGoal: 20, color: '#8b9cff' },
    { name: '운동', emoji: '🏃', unit: 'minutes', unitLabel: '', dailyGoal: 30, color: '#fb7185' },
    { name: '물 마시기', emoji: '💧', unit: 'count', unitLabel: '잔', dailyGoal: 8, color: '#34d399' },
    { name: '일기', emoji: '📓', unit: 'check', unitLabel: '', dailyGoal: 1, color: '#67e8f9' },
  ];
  function emptyToday() {
    return `<section class="lg-sec light lg-hero">
      <div class="lg-kicker">${fmtDate(dayKey())}</div>
      <h1 class="lg-display sm">하루 <span class="lg-n">10</span>분이면<br>1년에 <span class="lg-n">60</span>시간</h1>
      <p class="lg-lede">아주 짧은 노력도 매일 쌓이면 커져요. 습관을 하나 만들고, 한 번 눌러 기록해 보세요.</p>
      <div class="lg-templates">${TEMPLATES.map((x, i) => `<button class="lg-tpl" data-tpl="${i}" type="button"><span>${x.emoji}</span>${x.name}<small>${x.unit === 'check' ? '했다/안 했다' : `하루 ${fmtAmount(x, x.dailyGoal)}`}</small></button>`).join('')}</div>
      <button class="lg-add" data-act="new" type="button">+ 직접 만들기</button>
    </section>${others.map(partnerBlock).join('')}`;
  }
  function countUp(el, from, to, t) {
    const t0 = performance.now(), dur = 450;
    const fmt = v => (t.unit === 'minutes' ? num(v) : num(v));
    const step = now => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function floatPlus(c, t, d) {
    const f = document.createElement('span');
    f.className = 'lg-float'; f.textContent = t.unit === 'check' ? '✓' : `+${num(d)}`;
    c.querySelector('.lg-amt').appendChild(f);
    setTimeout(() => f.remove(), 900);
  }

  async function addAmount(t, delta) {
    const day = dayKey(), cur = S(t).todayAmt;
    delta = Math.max(-cur, delta);
    if (!delta) return;
    undo.push({ t, day, delta });
    store.add(t, day, delta).catch(e => toast('기록하지 못했어요 (' + (e.code || e.message) + ')'));
    const label = t.unit === 'minutes' ? `${num(delta)}분` : `${num(delta)}${t.unitLabel || '개'}`;
    toastAction(`${t.emoji || ''} ${t.name} +${label}`, '되돌리기', () => undoLast(t));
  }
  function toggleCheck(t) {
    const day = dayKey(), was = S(t).todayAmt;
    undo.push({ t, day, set: was });
    store.set(t, day, was > 0 ? 0 : 1).catch(e => toast('기록하지 못했어요 (' + (e.code || e.message) + ')'));
    toastAction(was > 0 ? `${t.emoji || ''} ${t.name} 기록을 지웠어요` : `${t.emoji || ''} ${t.name} 했어요 ✓`, '되돌리기', () => undoLast(t));
  }
  function undoLast(t) {
    const i = undo.map(u => u.t.id).lastIndexOf(t.id);
    if (i < 0) return;
    const [u] = undo.splice(i, 1);
    if ('set' in u) store.set(u.t, u.day, u.set);
    else {
      const days = byT.get(t.id), cur = days && days.get(u.day) ? days.get(u.day).amount : 0;
      store.add(u.t, u.day, -Math.min(cur, u.delta));
    }
    toast('↶ 되돌렸어요');
  }

  $('paneToday').addEventListener('click', e => {
    const tpl = e.target.closest('[data-tpl]');
    if (tpl) { openTrackerDialog(null, TEMPLATES[+tpl.dataset.tpl]); return; }
    const b = e.target.closest('[data-add], [data-act]'); if (!b) return;
    const c = b.closest('[data-id]'), t = c && trackers.find(x => x.id === c.dataset.id);
    const act = b.dataset.act;
    if (act === 'new') return openTrackerDialog();
    if (!t) return;
    if (b.dataset.add) return addAmount(t, +b.dataset.add);
    if (act === 'check') return toggleCheck(t);
    if (act === 'undo') return undoLast(t);
    if (act === 'open') { sel = t.id; ctx.go('log'); return; }
    if (act === 'custom' || act === 'note') {
      const f = c.querySelector(act === 'custom' ? '.lg-custom' : '.lg-noteform');
      f.hidden = !f.hidden; if (!f.hidden) f.querySelector('input').focus();
    }
  });
  $('paneToday').addEventListener('submit', e => {
    e.preventDefault();
    const c = e.target.closest('[data-id]'), t = c && trackers.find(x => x.id === c.dataset.id); if (!t) return;
    const v = e.target.querySelector('input').value;
    if (e.target.classList.contains('lg-custom')) { const n = Math.round(+v); if (n > 0 && n <= 100000) addAmount(t, n); }
    else store.note(t, dayKey(), v.trim().slice(0, 200)).then(() => toast('✎ 오늘 한마디를 남겼어요')).catch(err => toast('저장하지 못했어요 (' + (err.code || err.message) + ')'));
    e.target.hidden = true;
  });

  // ==================================================================
  //  내 기록 (습관 하나 자세히)
  // ==================================================================
  function renderDetail() {
    const el = $('paneLog'), list = mine();
    const archived = trackers.filter(t => t.owner === me.id && t.archived);
    if (!list.length && !archived.length) { el.innerHTML = `<section class="lg-sec light"><div class="lg-kicker">내 기록</div><h1 class="lg-display sm">아직 습관이 없어요</h1><button class="lg-add" data-act="new" type="button">+ 새 습관</button></section>`; return; }
    let t = trackers.find(x => x.id === sel && x.owner === me.id) || list[0] || archived[0];
    sel = t.id; try { localStorage.setItem(keepId, sel); } catch {}
    const today = dayKey(), s = statsFor(t, byT.get(t.id), today, year), days = byT.get(t.id) || new Map();
    const thisYear = +today.slice(0, 4), yDays = daysInYear(year);
    const passed = year < thisYear ? yDays : year > thisYear ? 0 : dayOfYear(today) + 1;
    const big = bigParts(t, s.yearTotal, { days: s.yearDays }), life = bigParts(t, s.total, { days: s.daysDone });
    if (!pace[t.id]) pace[t.id] = paceDefaults(t, statsFor(t, days, today));
    const fmtV = v => (t.unit === 'minutes' ? (v >= 60 ? num(v / 60) + 'h' : num(v) + '분') : t.unit === 'check' ? num(v) + '일' : num(v));
    const monthVals = t.unit === 'check' ? s.monthlyDays : s.monthly;
    el.innerHTML = `
      <nav class="lg-chips" aria-label="내 습관">${list.map(x => `<button type="button" class="lg-chip${x.id === t.id ? ' on' : ''}" data-sel="${x.id}" style="--c:${esc(x.color)}">${esc(x.emoji || '•')} ${esc(x.name)}</button>`).join('')}
        ${archived.length ? `<button type="button" class="lg-chip ghost" data-act="arch">${showArchived ? '보관함 닫기' : `보관함 ${archived.length}`}</button>` : ''}
        ${showArchived ? archived.map(x => `<button type="button" class="lg-chip ghost${x.id === t.id ? ' on' : ''}" data-sel="${x.id}">📦 ${esc(x.name)}</button>`).join('') : ''}
        <button type="button" class="lg-chip ghost" data-act="new">+ 새 습관</button></nav>
      <section class="lg-sec light" style="--c:${esc(t.color)}">
        <div class="lg-kicker">${esc(t.emoji || '')} ${esc(t.name)} · ${year}년${t.archived ? ' · 보관됨' : ''}${t.private ? ' · 🔒 나만 보기' : ''}</div>
        <h1 class="lg-display xl"><span class="lg-n">${big.num}</span><span class="lg-u">${esc(big.unit)}</span></h1>
        <p class="lg-lede">${t.unit === 'check' ? `${year}년에 <b>${num(s.yearDays)}일</b> 했어요` : `${year}년에 쌓인 양`}. 처음부터 모두 합치면 <b>${life.num}${esc(life.unit)}</b>${s.first ? `, 첫 기록은 ${s.first.replaceAll('-', '.')}` : ''}.</p>
        <div class="lg-yearhead"><button class="lg-yr" data-year="-1" type="button" aria-label="이전 해">‹</button><b>${year}</b><button class="lg-yr" data-year="1" type="button" aria-label="다음 해" ${year >= thisYear ? 'disabled' : ''}>›</button>
          <span class="lg-of365">${yDays}일 가운데 <b>${num(s.yearDays)}일</b></span></div>
        ${yearGrid({ year, days, goal: s.goal, color: t.color || '#8b9cff', today })}
        <div class="lg-legend"><span>적게</span>${[1, 2, 3, 4].map(l => `<i style="opacity:${[0, .35, .55, .78, 1][l]}"></i>`).join('')}<span>${s.goal ? '목표 이상' : '많이'}</span></div>
        <div class="lg-stats">
          <div><b>${num(s.streak)}</b><span>일 연속 중</span></div>
          <div><b>${num(s.best)}</b><span>일 최장 연속</span></div>
          <div><b>${bigParts(t, s.monthTotal, { days: s.monthDays }).num}</b><span>${esc(bigParts(t, s.monthTotal, { days: s.monthDays }).unit)} 이번 달</span></div>
          <div><b>${num(s.days30)}</b><span>일 / 최근 30일</span></div>
        </div>
      </section>
      <section class="lg-sec blue">
        <div class="lg-kicker">한 해를 한 바퀴로</div>
        ${yearRing({ year, days, goal: s.goal, today, center: { big: num(s.yearDays), sub: `/ ${yDays}일` } })}
        <p class="lg-lede">${passed ? `지나간 ${num(passed)}일 가운데 <b>${num(s.yearDays)}일</b>, ${num((s.yearDays / passed) * 100)}%를 채웠어요.` : '아직 오지 않은 해예요.'}</p>
      </section>
      <section class="lg-sec dark" id="lgCalc">${calcHtml(t)}</section>
      <section class="lg-sec light">
        <div class="lg-kicker">${year}년 월별</div>
        ${monthBars({ values: monthVals, color: t.color || '#8b9cff', fmt: fmtV, current: year === thisYear ? new Date().getMonth() : -1 })}
        <div class="lg-actions">
          <button class="lg-btn" data-act="edit" type="button">✎ 습관 고치기</button>
          <button class="lg-btn" data-act="archive" type="button">${t.archived ? '📦 보관 해제' : '📦 보관하기'}</button>
        </div>
      </section>`;
  }
  function calcHtml(t) {
    const p = pace[t.id], r = paceResult(t, p);
    const u = t.unit === 'minutes' ? '분' : t.unitLabel || '개';
    const stp = (key, val, unit, label) => `<div class="lg-stp"><button type="button" data-pace="${key}" data-d="-1" aria-label="${label} 줄이기">−</button>
      <div><b>${num(val)}</b><small>${esc(unit)}</small><em>${label}</em></div><button type="button" data-pace="${key}" data-d="1" aria-label="${label} 늘리기">+</button></div>`;
    return `<div class="lg-kicker">이 속도면</div>
      <p class="lg-lede">최근 30일 평균에서 시작해요. −/+로 바꿔 보세요.</p>
      <div class="lg-calc">${t.unit === 'check' ? '' : stp('amount', p.amount, u, '하루') + '<span class="lg-x">×</span>'}
        ${stp('perWeek', p.perWeek, '일', '일주일에')}<span class="lg-x">×</span>${stp('weeks', p.weeks, '주', '1년 중')}</div>
      <div class="lg-eq"><span class="lg-x">=</span><span class="lg-n">${r.big}</span><span class="lg-u">${esc(r.unit)}</span><small>1년에</small></div>
      <ul class="lg-conv">${r.lines.map(l => `<li><span class="op">${esc(l.op)}</span><b>${l.big}</b><span class="u">${esc(l.unit)}</span><small>${esc(l.note)}</small></li>`).join('')}</ul>
      <button class="lg-btn ghost" data-act="pace-reset" type="button">내 평균으로 되돌리기</button>`;
  }
  function stepPace(t, key, d) {
    const p = pace[t.id];
    if (key === 'amount') { const st = t.unit === 'minutes' ? 5 : p.amount >= 50 ? 5 : 1; p.amount = Math.max(st, Math.min(100000, p.amount + d * st)); }
    if (key === 'perWeek') p.perWeek = Math.max(1, Math.min(7, p.perWeek + d));
    if (key === 'weeks') p.weeks = Math.max(1, Math.min(52, p.weeks + d));
    $('lgCalc').innerHTML = calcHtml(t);
    $('lgCalc').querySelector(`[data-pace="${key}"][data-d="${d}"]`)?.focus({ preventScroll: true });
    const n = $('lgCalc').querySelector('.lg-eq .lg-n'); n.classList.remove('pop'); void n.offsetWidth; n.classList.add('pop');
  }
  // −/+ 길게 누르면 계속
  let hold = null;
  const stopHold = () => { clearTimeout(hold); clearInterval(hold); hold = null; };
  $('paneLog').addEventListener('pointerdown', e => {
    const b = e.target.closest('[data-pace]'); if (!b) return;
    const t = trackers.find(x => x.id === sel), key = b.dataset.pace, d = +b.dataset.d;
    e.preventDefault(); stepPace(t, key, d);
    hold = setTimeout(() => { hold = setInterval(() => stepPace(t, key, d), 90); }, 420);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(n => $('paneLog').addEventListener(n, stopHold));
  $('paneLog').addEventListener('keydown', e => {
    const b = e.target.closest('[data-pace]');
    if (b && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); stepPace(trackers.find(x => x.id === sel), b.dataset.pace, +b.dataset.d); }
  });
  $('paneLog').addEventListener('click', e => {
    const b = e.target.closest('[data-sel], [data-act], [data-year]'); if (!b) return;
    const t = trackers.find(x => x.id === sel);
    if (b.dataset.sel) { sel = b.dataset.sel; year = new Date().getFullYear(); renderDetail(); return; }
    if (b.dataset.year) { year += +b.dataset.year; renderDetail(); return; }
    const act = b.dataset.act;
    if (act === 'new') openTrackerDialog();
    else if (act === 'arch') { showArchived = !showArchived; renderDetail(); }
    else if (act === 'edit') openTrackerDialog(t);
    else if (act === 'archive') store.updateTracker(t.id, { archived: !t.archived }).then(() => toast(t.archived ? '📦 다시 꺼냈어요' : '📦 보관했어요. 기록은 그대로 남아요'));
    else if (act === 'pace-reset') { pace[t.id] = paceDefaults(t, S(t)); $('lgCalc').innerHTML = calcHtml(t); }
  });

  // ==================================================================
  //  성취
  // ==================================================================
  const myAch = () => achievements(trackers.filter(t => t.owner === me.id), byT, dayKey());
  function renderAchieve() {
    const el = $('paneAchieve'), { earned, next } = myAch();
    const now = new Date(), ym = `${now.getFullYear()}년 ${now.getMonth() + 1}월`;
    const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    el.innerHTML = `
      <section class="lg-sec light">
        <div class="lg-kicker">성취</div>
        <h1 class="lg-display xl"><span class="lg-n">${earned.length}</span><span class="lg-u">개</span></h1>
        <p class="lg-lede">지금까지 모은 업적. 꾸준함이 만든 숫자예요.</p>
        <div class="lg-reports">
          <button class="lg-rep" data-rep="month" type="button"><small>월간 리포트</small><b>${ym}</b></button>
          <button class="lg-rep blue" data-rep="lastmonth" type="button"><small>월간 리포트</small><b>${last.getFullYear()}년 ${last.getMonth() + 1}월</b></button>
          <button class="lg-rep dark" data-rep="year" type="button"><small>연간 리포트</small><b>${now.getFullYear()}년</b></button>
        </div>
      </section>
      ${next.length ? `<section class="lg-sec light tight"><div class="lg-kicker">다음 목표</div>
        <ul class="lg-next">${next.slice(0, 6).map(a => `<li><div><b>${esc(a.title)}</b><span>${esc(progressText(a))}</span></div><div class="lg-bar"><i style="width:${Math.min(100, a.progress * 100)}%"></i></div></li>`).join('')}</ul></section>` : ''}
      <section class="lg-sec light tight"><div class="lg-kicker">모은 업적</div>
        ${earned.length ? `<ul class="lg-badges">${[...earned].reverse().map(a => {
          const t = trackers.find(x => x.id === a.tracker);
          return `<li style="--c:${esc((t && t.color) || '#8b9cff')}"><b>${esc(a.big)}</b><span class="u">${esc(a.unit)}</span><small>${esc(a.kind === 'first' ? `${a.tag} · ${a.day.replaceAll('-', '.')}` : a.tag)}</small></li>`;
        }).join('')}</ul>` : '<p class="lg-lede">첫 기록을 남기면 첫 업적이 생겨요.</p>'}
      </section>`;
  }
  function progressText(a) {
    const t = trackers.find(x => x.id === a.tracker);
    if (a.kind === 'total' && t && t.unit === 'minutes') return `지금 ${num1(Math.floor(a.now * 10) / 10)}시간 · ${num1(Math.max(0.1, Math.ceil((+a.big.replace(/,/g, '') - a.now) * 10) / 10))}시간 남음`;
    const n = +a.big.replace(/,/g, '');
    const u = a.kind === 'total' ? (t && t.unitLabel) || '개' : '일';
    return `지금 ${num(a.now)}${u} · ${num(Math.max(0, n - a.now))}${u} 남음`;
  }
  $('paneAchieve').addEventListener('click', e => {
    const b = e.target.closest('[data-rep]'); if (!b) return;
    const now = new Date();
    const period = b.dataset.rep === 'year' ? { kind: 'year', y: now.getFullYear() }
      : b.dataset.rep === 'lastmonth' ? { kind: 'month', y: new Date(now.getFullYear(), now.getMonth() - 1, 1).getFullYear(), m: new Date(now.getFullYear(), now.getMonth() - 1, 1).getMonth() }
      : { kind: 'month', y: now.getFullYear(), m: now.getMonth() };
    openReport(period, { me, trackers: trackers.filter(t => t.owner === me.id), byT, earned: myAch().earned, toast, moods: ctx.moods ? ctx.moods().filter(x => x.owner === me.id) : [] });
  });

  // ==================================================================
  //  업적 달성 → 축하 화면 (한 번만)
  // ==================================================================
  const RANK = { streak: 5, total: 4, month: 3, days: 2, first: 1 };
  function checkAchievements() {
    if (!tLoaded || !lLoaded || !profileLoaded) return;
    const { earned } = myAch();
    if (!seen) {   // 처음: 지금까지 모은 건 조용히 저장만 (한꺼번에 축하하지 않게)
      seen = new Set(earned.map(a => a.id));
      saveSeen([...seen]).catch(() => {});
      return;
    }
    const fresh = earned.filter(a => !seen.has(a.id));
    if (!fresh.length) return;
    fresh.forEach(a => seen.add(a.id));
    saveSeen([...seen]).catch(() => {});
    fresh.sort((a, b) => RANK[b.kind] - RANK[a.kind]);
    celebrate(fresh[0], fresh.length - 1);
  }
  function celebrate(a, more) {
    const t = trackers.find(x => x.id === a.tracker);
    let el = $('lgCelebrate');
    if (!el) { el = document.createElement('div'); el.id = 'lgCelebrate'; el.className = 'lg-celebrate'; document.body.appendChild(el); }
    const dots = Array.from({ length: 36 }, (_, i) => `<i style="--a:${(i / 36) * 360}deg;--d:${120 + (i % 5) * 40}px;--s:${4 + (i % 3) * 3}px;animation-delay:${(i % 6) * 40}ms"></i>`).join('');
    el.innerHTML = `<div class="lg-cbox" role="dialog" aria-modal="true" aria-label="업적 달성">
      <div class="lg-burst">${dots}</div>
      <div class="lg-kicker">업적 달성${t ? ` · ${esc(t.emoji || '')} ${esc(t.name)}` : ''}</div>
      <div class="lg-cnum">${esc(a.big)}</div><div class="lg-cunit">${esc(a.unit)}</div>
      <p>${esc(a.title)}${more > 0 ? ` <small>외 ${more}개</small>` : ''}</p>
      <button class="lg-btn light" type="button">멋져요</button></div>`;
    el.hidden = false;
    el.querySelector('button').focus();
    el.onclick = e => { if (e.target === el || e.target.closest('button')) { el.hidden = true; } };
    el.onkeydown = e => { if (e.key === 'Escape') el.hidden = true; };
  }

  // ==================================================================
  //  습관 만들기·고치기
  // ==================================================================
  let dlg = null, editing = null;
  function openTrackerDialog(t = null, preset = null) {
    editing = t;
    if (!dlg) {
      dlg = document.createElement('dialog'); dlg.id = 'lgTrackerDlg'; dlg.className = 'lg-dlg';
      document.body.appendChild(dlg);
      dlg.addEventListener('change', e => { if (e.target.name === 'unit') syncUnit(); });
      dlg.addEventListener('click', e => { if (e.target.dataset.close != null) dlg.close(); });
      dlg.addEventListener('submit', onSubmit);
    }
    const v = t || preset || { name: '', emoji: '', unit: 'minutes', unitLabel: '', dailyGoal: 20, color: COLORS[mine().length % COLORS.length], private: false };
    dlg.innerHTML = `<form method="dialog">
      <h3>${t ? '습관 고치기' : '새 습관'}</h3>
      <div class="lg-frow"><label class="lg-f" style="flex:0 0 70px">이모지<input name="emoji" maxlength="8" value="${esc(v.emoji)}" placeholder="😀" readonly data-emoji-picker class="em-field" aria-label="이모지 고르기"></label>
        <label class="lg-f">이름<input name="name" maxlength="40" required value="${esc(v.name)}" placeholder="예: 독서, 영어, 스케치"></label></div>
      <fieldset class="lg-f"><legend>무엇으로 셀까요?</legend>
        ${['minutes', 'count', 'check'].map(u => `<label class="lg-radio"><input type="radio" name="unit" value="${u}" ${v.unit === u ? 'checked' : ''} ${t ? 'disabled' : ''}>${UNIT_KO[u]}</label>`).join('')}
        ${t ? '<small class="lg-hint">기록 단위는 만든 뒤에 바꿀 수 없어요.</small>' : ''}</fieldset>
      <div class="lg-frow"><label class="lg-f" data-for="count">단위 이름<input name="unitLabel" maxlength="6" value="${esc(v.unitLabel || '')}" placeholder="장, 쪽, 잔, 회"></label>
        <label class="lg-f" data-for="goal">하루 목표 <span id="lgGoalU"></span><input name="dailyGoal" type="number" min="0" max="100000" inputmode="numeric" value="${v.unit === 'check' ? 1 : +v.dailyGoal || 0}"></label></div>
      <fieldset class="lg-f"><legend>색</legend><div class="lg-colors">${COLORS.map(c => `<label><input type="radio" name="color" value="${c}" ${v.color === c ? 'checked' : ''}><i style="background:${c}"></i></label>`).join('')}</div></fieldset>
      <label class="lg-check"><input type="checkbox" name="private" ${v.private ? 'checked' : ''}> 🔒 나만 보기 <small>(상대에게 이 습관과 기록이 보이지 않아요)</small></label>
      <div class="lg-drow"><button class="lg-btn ghost" type="button" data-close>취소</button><button class="lg-btn primary" type="submit">${t ? '저장' : '만들기'}</button></div>
    </form>`;
    syncUnit();
    dlg.showModal();
    dlg.querySelector('[name=name]').focus();
  }
  function syncUnit() {
    const f = dlg.querySelector('form'), u = (f.querySelector('[name=unit]:checked') || {}).value || 'minutes';
    f.querySelector('[data-for=count]').hidden = u !== 'count';
    f.querySelector('[data-for=goal]').hidden = u === 'check';
    $('lgGoalU').textContent = u === 'minutes' ? '(분)' : '';
  }
  async function onSubmit(e) {
    e.preventDefault();
    const f = e.target, fd = new FormData(f);
    const unit = editing ? editing.unit : fd.get('unit') || 'minutes';
    const data = {
      name: String(fd.get('name') || '').trim().slice(0, 40), emoji: Array.from(String(fd.get('emoji') || '').trim()).slice(0, 4).join(''),
      unit, unitLabel: unit === 'count' ? String(fd.get('unitLabel') || '').trim().slice(0, 6) || '개' : '',
      dailyGoal: unit === 'check' ? 1 : Math.max(0, Math.min(100000, Math.round(+fd.get('dailyGoal') || 0))),
      color: COLORS.includes(fd.get('color')) ? fd.get('color') : COLORS[0], private: fd.get('private') === 'on',
    };
    if (!data.name) return;
    dlg.close();
    try {
      if (editing) {
        const { private: priv, ...rest } = data;
        await store.updateTracker(editing.id, rest);
        if (priv !== !!editing.private) await store.setPrivate(editing, priv);
        toast('✎ 저장했어요');
      } else {
        await store.addTracker(data);
        toast(`${data.emoji} ${data.name} 습관을 만들었어요. 한 번 눌러 기록해 보세요!`);
      }
    } catch (err) { toast('저장하지 못했어요 (' + (err.code || err.message) + ')'); }
  }

  return {
    show(tab) { current = tab; render(); },
    setProfile(p) {
      profileLoaded = true;
      if (p && Array.isArray(p.seenAchievements)) seen = new Set([...(seen || []), ...p.seenAchievements]);
      checkAchievements();
    },
    newTracker: () => openTrackerDialog(),
    /** 문서·캘린더가 쓰는 공용 데이터 */
    data: () => ({ trackers, byT, loaded: tLoaded && lLoaded }),
    onChange: fn => listeners.push(fn),
    openTracker: id => { sel = id; year = new Date().getFullYear(); ctx.go('log'); },
  };
}
