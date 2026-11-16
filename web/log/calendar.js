// 캘린더 탭: 한 달 보기 + 고른 날의 일정·기록·마감·문서
import { dayKey, addDays, fmtDate, fmtAmount, STEPS } from './model.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const WD = ['일', '월', '화', '수', '목', '금', '토'];
// 회사 캘린더: 둘 다 보고 둘 다 고칠 수 있는 공용 일정 (cal 값). ''이면 개인 일정(내 것 / 상대 것)
export const CALS = { unframe: { name: '언프레임', emoji: '◆' }, kuns: { name: '쿤스갤러리', emoji: '🖼' } };
export const calName = e => (e && CALS[e.cal] ? CALS[e.cal].name : '');

export function initCalendar(ctx) {
  const { work, logs, logStore, me, members, avatar, toast, getBoard, docs, go } = ctx;
  const nameOf = id => (members.find(m => m.id === id) || {}).name || id;
  const now = new Date();
  let y = now.getFullYear(), m = now.getMonth(), sel = dayKey(), events = [], visible = false, editing = null, formOpen = false;
  const pane = $('paneCalendar');
  // 달력에서 숨길 종류 (mine·theirs·unframe·kuns) — 이 기기에만 기억
  let hide = new Set();
  try { hide = new Set(JSON.parse(localStorage.getItem('unframe-cal-hide') || '[]')); } catch {}
  const saveHide = () => { try { localStorage.setItem('unframe-cal-hide', JSON.stringify([...hide])); } catch {} };

  let evLoaded = false;
  work.onEvents(list => {
    // 🔔 알림센터: 상대가 새로 넣은 일정 (처음 불러온 것 제외)
    if (evLoaded && ctx.inbox) {
      const prev = new Set(events.map(e => e.id));
      for (const e of list) if (!prev.has(e.id) && e.owner !== me.id) {
        const when = e.endDay && e.endDay > e.day ? `${fmtDate(e.day)} ~ ${fmtDate(e.endDay)}` : fmtDate(e.day) + (e.time ? ' ' + e.time : '');
        ctx.inbox({ title: `📅 ${nameOf(e.owner)}님이 ${CALS[e.cal] ? CALS[e.cal].name + ' ' : ''}일정을 넣었어요`, body: `${when} · ${e.title}`, tag: 'event-' + e.id, url: './#calendar' });
      }
    }
    events = list; evLoaded = true; if (visible) render();
  }, e => toast('일정을 불러오지 못했어요 (' + (e.code || e.message) + ')'));
  logs.onChange(() => { if (visible) render(); });

  // 기간 일정: endDay가 day보다 뒤면 그 사이 모든 날에 보인다 (전시처럼)
  const endOf = e => (e.endDay && e.endDay > e.day ? e.endDay : e.day);
  const multi = e => endOf(e) > e.day;
  const evOn = d => events.filter(e => e.day <= d && endOf(e) >= d && !hide.has(kindOf(e)))
    .sort((a, b) => (multi(b) - multi(a)) || (a.day < b.day ? -1 : a.day > b.day ? 1 : 0) || (endOf(b) > endOf(a) ? 1 : endOf(b) < endOf(a) ? -1 : 0) || ((a.time || '99') < (b.time || '99') ? -1 : 1));
  const md = k => `${+k.slice(5, 7)}/${+k.slice(8)}`;
  const nDays = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000) + 1;
  const rangeText = e => `${md(e.day)}${e.time ? ' ' + e.time : ''} ~ ${md(endOf(e))}${e.endTime ? ' ' + e.endTime : ''}`;
  // 한 칸 안의 일정 조각: 기간 일정은 이어지는 막대처럼 (시작·주의 첫날에만 제목)
  const chip = (e, d, weekStart) => {
    if (!multi(e)) return `<i class="${kindOf(e)}">${e.time ? `<b>${esc(e.time)}</b> ` : ''}${esc(e.title)}</i>`;
    const pos = (d === e.day ? ' s0' : '') + (d === endOf(e) ? ' s1' : '');
    return `<i class="${kindOf(e)} span${pos}${d === e.day || weekStart ? '' : ' cont'}">${esc(e.title)}</i>`;
  };
  const timeLabel = (e, d) => {
    if (!multi(e)) return e.time || '하루 종일';
    if (d === e.day) return e.time ? e.time + ' 시작' : '시작';
    if (d === endOf(e)) return e.endTime ? '~' + e.endTime : '마지막 날';
    return `${nDays(e.day, d)}일째`;
  };
  const kindOf = e => (CALS[e.cal] ? e.cal : e.owner === me.id ? 'mine' : 'theirs');

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
        <span class="cal-evs">${evs.slice(0, 3).map(e => chip(e, d, i % 7 === 0)).join('')}${evs.length > 3 ? `<i class="more">+${evs.length - 3}</i>` : ''}${dueN ? `<i class="due">⚑ 마감 ${dueN}</i>` : ''}</span>
        <span class="cal-dots">${dots.map(t => `<i style="background:${esc(t.color)}"></i>`).join('')}</span>
      </button>`);
    }
    pane.innerHTML = `<div class="cal-wrap">
      <section class="lg-sec light cal-month">
        <div class="cal-head"><div><div class="lg-kicker">캘린더 · ${y}년</div><h1 class="lg-display"><span class="lg-n">${m + 1}</span><span class="lg-u">월</span></h1></div>
          <span class="cal-nav"><button class="lg-yr" data-mon="-1" type="button" aria-label="이전 달">‹</button><button class="lg-btn ghost" data-act="today" type="button">오늘</button><button class="lg-yr" data-mon="1" type="button" aria-label="다음 달">›</button></span></div>
        <div class="cal-grid" role="grid">${WD.map((w, i) => `<span class="cal-w${i === 0 ? ' sun' : ''}">${w}</span>`).join('')}${cells.join('')}</div>
        <p class="cal-legend">${[['mine', '내 일정'], ['theirs', (members.filter(x => x.id !== me.id).map(x => x.name).join('·') || '상대') + ' 일정'], ...Object.entries(CALS).map(([k, c]) => [k, c.name])]
          .map(([k, label]) => `<button type="button" class="cal-lg${hide.has(k) ? ' off' : ''}" data-hide="${k}" aria-pressed="${!hide.has(k)}" title="눌러서 ${hide.has(k) ? '보이기' : '숨기기'}"><i class="${k}"></i>${esc(label)}</button>`).join('')}<span>● 그날 한 습관</span></p>
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
      <ul class="cal-list">${evs.map(x => `<li class="${kindOf(x)}"><button type="button" data-ev="${x.id}">
        <span class="cal-time">${esc(timeLabel(x, d))}</span><b>${esc(x.title)}</b>${multi(x) ? `<small>🗓 ${esc(rangeText(x))} · ${nDays(x.day, endOf(x))}일</small>` : ''}${x.note ? `<small>${esc(x.note)}</small>` : ''}
        <em>${CALS[x.cal] ? `<span class="cal-badge ${x.cal}">${esc(CALS[x.cal].name)}</span>` : x.owner === me.id ? (x.shared ? '' : '🔒') : `<img alt="" src="${avatar(members.find(mm => mm.id === x.owner) || { id: x.owner })}">${esc(nameOf(x.owner))}`}</em></button></li>`).join('') || (formOpen ? '' : '<li class="cal-empty">일정이 없어요</li>')}</ul>
      ${formOpen ? `<form class="cal-form" id="calForm">
        <input name="title" maxlength="100" required placeholder="일정 제목" value="${esc(e ? e.title : '')}" aria-label="일정 제목">
        <div class="cal-frow"><span class="cal-fl">시작</span><input name="day" type="date" value="${esc(e ? e.day : d)}" aria-label="시작 날짜" required><input name="time" type="time" value="${esc(e ? e.time : '')}" aria-label="시작 시간 (비우면 하루 종일)"></div>
        <div class="cal-frow"><span class="cal-fl">끝</span><input name="endDay" type="date" value="${esc(e && multi(e) ? e.endDay : '')}" min="${esc(e ? e.day : d)}" aria-label="끝 날짜 (비우면 하루 일정)"><input name="endTime" type="time" value="${esc(e && multi(e) ? e.endTime || '' : '')}" aria-label="끝 시간 (선택)"></div>
        <small class="cal-fhint">하루 일정은 끝을 비워 두세요. 시간을 비우면 하루 종일이에요. 전시처럼 며칠 이어지면 끝 날짜를 고르세요.</small>
        <input name="note" maxlength="500" placeholder="메모 (선택)" value="${esc(e ? e.note : '')}" aria-label="메모">
        <div class="cal-kinds" role="radiogroup" aria-label="어느 캘린더">${[['', '👤 개인'], ...Object.entries(CALS).map(([k, c]) => [k, `${c.emoji} ${c.name}`])]
          .map(([k, label]) => `<label class="cal-kind ${k || 'mine'}"><input type="radio" name="cal" value="${k}" ${(e ? (e.cal || '') : (ctx.lastCal || '')) === k ? 'checked' : ''}><span>${esc(label)}</span></label>`).join('')}</div>
        <label class="lg-check cal-share"><input type="checkbox" name="shared" ${!e || e.shared ? 'checked' : ''} ${e && e.owner !== me.id ? 'disabled' : ''}> 👥 함께 보기 <small>(끄면 나만 봐요)</small></label>
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
    const hb = e.target.closest('[data-hide]');
    if (hb) { const k = hb.dataset.hide; hide.has(k) ? hide.delete(k) : hide.add(k); saveHide(); render(); return; }
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
  pane.addEventListener('input', e => {
    if (e.target.name !== 'day' || !e.target.form) return;
    const end = e.target.form.endDay; end.min = e.target.value;
    if (end.value && end.value < e.target.value) end.value = '';
  });
  pane.addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(e.target), ev = editing && events.find(x => x.id === editing);
    const data = { title: String(f.get('title') || '').trim().slice(0, 100), day: String(f.get('day') || sel), time: String(f.get('time') || ''), note: String(f.get('note') || '').trim().slice(0, 500) };
    if (!data.title || !/^\d{4}-\d{2}-\d{2}$/.test(data.day)) return;
    const endDay = String(f.get('endDay') || '');
    if (endDay && endDay < data.day) { toast('끝 날짜가 시작 날짜보다 빨라요'); return; }
    data.endDay = endDay > data.day ? endDay : '';
    data.endTime = data.endDay ? String(f.get('endTime') || '') : '';
    data.cal = CALS[f.get('cal')] ? String(f.get('cal')) : '';
    ctx.lastCal = data.cal;
    if (data.cal) data.shared = true;   // 회사 일정은 늘 함께 보기
    else if (!ev || ev.owner === me.id) data.shared = f.get('shared') === 'on';
    else if (ev.cal) data.shared = true;
    const p = ev ? work.updateEvent(ev.id, data) : work.addEvent(data);
    p.then(() => {
      toast(ev ? '📅 일정을 고쳤어요' : data.endDay ? `📅 ${md(data.day)}~${md(data.endDay)} 일정을 넣었어요` : `📅 ${fmtDate(data.day)}에 일정을 넣었어요`);
      if (!ev && data.shared && ctx.notifyOthers) ctx.notifyOthers(`📅 ${me.name}님이 ${data.cal ? CALS[data.cal].name + ' ' : ''}일정을 넣었어요`, `${data.endDay ? `${fmtDate(data.day)} ~ ${fmtDate(data.endDay)}` : fmtDate(data.day) + (data.time ? ' ' + data.time : '')} · ${data.title}`, 'event-' + data.day + data.title.slice(0, 30));
    }).catch(err => toast('저장하지 못했어요 (' + (err.code || err.message) + ')'));
    sel = data.day; y = +data.day.slice(0, 4); m = +data.day.slice(5, 7) - 1;
    editing = null; formOpen = false; render();
  });

  return {
    show(tab) { visible = tab === 'calendar'; if (visible) render(); },
    refresh() { if (visible) render(); },
    events: () => events,
  };
}
