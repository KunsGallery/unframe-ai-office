// 🐾 펫 비서 (화면 쪽): 오늘 탭 맨 위 펫 카드(펫이 한 말 · 오늘 기분 · 점심), 펫 비서 설정
import { dayKey, addDays, statsFor, fmtAmount, fmtDate } from './model.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const MOODS = [null, ['😫', '힘듦'], ['😕', '별로'], ['😐', '보통'], ['🙂', '좋음'], ['😄', '최고']];
export const moodEmoji = s => (MOODS[s] ? MOODS[s][0] : '');
const DEFAULTS = { briefOn: true, briefTime: '08:30', lunchOn: true, lunchTime: '13:00', dueOn: true, dueTime: '16:00', eveningOn: true, eveningTime: '21:00', weekend: false, city: 'seoul', style: '', shareMood: true };
const CITIES = { seoul: '서울', seongnam: '성남·판교', suwon: '수원', incheon: '인천', goyang: '고양·일산', busan: '부산', daegu: '대구', daejeon: '대전', gwangju: '광주', ulsan: '울산', jeju: '제주' };
const SLOT = { brief: ['☀️ 아침 브리핑', '인사 · 오늘 기분 묻기 · 날씨 · 오늘 일정 · 마감 할 일'], lunch: ['🍱 점심 체크인', '점심 뭐 먹었는지 묻고 오후 응원'], due: ['📋 마감 할 일', '오늘 마감·지난 할 일이 남아 있을 때만'], evening: ['🌙 저녁 습관 챙기기', '오늘 아직 안 한 습관 (다 했으면 칭찬)'] };

export function initPet(ctx) {
  const { work, me, toast, petInfo, petNow, petChat } = ctx;
  let moods = [], notes = [], settings = null, notesDay = null, unsubNotes = null;

  function watchNotes() {
    const d = dayKey();
    if (notesDay === d) return;
    notesDay = d;
    if (typeof unsubNotes === 'function') unsubNotes();
    unsubNotes = work.onPetNotes(d, list => { notes = list.filter(n => n.text).sort((a, b) => (a.at || 0) - (b.at || 0)); renderSlot(); });
  }

  const moodFor = (id, day = dayKey()) => moods.find(m => m.owner === id && m.day === day) || null;
  const greet = () => { const h = new Date().getHours(); return h < 11 ? '좋은 아침이에요! 오늘 기분은 어때요?' : h < 17 ? '점심은 맛있게 먹었어요? 오후도 같이 힘내요!' : '오늘 하루 어땠어요? 기분을 남겨 두면 나중에 캘린더에서 볼 수 있어요.'; };

  function renderSlot() {
    watchNotes();
    const el = $('lgPetSlot'); if (!el) return;
    const p = petInfo(me), m = moodFor(me.id), note = notes[notes.length - 1];
    const showLunch = new Date().getHours() >= 11 || (m && m.lunch);
    el.innerHTML = `<section class="pet-card">
      <div class="pet-top">${p.img ? `<img class="pet-img" alt="" src="${p.img}">` : '<span class="pet-img">🐾</span>'}
        <div class="pet-who"><b>${esc(p.name)}</b><small>${note ? `${esc(SLOT[note.slot.replace('-test', '')]?.[0] || '')} · ${new Date(note.at).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })}` : '펫 비서'}</small></div>
        <button class="pet-set" data-pet="settings" type="button" aria-label="펫 비서 설정">⚙︎ 설정</button></div>
      <p class="pet-say">${esc(note ? note.text : greet())}</p>
      <button class="pet-chat-btn" data-pet="chat" type="button"><span>✦</span> ${esc(p.name)}에게 말 걸기 <small>"운동 30분 했어", "오늘 뭐부터 할까?"</small></button>
      <div class="pet-q">오늘 기분은?</div>
      <div class="mood-row" role="radiogroup" aria-label="오늘 기분">${MOODS.slice(1).map((x, i) => `<button type="button" role="radio" aria-checked="${m && m.score === i + 1}" data-mood="${i + 1}"><span>${x[0]}</span><small>${x[1]}</small></button>`).join('')}</div>
      ${m && m.score ? `<form class="pet-form" data-form="note"><input name="v" maxlength="200" placeholder="한마디 남기기 (선택)" value="${esc(m.note || '')}" aria-label="오늘 한마디"><button type="submit">저장</button></form>` : ''}
      ${showLunch ? `<form class="pet-form" data-form="lunch"><span>🍱</span><input name="v" maxlength="100" placeholder="점심 뭐 먹었어요?" value="${esc((m && m.lunch) || '')}" aria-label="오늘 점심"><button type="submit">저장</button></form>` : ''}
    </section>`;
  }
  const save = (patch, msg) => work.saveMood(dayKey(), { ...patch, shared: settings ? !!settings.shareMood : true })
    .then(() => msg && toast(msg)).catch(e => toast('저장하지 못했어요 (' + (e.code || e.message) + ')'));

  document.addEventListener('click', e => {
    const b = e.target.closest('#lgPetSlot [data-mood], #lgPetSlot [data-pet]'); if (!b) return;
    if (b.dataset.pet === 'settings') return openSettings();
    if (b.dataset.pet === 'chat') return openChat();
    const s = +b.dataset.mood;
    save({ score: s }, `${MOODS[s][0]} 오늘 기분을 남겼어요`).then(() => setTimeout(() => $('lgPetSlot')?.querySelector('[data-form=note] input')?.focus(), 50));
  });
  document.addEventListener('submit', e => {
    const f = e.target.closest('#lgPetSlot [data-form]'); if (!f) return;
    e.preventDefault();
    const v = f.querySelector('input').value.trim();
    if (f.dataset.form === 'note') save({ note: v.slice(0, 200) }, '✎ 한마디를 남겼어요');
    else save({ lunch: v.slice(0, 100) }, v ? `🍱 ${v} 기록했어요` : '');
  });

  // ---------- 설정 ----------
  let dlg = null;
  async function openSettings() {
    if (!settings) settings = { ...DEFAULTS, ...((await work.getAssistant().catch(() => null)) || {}) };
    const p = petInfo(me), s = settings;
    if (!dlg) {
      dlg = document.createElement('dialog'); dlg.className = 'lg-dlg pet-dlg'; dlg.id = 'petDlg'; document.body.appendChild(dlg);
      dlg.addEventListener('click', e => { if (e.target.dataset.close != null) dlg.close(); if (e.target.dataset.try) tryNow(); });
      dlg.addEventListener('submit', onSave);
    }
    dlg.innerHTML = `<form method="dialog">
      <h3>🐾 ${esc(p.name)} 비서</h3>
      <p class="lg-hint">정한 시간에 ${esc(p.name)}가 휴대폰으로 말을 걸어요. Claude가 내 일정·할 일·습관 기록을 보고 매일 새로 써요. (⋯ → 🔔 알림이 켜져 있어야 와요)</p>
      ${Object.entries(SLOT).map(([k, [label, desc]]) => `<label class="pet-slot"><input type="checkbox" name="${k}On" ${s[k + 'On'] ? 'checked' : ''}><span><b>${label}</b><small>${desc}</small></span><input type="time" name="${k}Time" value="${esc(s[k + 'Time'])}" aria-label="${label} 시간"></label>`).join('')}
      <label class="lg-check"><input type="checkbox" name="weekend" ${s.weekend ? 'checked' : ''}> 주말에도 받기</label>
      <label class="lg-f">날씨 지역<select name="city">${Object.entries(CITIES).map(([k, v]) => `<option value="${k}" ${s.city === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="lg-f">${esc(p.name)}의 말투·내 스타일 <small class="lg-hint">(예: 반말로 다정하게, 짧게. 운동 얘기 좋아함. 월요일엔 특히 응원)</small><textarea name="style" maxlength="200" rows="3">${esc(s.style)}</textarea></label>
      <label class="lg-check"><input type="checkbox" name="shareMood" ${s.shareMood ? 'checked' : ''}> 내 기분·점심을 상대에게 보여주기</label>
      <div class="pet-try"><select name="trySlot" aria-label="받아 볼 알림">${Object.entries(SLOT).map(([k, [l]]) => `<option value="${k}">${l}</option>`).join('')}</select><button class="lg-btn" type="button" data-try="1">지금 받아 보기</button></div>
      <p class="pet-out" id="petOut" hidden></p>
      <div class="lg-drow"><button class="lg-btn ghost" type="button" data-close>닫기</button><button class="lg-btn primary" type="submit">저장</button></div>
    </form>`;
    dlg.showModal();
  }
  function read() {
    const f = new FormData(dlg.querySelector('form')), o = {};
    for (const k of Object.keys(SLOT)) { o[k + 'On'] = f.get(k + 'On') === 'on'; o[k + 'Time'] = /^\d{2}:\d{2}$/.test(f.get(k + 'Time')) ? f.get(k + 'Time') : DEFAULTS[k + 'Time']; }
    o.weekend = f.get('weekend') === 'on'; o.shareMood = f.get('shareMood') === 'on';
    o.city = CITIES[f.get('city')] ? f.get('city') : 'seoul'; o.style = String(f.get('style') || '').trim().slice(0, 200);
    return o;
  }
  async function onSave(e) {
    e.preventDefault();
    const o = read();
    try { await work.saveAssistant(o); settings = { ...settings, ...o }; dlg.close(); toast('🐾 펫 비서 설정을 저장했어요'); }
    catch (err) { toast('저장하지 못했어요 (' + (err.code || err.message) + ')'); }
  }
  async function tryNow() {
    const out = $('petOut'), slot = dlg.querySelector('[name=trySlot]').value;
    // 바뀐 말투·지역을 먼저 저장해야 반영된다
    try { const o = read(); await work.saveAssistant(o); settings = { ...settings, ...o }; } catch {}
    out.hidden = false; out.textContent = '쓰는 중…';
    try {
      const r = await petNow(slot);
      out.textContent = r.text ? `“${r.text}”${r.sent ? ` · 기기 ${r.sent}대로 보냈어요` : ' · 받을 기기가 없어요 (🔔 알림을 켜 주세요)'}` : '보낼 내용이 없어요';
    } catch (err) { out.textContent = '실패: ' + err.message; }
  }

  // ==================================================================
  //  💬 펫과 대화: 펫이 비서처럼 답하고, 기록·일정·할 일·기분 제안은 "적용"을 눌러야 저장
  // ==================================================================
  const chatKey = () => 'unframe-petchat-' + me.id + '-' + dayKey();
  const loadChat = () => { try { return JSON.parse(localStorage.getItem(chatKey())) || []; } catch { return []; } };
  const saveChat = list => { try { localStorage.setItem(chatKey(), JSON.stringify(list.slice(-40))); } catch {} };
  let chat = [], sending = false, cdlg = null;
  const SUGGEST = ['오늘 뭐부터 하면 좋을까?', '운동 30분 했어', '이번 주 일정 알려줘', '요즘 내 습관 어때?', '내일 오후 3시 미팅 넣어줘'];
  const ACT_LABEL = { log: '기록', event: '일정', task: '할 일', mood: '기분' };
  function actText(a) {
    const { trackers } = ctx.logs.data(), t = trackers.find(x => x.id === a.tracker);
    if (a.type === 'log') return t ? `${t.emoji || ''} ${t.name} +${t.unit === 'check' ? '했어요' : a.amount + (t.unit === 'minutes' ? '분' : t.unitLabel || '개')}${a.day && a.day !== dayKey() ? ` (${a.day.slice(5).replace('-', '/')})` : ''}` : '알 수 없는 습관';
    if (a.type === 'event') return `📅 ${a.day ? a.day.slice(5).replace('-', '/') : ''} ${a.time || ''} ${a.title}`.replace(/\s+/g, ' ');
    if (a.type === 'task') return `📋 ${a.title}${a.day ? ` · 마감 ${a.day.slice(5).replace('-', '/')}` : ''}`;
    return `${moodEmoji(a.score)} 오늘 기분 ${MOODS[a.score] ? MOODS[a.score][1] : ''}`;
  }
  function validAction(a) {
    if (!a || !ACT_LABEL[a.type]) return false;
    const okDay = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
    if (a.type === 'log') { const t = ctx.logs.data().trackers.find(x => x.id === a.tracker && x.owner === me.id); return !!t && a.amount > 0 && a.amount <= 100000 && (!a.day || (okDay(a.day) && a.day <= dayKey())); }
    if (a.type === 'event') return !!(a.title && a.title.trim()) && okDay(a.day) && (!a.time || /^\d{2}:\d{2}$/.test(a.time));
    if (a.type === 'task') return !!(a.title && a.title.trim()) && (!a.day || okDay(a.day));
    return a.score >= 1 && a.score <= 5;
  }
  async function applyAction(a) {
    if (a.type === 'log') {
      const t = ctx.logs.data().trackers.find(x => x.id === a.tracker), day = a.day || dayKey();
      return t.unit === 'check' ? ctx.logStore.set(t, day, 1) : ctx.logStore.add(t, day, Math.round(a.amount));
    }
    if (a.type === 'event') return work.addEvent({ title: a.title.trim().slice(0, 100), day: a.day, time: a.time || '', note: '', shared: true });
    if (a.type === 'task') return ctx.addTask(a.title.trim().slice(0, 200), a.day || null);
    return work.saveMood(dayKey(), { score: a.score, shared: settings ? !!settings.shareMood : true });
  }
  function renderChat() {
    const box = $('petChatLog'); if (!box) return;
    const p = petInfo(me);
    box.innerHTML = (chat.length ? '' : `<div class="pc-hello">${p.img ? `<img alt="" src="${p.img}">` : ''}<b>${esc(p.name)}</b><span>무엇이든 말 걸어 보세요. 오늘 할 일 정리, 기록 남기기, 일정 넣기를 도와줄게요.</span></div>`)
      + chat.map((m, i) => `<div class="pc-msg ${m.role}">${m.role === 'assistant' && p.img ? `<img class="pc-ava" alt="" src="${p.img}">` : ''}<div class="pc-bub">${esc(m.content)}${(m.actions || []).length ? `<div class="pc-acts">${m.actions.map((a, j) => `<button type="button" class="pc-act${a.done ? ' done' : ''}" data-act="${i}:${j}" ${a.done || !validAction(a) ? 'disabled' : ''}><small>${ACT_LABEL[a.type]}</small>${esc(actText(a))}<b>${a.done ? '✓ 적용됨' : validAction(a) ? '적용' : '확인 필요'}</b></button>`).join('')}</div>` : ''}</div></div>`).join('')
      + (sending ? `<div class="pc-msg assistant">${p.img ? `<img class="pc-ava" alt="" src="${p.img}">` : ''}<div class="pc-bub pc-typing"><i></i><i></i><i></i></div></div>` : '');
    $('petChatSug').innerHTML = chat.length > 1 ? '' : SUGGEST.map(x => `<button type="button" data-sug="${esc(x)}">${esc(x)}</button>`).join('');
    box.scrollTop = box.scrollHeight;
  }
  function openChat() {
    chat = loadChat();
    const p = petInfo(me);
    if (!cdlg) {
      cdlg = document.createElement('dialog'); cdlg.className = 'pc-dlg'; cdlg.id = 'petChat'; document.body.appendChild(cdlg);
      cdlg.addEventListener('click', async e => {
        if (e.target.closest('[data-close]')) return cdlg.close();
        if (e.target.closest('[data-clear]')) { chat = []; saveChat(chat); return renderChat(); }
        const sg = e.target.closest('[data-sug]'); if (sg) return send(sg.dataset.sug);
        const ab = e.target.closest('[data-act]'); if (!ab || ab.disabled) return;
        const [i, j] = ab.dataset.act.split(':').map(Number), a = chat[i] && chat[i].actions[j];
        if (!a || a.done) return;
        ab.disabled = true;
        try { await applyAction(a); a.done = true; saveChat(chat); renderChat(); toast(`✓ ${actText(a)}`); }
        catch (err) { ab.disabled = false; toast('적용하지 못했어요 (' + (err.code || err.message) + ')'); }
      });
      cdlg.addEventListener('submit', e => { e.preventDefault(); const t = $('petChatIn'); const v = t.value.trim(); if (v) { t.value = ''; send(v); } });
      cdlg.addEventListener('keydown', e => { if (e.target.id === 'petChatIn' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); cdlg.querySelector('form').requestSubmit(); } });
    }
    cdlg.innerHTML = `<div class="pc-head">${p.img ? `<img alt="" src="${p.img}">` : '<span>🐾</span>'}<div><b>${esc(p.name)}</b><small>✦ AI 비서 · 오늘 대화는 이 기기에만 저장돼요</small></div>
        <button type="button" class="pc-x" data-clear title="대화 지우기">지우기</button><button type="button" class="pc-x" data-close aria-label="닫기">✕</button></div>
      <div class="pc-log" id="petChatLog" aria-live="polite"></div>
      <div class="pc-sug" id="petChatSug"></div>
      <form class="pc-form"><textarea id="petChatIn" rows="1" maxlength="1000" placeholder="${esc(p.name)}에게 말하기…" aria-label="메시지"></textarea><button type="submit" aria-label="보내기">↑</button></form>`;
    cdlg.showModal();
    renderChat();
    setTimeout(() => $('petChatIn')?.focus(), 50);
  }
  /** 펫에게 보낼 내 자료: 오늘 습관 진행, 앞으로 7일 일정, 남은 할 일, 기분 (내 화면에 이미 있는 것만) */
  function chatContext() {
    const today = dayKey(), { trackers, byT } = ctx.logs.data();
    const habits = trackers.filter(t => t.owner === me.id && !t.archived).map(t => {
      const st = statsFor(t, byT.get(t.id), today);
      let week = 0; for (let i = 0; i < 7; i++) { const l = byT.get(t.id)?.get(addDays(today, -i)); week += l ? l.amount : 0; }
      return { id: t.id, name: `${t.emoji || ''} ${t.name}`.trim(), unit: t.unit === 'minutes' ? '분' : t.unit === 'check' ? '했다/안 했다' : (t.unitLabel || '개'),
        goal: st.goal, today: st.todayAmt, todayText: fmtAmount(t, st.todayAmt), streak: st.streak, best: st.best, last7days: week, thisYear: st.yearTotal };
    });
    const until = addDays(today, 7);
    const events = (ctx.events() || []).filter(e => e.day >= today && e.day <= until).sort((a, b) => (a.day + (a.time || '99')) < (b.day + (b.time || '99')) ? -1 : 1)
      .slice(0, 20).map(e => ({ day: e.day, time: e.time || '하루 종일', title: e.title, who: e.owner === me.id ? '나' : (ctx.nameOf(e.owner) + '님') }));
    const tasks = (ctx.tasks() || []).filter(b => !b.done && (b.assignee === me.id || (!b.assignee && b.by === me.id))).slice(0, 20).map(b => ({ text: b.text, due: b.due || '' }));
    const m = moodFor(me.id);
    return { today: `${today} (${fmtDate(today).split(' ').pop()})`, now: new Date().toTimeString().slice(0, 5), me: me.name, habits, events, tasks,
      moodToday: m && m.score ? MOODS[m.score][1] : '', lunchToday: (m && m.lunch) || '' };
  }
  async function send(text) {
    if (sending) return;
    chat.push({ role: 'user', content: text });
    sending = true; renderChat();
    try {
      const p = petInfo(me);
      const r = await petChat({ messages: chat.map(m => ({ role: m.role, content: m.content })), context: chatContext(), pet: { name: p.name, ko: p.ko }, style: settings ? settings.style : '' });
      chat.push({ role: 'assistant', content: r.reply || '…', actions: (r.actions || []).map(a => ({ ...a, done: false })) });
    } catch (err) {
      chat.push({ role: 'assistant', content: `앗, 지금은 대답하기 어려워요 (${err.message}). 조금 뒤에 다시 말 걸어 주세요.`, actions: [] });
    }
    sending = false; saveChat(chat); renderChat();
  }

  // 구독은 맨 끝에서 시작 (데모 저장소는 바로 콜백을 불러서, 위의 함수들이 먼저 준비돼 있어야 한다)
  work.getAssistant().then(a => { settings = { ...DEFAULTS, ...(a || {}) }; }).catch(() => { settings = { ...DEFAULTS }; });
  work.onMoods(list => { moods = list; renderSlot(); ctx.changed && ctx.changed(); }, () => {});
  watchNotes();

  return {
    renderSlot, moodFor, openSettings, openChat,
    moods: () => moods,
    focus(kind) {
      const el = $('lgPetSlot'); if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (kind === 'lunch') setTimeout(() => el.querySelector('[data-form=lunch] input')?.focus(), 300);
    },
  };
}
