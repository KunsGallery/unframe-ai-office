// 캘린더 탭: 한 달 보기 + 고른 날의 일정·기록·마감·문서
import { dayKey, addDays, fmtDate, fmtAmount, STEPS } from './model.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const WD = ['일', '월', '화', '수', '목', '금', '토'];

export function initCalendar(ctx) {
  const { work, logs, logStore, me, members, avatar, toast, getBoard, docs, go } = ctx;
  const nameOf = id => (members.find(m => m.id === id) || {}).name || id;
  const now = new Date();
  let y = now.getFullYear(), m = now.getMonth(), sel = dayKey(), events = [], visible = false, editing = null, formOpen = false;
  const pane = $('paneCalendar');

  work.onEvents(list => { events = list; if (visible) render(); }, e => toast('일정을 불러오지 못했어요 (' + (e.code || e.message) + ')'));
  logs.onChange(() => { if (visible) render(); });

  const evOn = d => events.filter(e => e.day === d).sort((a, b) => (a.time || '99') < (b.time || '99') ? -1 : 1);
  const ownerCls = o => (o === me.id ? 'mine' : 'theirs');

  function render() {
    const { trackers, byT } = logs.data();
    const today = dayKey(), first = new Date(y, m, 1), start = addDays(dayKey(first), -first.getDay());
    const mineT = trackers.filter(t => t.owner === me.id && !t.archived);
    const due = getBoard().filter(b => b.due && !b.done);
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = addDays(start, i), inMonth = +d.slice(5, 7) === m + 1;
      if (i === 35 && !inMonth) break;   // 5주로 끝나는 달
      const evs = evOn(d), dots = mineT.filter(t => (byT.get(t.id)?.get(d)?.amount || 0) > 0);
      const dueN = due.filter(b => b.due === d).length;
      cells.push(`<button type="button" class="cal-d${inMonth ? '' : ' out'}${d === today ? ' today' : ''}${d === sel ? ' sel' : ''}${new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8)).getDay() === 0 ? ' sun' : ''}" data-day="${d}" aria-label="${fmtDate(d)}${evs.length ? ` 일정 ${evs.length}개` : ''}">
        <span class="cal-n">${+d.slice(8)}</span>${ctx.moodOf && ctx.moodOf(me.id, d)?.score ? `<span class="cal-mood">${ctx.moodEmoji(ctx.moodOf(me.id, d).score)}</span>` : ''}
        <span class="cal-evs">${evs.slice(0, 3).map(e => `<i class="${ownerCls(e.owner)}">${e.time ? `<b>${esc(e.time)}</b> ` : ''}${esc(e.title)}</i>`).join('')}${evs.length > 3 ? `<i class="more">+${evs.length - 3}</i>` : ''}${dueN ? `<i class="due">⚑ 마감 ${dueN}</i>` : ''}</span>
        <span class="cal-dots">${dots.map(t => `<i style="background:${esc(t.color)}"></i>`).join('')}</span>
      </button>`);
    }
    pane.innerHTML = `<div class="cal-wrap">
      <section class="lg-sec light cal-month">
        <div class="cal-head"><div><div class="lg-kicker">캘린더 · ${y}년</div><h1 class="lg-display"><span class="lg-n">${m + 1}</span><span class="lg-u">월</span></h1></div>
          <span class="cal-nav"><button class="lg-yr" data-mon="-1" type="button" aria-label="이전 달">‹</button><button class="lg-btn ghost" data-act="today" type="button">오늘</button><button class="lg-yr" data-mon="1" type="button" aria-label="다음 달">›</button></span></div>
        <div class="cal-grid" role="grid">${WD.map((w, i) => `<span class="cal-w${i === 0 ? ' sun' : ''}">${w}</span>`).join('')}${cells.join('')}</div>
        <p class="cal-legend"><i class="mine"></i>내 일정 <i class="theirs"></i>${esc(members.filter(x => x.id !== me.id).map(x => x.name).join('·') || '상대')} 일정 <span>● 그날 한 습관</span></p>
      </section>
      <section class="lg-sec light cal-day" id="calDay">${dayHtml(sel, trackers, byT, due)}</section></div>`;
  }

  function dayHtml(d, trackers, byT, due) {
    const today = dayKey(), past = d <= today;
    const evs = evOn(d);
    const mineT = trackers.filter(t => t.owner === me.id && !t.archived);
    const theirT = trackers.filter(t => t.owner !== me.id && !t.archived && !t.private);
    const amt = t => byT.get(t.id)?.get(d)?.amount || 0;
    const pagesDay = docs.pages().filter(p => dayKey(new Date(p.updatedAt)) === d || dayKey(new Date(p.createdAt)) === d);
    const memoTitle = `${+d.slice(5, 7)}월 ${+d.slice(8)}일 메모`;
    const e = editing && events.find(x => x.id === editing);
    return `<div class="lg-kicker">${d === today ? '오늘' : d < today ? '지난 날' : '다가올 날'}</div>
      <h2 class="cal-dt"><span class="lg-n">${+d.slice(8)}</span> ${fmtDate(d).replace(/^\d+월 \d+일 /, `${+d.slice(5, 7)}월 · `)}</h2>

      ${moodHtml(d)}
      <h3 class="cal-h">일정 <button class="lg-btn ghost sm" data-act="addev" type="button">+ 일정</button></h3>
      <ul class="cal-list">${evs.map(x => `<li class="${ownerCls(x.owner)}"><button type="button" data-ev="${x.id}">
        <span class="cal-time">${esc(x.time || '하루 종일')}</span><b>${esc(x.title)}</b>${x.note ? `<small>${esc(x.note)}</small>` : ''}
        <em>${x.owner === me.id ? (x.shared ? '' : '🔒') : `<img alt="" src="${avatar(members.find(mm => mm.id === x.owner) || { id: x.owner })}">${esc(nameOf(x.owner))}`}</em></button></li>`).join('') || (formOpen ? '' : '<li class="cal-empty">일정이 없어요</li>')}</ul>
      ${formOpen ? `<form class="cal-form" id="calForm">
        <input name="title" maxlength="100" required placeholder="일정 제목" value="${esc(e ? e.title : '')}" aria-label="일정 제목">
        <div class="cal-frow"><input name="day" type="date" value="${esc(e ? e.day : d)}" aria-label="날짜"><input name="time" type="time" value="${esc(e ? e.time : '')}" aria-label="시간 (비우면 하루 종일)"></div>
        <input name="note" maxlength="500" placeholder="메모 (선택)" value="${esc(e ? e.note : '')}" aria-label="메모">
        <label class="lg-check"><input type="checkbox" name="shared" ${!e || e.shared ? 'checked' : ''} ${e && e.owner !== me.id ? 'disabled' : ''}> 👥 함께 보기 <small>(끄면 나만 봐요)</small></label>
        <div class="lg-drow">${e && (e.owner === me.id || e.shared) ? '<button class="lg-btn ghost" data-act="delev" type="button">삭제</button>' : ''}<button class="lg-btn ghost" data-act="cancelev" type="button">취소</button><button class="lg-btn primary" type="submit">${e ? '저장' : '추가'}</button></div>
      </form>` : ''}

      ${mineT.length ? `<h3 class="cal-h">내 기록 ${past ? '' : '<small>앞으로 올 날은 기록할 수 없어요</small>'}</h3>
      <ul class="cal-recs">${mineT.map(t => {
        const a = amt(t), step = STEPS[t.unit][t.unit === 'minutes' ? 1 : 0];
        return `<li style="--c:${esc(t.color)}" data-t="${t.id}"><span>${esc(t.emoji || '•')} ${esc(t.name)}</span><b class="${a > 0 ? 'on' : ''}">${a > 0 ? esc(fmtAmount(t, a)) : '—'}</b>
          ${past ? (t.unit === 'check' ? `<button class="lg-step sm${a > 0 ? ' on' : ''}" data-rec="toggle" type="button">${a > 0 ? '✓' : '했어요'}</button>`
            : `<button class="lg-step sm" data-rec="-${step}" type="button" ${a > 0 ? '' : 'disabled'} aria-label="${step} 빼기">−${step}</button><button class="lg-step sm" data-rec="${step}" type="button" aria-label="${step} 더하기">+${step}</button>`) : ''}</li>`;
      }).join('')}</ul>` : ''}
      ${theirT.length ? `<ul class="cal-recs theirs">${theirT.map(t => { const a = amt(t); return `<li style="--c:${esc(t.color)}"><span>${esc(t.emoji || '•')} ${esc(t.name)} <small>${esc(nameOf(t.owner))}</small></span><b class="${a > 0 ? 'on' : ''}">${a > 0 ? esc(fmtAmount(t, a)) : '—'}</b></li>`; }).join('')}</ul>` : ''}

      ${due.filter(b => b.due === d).length ? `<h3 class="cal-h">마감 <small>화이트보드</small></h3><ul class="cal-list">${due.filter(b => b.due === d).map(b => `<li class="due"><button type="button" data-act="board"><span class="cal-time">⚑</span><b>${esc(b.text)}</b>${b.assignee ? `<em>${esc(nameOf(b.assignee))}</em>` : ''}</button></li>`).join('')}</ul>` : ''}

      <h3 class="cal-h">문서</h3>
      <ul class="cal-list">${pagesDay.map(p => `<li><button type="button" data-page="${p.id}"><span class="cal-time">${esc(p.emoji || '📄')}</span><b>${esc(p.title || '제목 없음')}</b></button></li>`).join('')}</ul>
      <button class="lg-btn" data-act="memo" data-title="${esc(memoTitle)}" type="button">✎ ${esc(memoTitle)} ${docs.pages().some(p => p.owner === me.id && p.title === memoTitle) ? '열기' : '쓰기'}</button>`;
  }

  function moodHtml(d) {
    if (!ctx.moodOf) return '';
    const rows = members.map(mm => ({ mm, x: ctx.moodOf(mm.id, d) })).filter(r => r.x && (r.x.score || r.x.lunch || r.x.note));
    if (!rows.length) return '';
    return `<h3 class="cal-h">기분</h3><ul class="cal-moods">${rows.map(({ mm, x }) => `<li><b>${x.score ? ctx.moodEmoji(x.score) : '·'}</b><span>${esc(mm.id === me.id ? '나' : mm.name)}${x.note ? ` “${esc(x.note)}”` : ''}${x.lunch ? `<small>🍱 ${esc(x.lunch)}</small>` : ''}</span></li>`).join('')}</ul>`;
  }
  pane.addEventListener('click', e => {
    const day = e.target.closest('[data-day]');
    if (day) {
      sel = day.dataset.day; editing = null; formOpen = false; render();
      if (matchMedia('(max-width: 1000px)').matches) $('calDay').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const mon = e.target.closest('[data-mon]');
    if (mon) { m += +mon.dataset.mon; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } render(); return; }
    const ev = e.target.closest('[data-ev]');
    if (ev) { editing = ev.dataset.ev; formOpen = true; render(); $('calForm')?.title.focus(); return; }
    const pg = e.target.closest('[data-page]');
    if (pg) { docs.open(pg.dataset.page); return; }
    const rec = e.target.closest('[data-rec]');
    if (rec) {
      const { trackers, byT } = logs.data(), t = trackers.find(x => x.id === rec.closest('[data-t]').dataset.t);
      const a = byT.get(t.id)?.get(sel)?.amount || 0;
      const p = rec.dataset.rec === 'toggle' ? logStore.set(t, sel, a > 0 ? 0 : 1) : logStore.add(t, sel, Math.max(-a, +rec.dataset.rec));
      p.catch(err => toast('기록하지 못했어요 (' + (err.code || err.message) + ')'));
      return;
    }
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'today') { const t = new Date(); y = t.getFullYear(); m = t.getMonth(); sel = dayKey(); render(); }
    else if (act === 'addev') { editing = null; formOpen = true; render(); $('calForm')?.title.focus(); }
    else if (act === 'cancelev') { editing = null; formOpen = false; render(); }
    else if (act === 'delev') {
      const ev2 = events.find(x => x.id === editing);
      if (!ev2 || !confirm(`「${ev2.title}」 일정을 지울까요?`)) return;
      work.deleteEvent(ev2.id).then(() => toast('🗑 일정을 지웠어요')).catch(err => toast('지우지 못했어요 (' + (err.code || err.message) + ')'));
      editing = null; formOpen = false;
    } else if (act === 'board') go('together');
    else if (act === 'memo') docs.openOrCreate(b.dataset.title, ['일지']);
  });
  pane.addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(e.target), ev = editing && events.find(x => x.id === editing);
    const data = { title: String(f.get('title') || '').trim().slice(0, 100), day: String(f.get('day') || sel), time: String(f.get('time') || ''), note: String(f.get('note') || '').trim().slice(0, 500) };
    if (!data.title || !/^\d{4}-\d{2}-\d{2}$/.test(data.day)) return;
    if (!ev || ev.owner === me.id) data.shared = f.get('shared') === 'on';
    const p = ev ? work.updateEvent(ev.id, data) : work.addEvent(data);
    p.then(() => {
      toast(ev ? '📅 일정을 고쳤어요' : `📅 ${fmtDate(data.day)}에 일정을 넣었어요`);
      if (!ev && data.shared && ctx.notifyOthers) ctx.notifyOthers(`📅 ${me.name}님이 일정을 넣었어요`, `${fmtDate(data.day)}${data.time ? ' ' + data.time : ''} · ${data.title}`, 'event-' + data.day + data.title.slice(0, 30));
    }).catch(err => toast('저장하지 못했어요 (' + (err.code || err.message) + ')'));
    sel = data.day; y = +data.day.slice(0, 4); m = +data.day.slice(5, 7) - 1;
    editing = null; formOpen = false; render();
  });

  return {
    show(tab) { visible = tab === 'calendar'; if (visible) render(); },
    refresh() { if (visible) render(); },
  };
}
