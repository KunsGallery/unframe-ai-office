// 🐾 펫 비서 (화면 쪽): 오늘 탭 맨 위 펫 카드(펫이 한 말 · 성장 · 간식 · 응원 · 오늘 기분 · 점심),
// 오늘의 한 줄, 펫 비서 설정, 펫과 대화, 성취 탭의 편지함·내 패턴 찾기
import { dayKey, addDays, statsFor, fmtAmount, fmtDate, goalOf, parseDay } from './model.js';
import { dailyLine } from './daily.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const MOODS = [null, ['😫', '힘듦'], ['😕', '별로'], ['😐', '보통'], ['🙂', '좋음'], ['😄', '최고']];
export const moodEmoji = s => (MOODS[s] ? MOODS[s][0] : '');
const DEFAULTS = { briefOn: true, briefTime: '08:30', lunchOn: true, lunchTime: '13:00', dueOn: true, dueTime: '16:00', eveningOn: true, eveningTime: '21:00', letterOn: true, letterTime: '20:00', weekend: false, city: 'seoul', style: '', shareMood: true };
const CITIES = { seoul: '서울', seongnam: '성남·판교', suwon: '수원', incheon: '인천', goyang: '고양·일산', busan: '부산', daegu: '대구', daejeon: '대전', gwangju: '광주', ulsan: '울산', jeju: '제주' };
const SLOT = { brief: ['☀️ 아침 브리핑', '인사 · 오늘 기분 묻기 · 날씨 · 오늘 일정 · 마감 할 일'], lunch: ['🍱 점심 체크인', '점심 뭐 먹었는지 묻고 오후 응원'], due: ['📋 마감 할 일', '오늘 마감·지난 할 일이 남아 있을 때만'], evening: ['🌙 저녁 습관 챙기기', '오늘 아직 안 한 습관 (다 했으면 칭찬)'], letter: ['📮 주간 회고 편지', '일요일에만 · 한 주를 돌아보는 편지 (성취 탭 편지함)'] };

export function initPet(ctx) {
  const { work, me, toast, petInfo, petNow, petChat } = ctx;
  let moods = [], notes = [], settings = null, notesDay = null, unsubNotes = null;
  let letters = [], cheers = [], petState = {}, quizOpen = false, fedAnim = 0;

  function watchNotes() {
    const d = dayKey();
    if (notesDay === d) return;
    notesDay = d;
    if (typeof unsubNotes === 'function') unsubNotes();
    let first = true;
    unsubNotes = work.onPetNotes(d, list => {
      const prev = new Set(notes.map(n => n.id));
      notes = list.filter(n => n.text).sort((a, b) => (a.at || 0) - (b.at || 0));
      // 🔔 알림센터: 처음 불러온 것 말고 새로 온 펫 비서 말만
      if (!first && ctx.inbox) for (const n of notes) if (!prev.has(n.id)) ctx.inbox({ title: `🐾 ${petInfo(me).name}`, body: n.text, tag: 'pet-' + (n.slot || n.id), url: './#today' });
      first = false; renderSlot();
    });
  }

  const moodFor = (id, day = dayKey()) => moods.find(m => m.owner === id && m.day === day) || null;
  const greet = () => { const h = new Date().getHours(); return h < 11 ? '좋은 아침이에요! 오늘 기분은 어때요?' : h < 17 ? '점심은 맛있게 먹었어요? 오후도 같이 힘내요!' : '오늘 하루 어땠어요? 기분을 남겨 두면 나중에 캘린더에서 볼 수 있어요.'; };

  // ==================================================================
  //  🐾 펫 성장: 기록할수록 경험치(XP) → 레벨. 목표를 넉넉히 채운 날마다 🍖 간식 하나
  // ==================================================================
  function growth(id) {
    const { trackers, byT } = ctx.logs.data(), ts = trackers.filter(t => t.owner === id && !t.archived), today = dayKey();
    const days = new Map();
    for (const t of ts) for (const l of (byT.get(t.id) || new Map()).values()) {
      if (!(l.amount > 0) || l.day > today) continue;
      const d = days.get(l.day) || { done: 0, met: 0 }, g = goalOf(t);
      d.done++; if (!g || l.amount >= g) d.met++;
      days.set(l.day, d);
    }
    const perfect = Math.max(1, Math.ceil(ts.length * 2 / 3));
    let xp = 0, treats = 0;
    for (const d of days.values()) { xp += d.done * 10 + d.met * 5; if (d.met >= perfect) treats++; }
    if (id === me.id && ctx.achCount) xp += ctx.achCount() * 30;
    let level = 1, need = 100, rest = xp;
    while (rest >= need) { rest -= need; level++; need = 100 + (level - 1) * 50; }
    const td = days.get(today), yd = days.get(addDays(today, -1)), dd = days.get(addDays(today, -2)), h = new Date().getHours();
    const mood = !ts.length ? ['👋', '만나서 반가워요! 습관을 하나 만들어 볼까요?']
      : td && td.met >= ts.length ? ['🤩', '신났어요! 오늘 목표를 다 채웠어요']
      : td && td.met >= perfect ? ['😋', '간식 받을 만큼 했어요!']
      : td ? ['😊', '기분 좋아요. 조금만 더 해 볼까요?']
      : !yd && dd ? ['🥺', '어제 기록이 없어서 조금 시무룩해요…']
      : h >= 18 ? ['🥱', '심심해요… 하나만 같이 해요'] : ['🐾', '오늘도 같이 해요!'];
    const fed = (petState[id] && petState[id].fed) || 0;
    return { level, xp, into: rest, need, treats, fed, left: Math.max(0, treats - fed), mood, todayPerfect: !!(td && td.met >= perfect) };
  }
  const levelOf = id => growth(id).level;

  function renderSlot() {
    watchNotes();
    const el = $('lgPetSlot'); if (!el) return;
    const p = petInfo(me), m = moodFor(me.id), note = notes[notes.length - 1], g = growth(me.id), today = dayKey();
    const myCheers = cheers.filter(c => c.to === me.id && c.day === today).slice(-3);
    const dl = dailyLine(today);
    const showLunch = new Date().getHours() >= 11 || (m && m.lunch);
    el.innerHTML = `<section class="pet-card">
      <div class="pet-top">${p.img ? `<img class="pet-img" alt="" src="${p.img}">` : '<span class="pet-img">🐾</span>'}
        <div class="pet-who"><b>${esc(p.name)}</b><small>${note ? `${esc(SLOT[note.slot.replace('-test', '')]?.[0] || '')} · ${new Date(note.at).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })}` : '펫 비서'}</small></div>
        <button class="pet-set" data-pet="settings" type="button" aria-label="펫 비서 설정">⚙︎ 설정</button></div>
      <div class="pet-grow"><span class="pet-lv">Lv.${g.level}</span><div class="pet-xp" title="다음 레벨까지 ${g.need - g.into} XP"><i style="width:${Math.round(g.into / g.need * 100)}%"></i></div><small>${g.into}/${g.need} XP</small>
        <button class="pet-feed${g.left ? '' : ' empty'}" data-pet="feed" type="button" ${g.left ? '' : 'disabled'} title="${g.left ? '간식 주기' : '목표를 넉넉히 채운 날마다 간식이 하나씩 생겨요'}">🍖 간식 ${g.left}</button></div>
      <div class="pet-feel">${g.mood[0]} ${esc(g.mood[1])}</div>
      <p class="pet-say">${esc(note ? note.text : greet())}</p>
      ${myCheers.length ? `<div class="pet-cheers">${myCheers.map(c => `<span>${esc(c.emoji || '👏')} ${esc(ctx.nameOf(c.from))}님이 응원했어요${c.label ? ` · ${esc(c.label)}` : ''}</span>`).join('')}</div>` : ''}
      <button class="pet-chat-btn" data-pet="chat" type="button"><span>✦</span> ${esc(p.name)}에게 말 걸기 <small>"운동 30분 했어", "오늘 뭐부터 할까?"</small></button>
      <div class="pet-q">오늘 기분은?</div>
      <div class="mood-row" role="radiogroup" aria-label="오늘 기분">${MOODS.slice(1).map((x, i) => `<button type="button" role="radio" aria-checked="${m && m.score === i + 1}" data-mood="${i + 1}"><span>${x[0]}</span><small>${x[1]}</small></button>`).join('')}</div>
      ${m && m.score ? `<form class="pet-form" data-form="note"><input name="v" maxlength="200" placeholder="한마디 남기기 (선택)" value="${esc(m.note || '')}" aria-label="오늘 한마디"><button type="submit">저장</button></form>` : ''}
      ${showLunch ? `<form class="pet-form" data-form="lunch"><span>🍱</span><input name="v" maxlength="100" placeholder="점심 뭐 먹었어요?" value="${esc((m && m.lunch) || '')}" aria-label="오늘 점심"><button type="submit">저장</button></form>` : ''}
    </section>
    <section class="daily-card"><div class="lg-kicker">오늘의 ${dl.kind === 'quiz' ? '퀴즈' : '한 줄'}</div>
      ${dl.kind === 'quiz' ? `<p class="daily-q">${esc(dl.q)}</p><button type="button" class="daily-a${quizOpen ? ' open' : ''}" data-pet="quiz">${quizOpen ? esc(dl.a) : '정답 보기'}</button>`
        : `<p class="daily-q">“${esc(dl.text)}”</p><small class="daily-by">— ${esc(dl.by)}</small>`}
    </section>`;
    if (fedAnim && Date.now() - fedAnim < 1500) el.querySelector('.pet-img')?.classList.add('fed');
  }
  const save = (patch, msg) => work.saveMood(dayKey(), { ...patch, shared: settings ? !!settings.shareMood : true })
    .then(() => msg && toast(msg)).catch(e => toast('저장하지 못했어요 (' + (e.code || e.message) + ')'));

  document.addEventListener('click', e => {
    const ch = e.target.closest('#paneToday [data-cheer]');
    if (ch) return sendCheer(ch.dataset.to, ch.dataset.cheer, ch.dataset.label);
    const b = e.target.closest('#lgPetSlot [data-mood], #lgPetSlot [data-pet]'); if (!b) return;
    if (b.dataset.pet === 'settings') return openSettings();
    if (b.dataset.pet === 'feed') return feed();
    if (b.dataset.pet === 'quiz') { quizOpen = !quizOpen; return renderSlot(); }
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

  async function feed() {
    const g = growth(me.id); if (!g.left) return;
    fedAnim = Date.now();
    try {
      await work.feedPet(g.fed + 1, dayKey());
      ctx.onFeed && ctx.onFeed();
      const p = petInfo(me);
      toast(['🍖 냠냠! ', '🦴 와구와구! ', '🥕 오물오물! '][g.fed % 3] + `${p.name}가 좋아해요 💕`);
    } catch (err) { toast('간식을 주지 못했어요 (' + (err.code || err.message) + ')'); }
  }
  // 👏 응원: 상대 습관 옆 버튼. 같은 습관은 하루 한 번
  const cheered = (to, tid) => cheers.some(c => c.from === me.id && c.to === to && c.tracker === tid && c.day === dayKey());
  async function sendCheer(to, tid, label) {
    if (!to || cheered(to, tid)) return;
    const emoji = ['👏', '🙌', '🔥', '💪', '✨'][Math.floor(Math.random() * 5)];
    try {
      await work.sendCheer({ to, tracker: tid || '', label: label || '', emoji, day: dayKey() });
      ctx.notify && ctx.notify([to], 'cheer', `${emoji} ${me.name}님의 응원`, `${label ? label + ' ' : ''}응원해요! 오늘도 같이 해요`, 'cheer-' + tid, './#today');
      toast(`${emoji} ${ctx.nameOf(to)}님께 응원을 보냈어요`);
    } catch (err) { toast('응원을 보내지 못했어요 (' + (err.code || err.message) + ')'); }
  }

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
      <p class="pet-conn" id="petConn">서버 연결 확인 중…</p>
      <div class="lg-drow"><button class="lg-btn ghost" type="button" data-close>닫기</button><button class="lg-btn primary" type="submit">저장</button></div>
    </form>`;
    dlg.showModal();
    ctx.petApi({ action: 'status' }).then(r => { const el = $('petConn'); if (el) el.innerHTML = r.connected ? '🟢 정해진 시간 알림 <b>켜짐</b> · 이 계정 로그인으로 서버가 대신 읽어요' : '⚪ 정해진 시간 알림 <b>꺼짐</b> · 저장을 누르면 켜져요'; })
      .catch(() => { const el = $('petConn'); if (el) el.textContent = ''; });
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
    try {
      await work.saveAssistant(o); settings = { ...settings, ...o };
      // 하나라도 켜져 있으면 서버에 내 로그인을 맡겨 정해진 시간에 보낼 수 있게, 다 끄면 지운다
      const any = Object.keys(SLOT).some(k => o[k + 'On']);
      const r = await ctx.petApi(any ? { action: 'enable', refreshToken: ctx.refreshToken() } : { action: 'disable' }).catch(e => ({ error: e.message }));
      dlg.close();
      toast(r.error ? `저장했지만 서버 연결은 실패했어요: ${r.error}` : any ? '🐾 저장했어요. 정한 시간에 펫이 말을 걸어요' : '🐾 저장했어요. 정해진 시간 알림은 꺼졌어요');
    }
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
    const endOf = e => (e.endDay && e.endDay > e.day ? e.endDay : e.day);
    const events = (ctx.events() || []).filter(e => e.day <= until && endOf(e) >= today).sort((a, b) => (a.day + (a.time || '99')) < (b.day + (b.time || '99')) ? -1 : 1)
      .slice(0, 20).map(e => ({ day: e.day, ...(endOf(e) > e.day ? { until: endOf(e) } : {}), time: e.time || '하루 종일', title: e.title, who: e.cal === 'unframe' ? '언프레임(회사)' : e.cal === 'kuns' ? '쿤스갤러리(회사)' : e.owner === me.id ? '나' : (ctx.nameOf(e.owner) + '님') }));
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

  // ==================================================================
  //  📮 편지함 + 🔮 내 패턴 찾기 (성취 탭)
  // ==================================================================
  const INS_KEY = 'unframe-insight-' + me.id;
  const loadIns = () => { try { return JSON.parse(localStorage.getItem(INS_KEY)); } catch { return null; } };
  let insBusy = false, openLetter = null;
  function renderAchExtra() {
    const el = $('lgAchExtra'); if (!el) return;
    const ins = loadIns();
    const ls = [...letters].sort((a, b) => (b.week + b.member < a.week + a.member ? -1 : 1)).slice(0, 12);
    el.innerHTML = `
      <section class="lg-sec dark" id="lgInsights">
        <div class="lg-kicker">내 패턴 찾기</div>
        <p class="lg-lede">최근 90일 기록과 기분을 AI가 살펴보고 숨은 패턴을 찾아요.</p>
        ${ins && ins.items ? `<ul class="ins-list">${ins.items.map(x => `<li><span class="ins-e">${esc(x.emoji || '🔮')}</span><div><b>${esc(x.title)}</b><p>${esc(x.detail)}</p></div></li>`).join('')}</ul><small class="ins-when">${new Date(ins.at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}에 찾았어요</small>` : ''}
        <button class="lg-btn primary" data-ins="1" type="button" ${insBusy ? 'disabled' : ''}>${insBusy ? '🔮 살펴보는 중…' : ins ? '🔮 다시 찾기' : '🔮 내 패턴 찾기'}</button>
      </section>
      <section class="lg-sec light tight" id="lgLetters">
        <div class="lg-kicker">편지함</div>
        <p class="lg-lede">매주 일요일 저녁, 펫이 한 주를 돌아보는 편지를 써요. 둘의 편지를 같이 볼 수 있어요.</p>
        ${ls.length ? `<ul class="letter-list">${ls.map(l => `<li class="${l.member === me.id ? 'mine' : 'theirs'}${openLetter === l.id ? ' open' : ''}"><button type="button" data-letter="${esc(l.id)}">
          <span class="letter-top"><b>📮 ${esc(l.pet || '펫')}</b><small>${esc(ctx.nameOf(l.member))}님께 · ${esc(fmtWeek(l.week))}</small></span>
          <span class="letter-text">${esc(l.text)}</span></button></li>`).join('')}</ul>` : '<p class="lg-lede">아직 편지가 없어요. 이번 일요일 저녁을 기다려 주세요 🐾</p>'}
        <button class="lg-btn" data-letternow="1" type="button">이번 주 편지 지금 받아 보기</button>
      </section>`;
  }
  const fmtWeek = w => { const d = parseDay(w), e = parseDay(addDays(w, 6)); return `${d.getMonth() + 1}/${d.getDate()}~${e.getMonth() + 1}/${e.getDate()}`; };
  /** 패턴 찾기에 보낼 사실들: 요일별 기록률, 최근 30일 vs 이전 30일, 기분과 습관 */
  function facts() {
    const today = dayKey(), { trackers, byT } = ctx.logs.data(), WD = ['일', '월', '화', '수', '목', '금', '토'];
    const days = [...Array(90)].map((_, i) => addDays(today, -89 + i));
    const myMoods = new Map(moods.filter(m => m.owner === me.id && m.score).map(m => [m.day, m.score]));
    const habits = trackers.filter(t => t.owner === me.id && !t.archived).map(t => {
      const d = byT.get(t.id) || new Map(), amt = k => (d.get(k) ? d.get(k).amount : 0);
      const byWd = Array(7).fill(0).map(() => [0, 0]);
      days.forEach(k => { const w = parseDay(k).getDay(); byWd[w][1]++; if (amt(k) > 0) byWd[w][0]++; });
      const rate = byWd.map(([a, b], w) => ({ wd: WD[w], pct: b ? Math.round(a / b * 100) : 0 }));
      const sum = (from, to) => days.slice(from, to).reduce((a, k) => a + amt(k), 0);
      const on = [], off = [];
      days.forEach(k => { if (myMoods.has(k)) (amt(k) > 0 ? on : off).push(myMoods.get(k)); });
      const avg = a => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 10) / 10 : null);
      const st = statsFor(t, d, today);
      return { name: `${t.emoji || ''} ${t.name}`.trim(), unit: t.unit === 'minutes' ? '분' : t.unit === 'check' ? '회' : (t.unitLabel || '개'), daysDone90: days.filter(k => amt(k) > 0).length,
        weekdayRate: rate, last30: sum(60, 90), prev30: sum(30, 60), streak: st.streak, best: st.best,
        moodWhenDone: avg(on), moodWhenNot: avg(off), moodSamples: [on.length, off.length] };
    });
    const moodByWd = Array(7).fill(0).map(() => []);
    for (const [k, v] of myMoods) if (k >= days[0]) moodByWd[parseDay(k).getDay()].push(v);
    return { today, habits, moodDays: [...myMoods.keys()].filter(k => k >= days[0]).length,
      moodByWeekday: moodByWd.map((a, w) => ({ wd: WD[w], avg: a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 10) / 10 : null, n: a.length })) };
  }
  async function findPatterns() {
    insBusy = true; renderAchExtra();
    try {
      const r = await petChat({ mode: 'insight', facts: facts(), pet: { name: petInfo(me).name, ko: petInfo(me).ko } });
      if (!r.insights || !r.insights.length) throw new Error('찾은 패턴이 없어요. 기록이 더 쌓이면 다시 해 봐요');
      try { localStorage.setItem(INS_KEY, JSON.stringify({ at: Date.now(), items: r.insights.slice(0, 5) })); } catch {}
    } catch (err) { toast('패턴을 찾지 못했어요: ' + err.message); }
    insBusy = false; renderAchExtra();
  }
  document.addEventListener('click', async e => {
    if (e.target.closest('#lgAchExtra [data-ins]')) return findPatterns();
    const lt = e.target.closest('#lgAchExtra [data-letter]');
    if (lt) { openLetter = openLetter === lt.dataset.letter ? null : lt.dataset.letter; return renderAchExtra(); }
    const ln = e.target.closest('#lgAchExtra [data-letternow]');
    if (ln) {
      ln.disabled = true; ln.textContent = '📮 펫이 편지 쓰는 중…';
      try { const r = await petNow('letter'); if (r.text) { toast('📮 편지가 왔어요'); if (r.demo) { letters.push({ id: 'demo-' + Date.now(), member: me.id, week: addDays(dayKey(), -((parseDay(dayKey()).getDay() + 6) % 7)), pet: petInfo(me).name, text: r.text, at: Date.now() }); } } }
      catch (err) { toast('편지를 받지 못했어요: ' + err.message); }
      renderAchExtra();
    }
  });

  // 구독은 맨 끝에서 시작 (데모 저장소는 바로 콜백을 불러서, 위의 함수들이 먼저 준비돼 있어야 한다)
  work.getAssistant().then(a => { settings = { ...DEFAULTS, ...(a || {}) }; }).catch(() => { settings = { ...DEFAULTS }; });
  work.onMoods(list => { moods = list; renderSlot(); ctx.changed && ctx.changed(); }, () => {});
  watchNotes();
  let lettersLoaded = false, cheersLoaded = false;
  work.onLetters(list => {
    if (lettersLoaded && ctx.inbox) { const prev = new Set(letters.map(l => l.id)); for (const l of list) if (!prev.has(l.id) && l.owner === me.id) ctx.inbox({ title: '📮 펫이 이번 주 편지를 보냈어요', body: String(l.text || '').slice(0, 120), tag: 'letter-' + l.id, url: './#letters' }); }
    letters = list; lettersLoaded = true; renderAchExtra();
  });
  work.onCheers(list => {
    if (cheersLoaded && ctx.inbox) { const prev = new Set(cheers.map(c => c.id)); for (const c of list) if (!prev.has(c.id) && c.to === me.id && c.from !== me.id) ctx.inbox({ title: `👏 ${ctx.nameOf(c.from)}님이 응원했어요`, body: c.label ? `${c.label} 응원해요! 오늘도 같이 해요` : '오늘도 같이 해요', tag: 'cheer-' + c.id, url: './#today' }); }
    cheers = list; cheersLoaded = true; renderSlot(); ctx.changed && ctx.changed();
  });
  work.onPetState(st => { petState = st; renderSlot(); ctx.onLevels && ctx.onLevels(); });

  return {
    levelOf, growth, cheered, renderAchExtra,
    openLetters() { setTimeout(() => $('lgLetters')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250); },
    renderSlot, moodFor, openSettings, openChat,
    moods: () => moods,
    focus(kind) {
      const el = $('lgPetSlot'); if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (kind === 'lunch') setTimeout(() => el.querySelector('[data-form=lunch] input')?.focus(), 300);
    },
  };
}
