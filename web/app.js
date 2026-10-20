// Claude Office — 로그인, 데이터(Firebase 또는 데모), 채팅, 알림
import { MEMBERS } from './members.js';
import { firebaseConfig } from './firebase-config.js';
import * as office from './office.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const NOT_CONFIGURED = firebaseConfig.apiKey.startsWith('PASTE');
const DEMO = NOT_CONFIGURED || new URLSearchParams(location.search).has('demo');
const STALE_MS = 3 * 3600_000;        // 3시간 넘게 소식 없는 세션은 숨김
const byId = Object.fromEntries(MEMBERS.map(m => [m.id, m]));
const nameOf = id => (byId[id] && byId[id].name) || id || '?';
// 공개 파일(members.js)에는 이메일이 없고 해시만 있다
async function memberForEmail(email) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('claude-office:' + email));
  const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  return MEMBERS.find(m => m.emailHash === hex) || null;
}
office.setUserChars(Object.fromEntries(MEMBERS.map(m => [m.name, m.char ?? 0])));
office.setReservedDesks(MEMBERS.length);   // 앞쪽 책상은 사람 자리
// 각자 꾸민 생김새 (Firestore profiles). 없으면 members.json의 기본 캐릭터
let profiles = {};
function look(m) {
  const p = (m && profiles[m.id]) || {}, base = m && m.char != null ? m.char : office.charFor(m ? m.name : '?');
  return {
    char: p.char ?? base, hue: p.hue ?? 0,
    claudeChar: p.claudeChar ?? base, claudeHue: p.claudeHue ?? office.HUE.main,
    claudeName: (p.claudeName || '').trim() || `${m ? m.name : '?'}의 Claude`,
  };
}
const avatar = m => { const l = look(m); return office.avatarFor(l.char, l.hue); };
const claudeAvatar = m => { const l = look(m); return office.avatarFor(l.claudeChar, l.claudeHue); };
const claudeName = id => look(byId[id] || { name: nameOf(id) }).claudeName;
// 사람 상태
const STATUS = { work: '💼 근무 중', meeting: '📅 회의 중', focus: '🎧 집중', out: '🚶 외근', off: '🌙 퇴근' };
let myStatus = 'work';
try { myStatus = localStorage.getItem('office-status') || 'work'; } catch {}
const quiet = () => myStatus === 'focus';   // 집중 모드: 메시지·요청 알림 끔 (내 Claude 알림은 유지)

const today = () => OfficeState.dayOf(Date.now());
// 두 개의 실시간 구독 결과를 id 기준으로 합친다
function merged(cb) {
  const parts = [[], []];
  return i => list => { parts[i] = list; cb([...new Map([...parts[0], ...parts[1]].map(x => [x.id, x])).values()]); };
}

let me = null;      // 로그인한 멤버
let store = null;

// ======================================================================
//  데이터 저장소: Firebase
// ======================================================================
async function firebaseStore() {
  const base = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const [{ initializeApp }, A, F] = await Promise.all([
    import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js'),
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app), db = F.getFirestore(app);
  const ms = d => { const at = d.data({ serverTimestamps: 'estimate' }).at; return at && at.toMillis ? at.toMillis() : Date.now(); };
  return {
    onAuth: cb => A.onAuthStateChanged(auth, u => cb(u ? { email: (u.email || '').toLowerCase(), verified: u.emailVerified } : null)),
    signIn: () => { const p = new A.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' }); return A.signInWithPopup(auth, p); },
    signOut: () => A.signOut(auth),
    onSessions: (cb, err) => F.onSnapshot(F.collection(db, 'sessions'), s => cb(s.docs.map(d => d.data())), err),
    onMessages: (chatId, cb, err) => F.onSnapshot(
      F.query(F.collection(db, 'chats', chatId, 'messages'), F.orderBy('at'), F.limitToLast(200)),
      s => cb(s.docs.map(d => ({ id: d.id, from: d.data().from, text: d.data().text, at: ms(d), pending: d.metadata.hasPendingWrites }))), err),
    send: (chatId, text) => F.addDoc(F.collection(db, 'chats', chatId, 'messages'), { from: me.id, text, at: F.serverTimestamp() }),
    onProfiles: cb => F.onSnapshot(F.collection(db, 'profiles'), s => cb(Object.fromEntries(s.docs.map(d => [d.id, d.data()])))),
    saveProfile: p => F.setDoc(F.doc(db, 'profiles', me.id), p),
    heartbeat: status => F.setDoc(F.doc(db, 'presence', me.id), { at: F.serverTimestamp(), status }),
    onPresence: cb => F.onSnapshot(F.collection(db, 'presence'), s => cb(Object.fromEntries(s.docs.map(d => [d.id, { at: ms(d), status: d.data().status || 'work' }])))),
    // ✨ AI 요약 (Netlify Function이 멤버인지 확인한 뒤 Claude API 호출)
    summarize: async text => {
      const res = await fetch('/.netlify/functions/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await auth.currentUser.getIdToken() },
        body: JSON.stringify({ text }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'HTTP ' + res.status);
      return j.summary;
    },
    connectCode: () => b64url(JSON.stringify({ k: firebaseConfig.apiKey, p: firebaseConfig.projectId, r: auth.currentUser.refreshToken, i: me.id, e: me.name, o: location.origin })),

    // 📋 화이트보드: 아직 안 끝난 것 전부 + 오늘 끝낸 것
    onBoard: (cb, err) => {
      const m = merged(cb), board = F.collection(db, 'board');
      const conv = s => s.docs.map(d => ({ ...d.data(), id: d.id, at: ms(d) }));
      F.onSnapshot(F.query(board, F.where('done', '==', false)), s => m(0)(conv(s)), err);
      F.onSnapshot(F.query(board, F.where('doneDay', '==', today())), s => m(1)(conv(s)), err);
    },
    addBoard: (text, assignee, due) => F.addDoc(F.collection(db, 'board'), { text, by: me.id, at: F.serverTimestamp(), day: today(), done: false, doneBy: null, doneDay: null, assignee: assignee || null, due: due || null }),
    updateBoard: (it, patch) => F.updateDoc(F.doc(db, 'board', it.id), patch),
    toggleBoard: it => F.updateDoc(F.doc(db, 'board', it.id), it.done ? { done: false, doneBy: null, doneDay: null } : { done: true, doneBy: me.id, doneDay: today() }),
    deleteBoard: it => F.deleteDoc(F.doc(db, 'board', it.id)),
    getBoardDone: async day => (await F.getDocs(F.query(F.collection(db, 'board'), F.where('doneDay', '==', day)))).docs.map(d => ({ ...d.data(), id: d.id })),

    // 🙋 확인 요청: 내가 받은 것 + 내가 보낸 것
    onRequests: (cb, err) => {
      const m = merged(cb), reqs = F.collection(db, 'requests');
      const conv = s => s.docs.map(d => { const x = d.data({ serverTimestamps: 'estimate' }); return { ...x, id: d.id, at: ms(d), repliedAt: x.repliedAt && x.repliedAt.toMillis ? x.repliedAt.toMillis() : 0 }; });
      F.onSnapshot(F.query(reqs, F.where('to', '==', me.id)), s => m(0)(conv(s)), err);
      F.onSnapshot(F.query(reqs, F.where('from', '==', me.id)), s => m(1)(conv(s)), err);
    },
    createRequest: ({ to, text, project, link }) => F.addDoc(F.collection(db, 'requests'), { from: me.id, to, text, project: project || '', link: link || '', status: 'open', at: F.serverTimestamp(), day: today() }),
    replyRequest: (r, status, reply) => F.updateDoc(F.doc(db, 'requests', r.id), { status, reply: reply || '', repliedAt: F.serverTimestamp() }),
    cancelRequest: r => F.updateDoc(F.doc(db, 'requests', r.id), { status: 'canceled' }),

    // 📓 업무일지 (각자 PC 훅이 올린 하루치 기록)
    getJournal: async day => (await F.getDocs(F.query(F.collection(db, 'journal'), F.where('day', '==', day)))).docs.map(d => d.data()),
  };
}
function b64url(s) { return btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }

// ======================================================================
//  데이터 저장소: 데모 (Firebase 설정 전이나 ?demo 로 열었을 때)
// ======================================================================
function demoStore() {
  const sessions = new Map(), chats = {}, subs = { sessions: [], msgs: {}, board: [], reqs: [], presence: [] };
  const profilesDemo = {};
  const presenceDemo = Object.fromEntries(MEMBERS.map((m, i) => [m.id, { at: Date.now(), status: i ? 'focus' : 'work' }]));
  const journals = {}, board = [], reqs = [];
  const uid = () => Math.random().toString(36).slice(2);
  const pushBoard = () => subs.board.forEach(cb => cb(board.filter(x => !x.done || x.doneDay === today()).map(x => ({ ...x }))));
  const pushReqs = () => subs.reqs.forEach(cb => cb(reqs.map(x => ({ ...x }))));
  let authCb = null;
  const other = MEMBERS[1] || MEMBERS[0];
  const pushSessions = () => subs.sessions.forEach(cb => cb([...sessions.values()]));
  const pushChat = id => (subs.msgs[id] || []).forEach(cb => cb((chats[id] || []).slice()));
  const addMsg = (id, from, text) => { (chats[id] = chats[id] || []).push({ id: Math.random().toString(36).slice(2), from, text, at: Date.now() }); pushChat(id); };

  function fake(owner, sid, cwd) {
    const tools = [['Read', { file_path: 'src/app.tsx' }], ['Grep', { pattern: 'useState' }], ['Glob', { pattern: '**/*.css' }],
      ['Bash', { command: 'npm test' }], ['Bash', { command: 'git status' }], ['Edit', { file_path: 'src/Header.tsx' }],
      ['Write', { file_path: 'README.md' }], ['WebSearch', { query: 'next.js image optimization' }], ['WebFetch', { url: 'https://nextjs.org/docs' }],
      ['Bash', { command: 'git commit -m "헤더 레이아웃 모바일 대응"' }], ['Bash', { command: 'npm run build' }], ['Edit', { file_path: 'src/pages/Login.tsx' }]];
    const pick = a => a[Math.floor(Math.random() * a.length)];
    const ev = e => {
      const full = { session_id: sid, cwd, ...e };
      const jid = owner + '__' + today();
      journals[jid] = { ...OfficeState.applyJournal(journals[jid] && journals[jid].day === today() ? journals[jid] : null, full).journal, owner };
      const r = OfficeState.applyEvent(sessions.get(sid) && structuredClone(sessions.get(sid)), full);
      if (r.deleted) sessions.delete(sid); else sessions.set(sid, { ...r.session, owner });
      if (r.write) pushSessions();
    };
    let n = 0;
    ev({ hook_event_name: 'SessionStart' });
    const tick = () => {
      const s = sessions.get(sid), r = Math.random();
      if (s.state === 'idle' && r < 0.6) ev({ hook_event_name: 'UserPromptSubmit' });
      else if (r < 0.07) ev({ hook_event_name: 'Notification', message: 'Claude needs your permission to use Bash' });
      else if (r < 0.12) ev({ hook_event_name: 'Stop' });
      else if (r < 0.17 && !s.subs.length) {
        const id = sid + 'tu' + (++n), agent = sid + 'ag' + n;
        ev({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_use_id: id, tool_input: { description: pick(['코드베이스 탐색', '테스트 조사', '문서 정리']) } });
        let steps = 4 + Math.floor(Math.random() * 4);
        const sub = () => {
          if (steps-- <= 0) { ev({ hook_event_name: 'SubagentStop', agent_id: agent }); ev({ hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_use_id: id }); return; }
          const [tool, input] = pick(tools);
          ev({ hook_event_name: 'PreToolUse', agent_id: agent, agent_type: 'Explore', tool_name: tool, tool_input: input });
          setTimeout(sub, 2500 + Math.random() * 2500);
        };
        setTimeout(sub, 1200);
      } else {
        const [tool, input] = pick(tools);
        ev({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input });
        setTimeout(() => ev({ hook_event_name: 'PostToolUse', tool_name: tool }), 2500);
      }
      setTimeout(tick, 3500 + Math.random() * 3000);
    };
    setTimeout(tick, 1000 + Math.random() * 1500);
  }

  return {
    onAuth: cb => { authCb = cb; cb(null); },
    signIn: async () => {
      authCb({ demoMember: MEMBERS[0], verified: true });
      fake(MEMBERS[0].id, 'demo-1', '/work/unframe-mag');
      if (other !== MEMBERS[0]) fake(other.id, 'demo-2', '/work/admin-dashboard');
      const dm = chatIdWith(other.id);
      addMsg(dm, other.id, `${MEMBERS[0].name}님 안녕하세요! 데모 채팅이에요 😊`);
      setTimeout(() => addMsg(dm, other.id, '오늘 배포는 몇 시쯤 할까요?'), 9000);
      // 데모용 화이트보드와 확인 요청
      const t = Date.now();
      const tomorrow = OfficeState.dayOf(t + 86400_000), yesterday = OfficeState.dayOf(t - 86400_000);
      board.push({ id: uid(), text: '랜딩 페이지 헤더 모바일 대응', by: MEMBERS[0].id, at: t, day: today(), done: false, doneBy: null, doneDay: null, assignee: MEMBERS[0].id, due: today() },
        { id: uid(), text: '오후 3시 배포', by: other.id, at: t, day: today(), done: false, doneBy: null, doneDay: null, assignee: MEMBERS[0].id, due: yesterday },
        { id: uid(), text: '10월 정산 자료 정리', by: other.id, at: t, day: today(), done: false, doneBy: null, doneDay: null, assignee: other.id, due: tomorrow },
        { id: uid(), text: '10월 뉴스레터 원고 검토', by: other.id, at: t, day: today(), done: true, doneBy: other.id, doneDay: today() });
      pushBoard();
      setTimeout(() => {
        reqs.push({ id: uid(), from: other.id, to: MEMBERS[0].id, text: '관리자 로그인 화면 수정했어요. 확인 부탁드려요!', project: 'admin-dashboard', link: 'https://example.com/preview', status: 'open', at: Date.now(), day: today() });
        pushReqs();
      }, 12000);
    },
    signOut: async () => location.reload(),
    onSessions: cb => { subs.sessions.push(cb); cb([...sessions.values()]); },
    onMessages: (id, cb) => { (subs.msgs[id] = subs.msgs[id] || []).push(cb); cb((chats[id] || []).slice()); },
    send: async (id, text) => {
      addMsg(id, me.id, text);
      if (id.startsWith('dm__') && other !== MEMBERS[0])
        setTimeout(() => addMsg(id, other.id, ['넵 확인했습니다 👍', '좋아요! 그렇게 진행할게요', '잠시만요, 확인하고 알려드릴게요'][Math.floor(Math.random() * 3)]), 2500);
    },
    onProfiles: cb => { subs.profiles = cb; cb({}); },
    saveProfile: async p => { profilesDemo[me.id] = p; subs.profiles && subs.profiles({ ...profilesDemo }); },
    heartbeat: async status => { presenceDemo[me.id] = { at: Date.now(), status }; subs.presence.forEach(cb => cb({ ...presenceDemo })); },
    onPresence: cb => { subs.presence.push(cb); cb({ ...presenceDemo }); },
    summarize: async text => {
      await new Promise(r => setTimeout(r, 1200));
      return `(데모 요약) 오늘은 두 분 모두 Claude와 함께 꾸준히 작업했어요. ${MEMBERS[0].name}님은 unframe-mag 쪽 화면 수정과 빌드를, ${other.name}님은 admin-dashboard 정리를 진행한 것으로 보여요.\n\n• 확인 필요: 남은 할 일과 대기 중인 확인 요청을 챙겨주세요.\n\n실제 배포에서는 Claude가 업무일지 내용을 읽고 이 자리에 요약을 써요.`;
    },
    connectCode: () => 'DEMO_CODE_설정_후_다시_열기',
    onBoard: cb => { subs.board.push(cb); pushBoard(); },
    addBoard: async (text, assignee, due) => { board.push({ id: uid(), text, by: me.id, at: Date.now(), day: today(), done: false, doneBy: null, doneDay: null, assignee: assignee || null, due: due || null }); pushBoard(); },
    updateBoard: async (it, patch) => { Object.assign(board.find(b => b.id === it.id), patch); pushBoard(); },
    toggleBoard: async it => { const x = board.find(b => b.id === it.id); Object.assign(x, x.done ? { done: false, doneBy: null, doneDay: null } : { done: true, doneBy: me.id, doneDay: today() }); pushBoard(); },
    deleteBoard: async it => { board.splice(board.findIndex(b => b.id === it.id), 1); pushBoard(); },
    getBoardDone: async day => board.filter(x => x.doneDay === day),
    onRequests: cb => { subs.reqs.push(cb); pushReqs(); },
    createRequest: async ({ to, text, project, link }) => {
      const r = { id: uid(), from: me.id, to, text, project: project || '', link: link || '', status: 'open', at: Date.now(), day: today() };
      reqs.push(r); pushReqs();
      setTimeout(() => { Object.assign(r, { status: 'ok', reply: '확인했어요, 좋아요 👍', repliedAt: Date.now() }); pushReqs(); }, 5000);
    },
    replyRequest: async (r, status, reply) => { Object.assign(reqs.find(x => x.id === r.id), { status, reply: reply || '', repliedAt: Date.now() }); pushReqs(); },
    cancelRequest: async r => { reqs.find(x => x.id === r.id).status = 'canceled'; pushReqs(); },
    getJournal: async day => Object.values(journals).filter(j => j.day === day).map(j => structuredClone(j)),
  };
}

// ======================================================================
//  로그인 화면
// ======================================================================
function showGate(err) {
  $('gate').hidden = false;
  $('gateErr').hidden = !err; $('gateErr').textContent = err || '';
}
async function boot() {
  await office.ready;
  $('gateChars').innerHTML = [0, 1, 2, 3, 4, 5].map(i => `<img alt="" src="${office.avatarFor(i, 0)}">`).join('');
  try { store = DEMO ? demoStore() : await firebaseStore(); }
  catch (e) { showGate('Firebase를 불러오지 못했어요: ' + e.message); return; }
  if (DEMO) {
    $('signin').hidden = true; $('demoBtn').hidden = false;
    $('modeNote').textContent = NOT_CONFIGURED ? '데모 모드 · Firebase 설정 전' : '데모 모드';
  }
  $('signin').onclick = () => store.signIn().catch(e => showGate(loginError(e)));
  $('demoBtn').onclick = () => store.signIn();
  $('signout').onclick = () => store.signOut();

  let started = false;
  store.onAuth(async user => {
    if (!user) { me = null; showGate(); return; }
    const m = user.demoMember || await memberForEmail(user.email);
    if (!m || !user.verified) {
      showGate(`${user.email} 계정은 사무실 멤버가 아니에요. 관리자에게 추가를 요청하세요.`);
      $('signin').textContent = '다른 계정으로 로그인';
      store.signOut();
      return;
    }
    me = m;
    $('gate').hidden = true;
    $('me').innerHTML = `<img alt="" src="${avatar(m)}"><span>${esc(m.name)} <small>${esc(m.title || '')}</small></span>`;
    if (!started) { started = true; startOffice(); }
  });
}
function loginError(e) {
  const code = e && e.code || '';
  if (code.includes('popup-closed')) return '';
  if (code.includes('unauthorized-domain')) return `이 주소(${location.host})가 Firebase 승인 도메인에 없어요. Firebase 콘솔 → Authentication → 설정 → 승인된 도메인에 추가하세요.`;
  return '로그인 실패: ' + (e.message || code);
}

// ======================================================================
//  사무실 + 세션
// ======================================================================
let sessions = [];
function applyProfiles() {
  office.setProfiles(Object.fromEntries(MEMBERS.map(m => [m.name, look(m)])));
  if (me) $('me').innerHTML = `<img alt="" src="${avatar(me)}"><span>${esc(me.name)} <small>${esc(me.title || '')}</small></span>`;
}
function startOffice() {
  office.start($('c'), $('stage'), onOfficeEvent);
  applyProfiles();
  store.onProfiles(p => {
    profiles = p; applyProfiles();
    pushOffice(); renderChat(); renderBoard(); renderRequests();
  }, err => toast('꾸미기 정보를 불러오지 못했어요 (' + err.code + ')'));
  const conn = $('conn');
  store.onSessions(docs => {
    conn.classList.add('on'); conn.lastChild.textContent = '실시간 연결됨';
    const now = Date.now();
    sessions = docs.filter(d => now - (d.updatedAt || 0) < STALE_MS).map(d => ({ ...d, user: nameOf(d.owner) }))
      .sort((a, b) => (a.firstSeen || 0) - (b.firstSeen || 0));
    const log = sessions.flatMap(s => (s.log || []).map(l => ({ t: l.t, who: l.who || s.user, text: l.text })))
      .sort((a, b) => b.t - a.t).slice(0, 40);
    lastLog = log;
    pushOffice();
  }, err => { conn.classList.remove('on'); conn.lastChild.textContent = '연결 오류'; toast('데이터를 읽을 수 없어요. Firestore 규칙을 게시했는지 확인하세요. (' + err.code + ')'); });
  startChat();
  startBoard();
  startRequests();
  const beat = () => store.heartbeat(myStatus).catch(() => {});
  beat();
  setInterval(() => { if (!document.hidden) beat(); }, 60_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { beat(); markRead(); } });
  $('status').value = myStatus;
  $('status').onchange = () => {
    myStatus = $('status').value;
    try { localStorage.setItem('office-status', myStatus); } catch {}
    beat();
    toast(`내 상태: ${STATUS[myStatus]}${myStatus === 'focus' ? ' · 메시지 알림을 잠시 꺼요 (내 Claude 알림은 계속)' : ''}`);
  };
  setInterval(checkLongWaits, 30_000);
}

// 사무실 화면 갱신: Claude 세션 + 출근한 사람
let lastLog = [];
const isOnline = id => presence[id] && Date.now() - presence[id].at < 150_000;
function pushOffice() {
  const humans = MEMBERS.map((m, i) => ({ id: m.id, user: m.name, owner: m.id, status: (presence[m.id] || {}).status || 'work', desk: i }))
    .filter(h => isOnline(h.id) && h.status !== 'off' && h.status !== 'out');
  office.applySnapshot({ sessions, humans, log: lastLog, now: Date.now() });
  renderPeople(lastLog);
}

// ⏰ 승인 대기가 길어지면 다시 알림 (5분, 15분)
const renotified = new Set();
function checkLongWaits() {
  for (const s of sessions) {
    if (s.owner !== me.id || s.state !== 'wait') continue;
    const mins = Math.floor((Date.now() - s.updatedAt) / 60000);
    for (const th of [5, 15]) {
      const key = `${s.id}:${s.updatedAt}:${th}`;
      if (mins >= th && !renotified.has(key)) {
        renotified.add(key);
        chime('wait');
        notify(`⏰ Claude가 ${mins}분째 승인을 기다려요`, `${s.project} · ${s.detail || ''}`);
        toast(`⏰ ${s.project}: Claude가 ${mins}분째 승인을 기다리고 있어요.`);
      }
    }
  }
}

function onOfficeEvent(kind, s) {
  if (kind === 'board') { focusBoard(); return; }
  if (kind === 'human') {
    // 내 캐릭터 → 상태 바꾸기, 다른 사람 → 채팅
    if (s.owner === me.id) openLook();
    else if (chats[chatIdWith(s.owner)]) { active = chatIdWith(s.owner); renderChat(); $('input').focus(); }
    return;
  }
  if (kind === 'actor') {
    // 내 캐릭터 → 확인 요청, 다른 사람 캐릭터 → 그 사람과 채팅
    if (s.owner === me.id) openRequestDialog(s.project);
    else if (chats[chatIdWith(s.owner)]) { active = chatIdWith(s.owner); renderChat(); $('input').focus(); }
    return;
  }
  if (!me || s.owner !== me.id) return; // 내 Claude만 알림
  if (kind === 'wait') { chime('wait'); notify('🙋 Claude가 승인을 기다려요', `${s.project} · ${s.detail || ''}`); }
  if (kind === 'done') { chime('done'); notify('✅ 작업 완료', s.project); }
}

const STATE_KO = { read: '📚 자료 찾는 중', bash: '🖥 명령 실행 중', edit: '⌨️ 코드 작성 중', web: '📡 웹 조사 중',
  think: '💭 생각 중', plan: '📝 계획 세우는 중', wait: '🙋 승인 기다리는 중', idle: '☕ 휴식 중' };
function ago(ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  return s < 5 ? '방금' : s < 60 ? s + '초 전' : s < 3600 ? Math.floor(s / 60) + '분 전' : Math.floor(s / 3600) + '시간 전';
}
const hhmm = t => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
function renderPeople(log) {
  const team = MEMBERS.map(m => {
    const p = presence[m.id], on = isOnline(m.id), st = p && p.status ? p.status : 'work';
    return `<span class="mem${on ? '' : ' offline'}"><img class="ava sm" alt="" src="${avatar(m)}"><b>${esc(m.name)}</b> ${on ? STATUS[st] : '오프라인'}</span>`;
  }).join('');
  $('team').innerHTML = team;
  $('people').innerHTML = sessions.length ? sessions.map(s => {
    const extra = s.detail && s.state !== 'idle' ? ` · ${esc(s.tool ? s.tool + ' ' : '')}${esc(s.detail)}` : '';
    const m = byId[s.owner] || { name: s.user };
    return `<div class="who">
      <img alt="" src="${claudeAvatar(m)}" title="${esc(s.user)}님의 Claude">
      <span><b>🤖 ${esc(claudeName(s.owner))}</b> <span class="proj">${esc(s.project)}</span></span>
      <span class="ago" data-ts="${s.updatedAt}">${ago(s.updatedAt)}</span>
      <span class="st">${STATE_KO[s.state] || esc(s.state)}${extra}</span>
      ${s.subs && s.subs.length ? `<span class="subs">🛗 서브에이전트 ${s.subs.length}명: ${s.subs.map(x => esc(x.desc)).join(', ')}</span>` : ''}
      ${s.owner === me.id && MEMBERS.length > 1 ? `<button class="btn mini req-btn" data-req="${esc(s.project)}">🙋 확인 요청</button>` : ''}
    </div>`;
  }).join('') : '<div class="empty">지금 일하는 Claude가 없어요. 오른쪽 위 🔌 내 PC 연결부터 해보세요.</div>';
  $('log').innerHTML = log.map(l => `<li><time>${hhmm(l.t)}</time><span><b>${esc(l.who)}</b> ${esc(l.text)}</span></li>`).join('');
}
setInterval(() => document.querySelectorAll('[data-ts]').forEach(el => { el.textContent = ago(+el.dataset.ts); }), 1000);

// ======================================================================
//  채팅
// ======================================================================
// 메시지 속 http(s) 링크를 눌러 열 수 있게
const linkify = text => esc(text).replace(/https?:\/\/[^\s<]+[^\s<.,)!?]/g, u => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
function chatIdWith(id) { return 'dm__' + [me ? me.id : MEMBERS[0].id, id].sort().join('__'); }
const chats = {};   // id -> { id, title, peer(멤버 or null), msgs, loaded }
let active = null, presence = {};
const readKey = id => 'office-read-' + id;
const getRead = id => { try { return +localStorage.getItem(readKey(id)) || 0; } catch { return 0; } };
const setRead = (id, t) => { try { localStorage.setItem(readKey(id), String(t)); } catch {} };

function startChat() {
  const others = MEMBERS.filter(m => m.id !== me.id);
  for (const m of others) chats[chatIdWith(m.id)] = { id: chatIdWith(m.id), title: m.name, peer: m, msgs: [], loaded: false };
  if (MEMBERS.length > 2) chats.all = { id: 'all', title: '전체', peer: null, msgs: [], loaded: false };
  active = Object.keys(chats)[0] || null;
  for (const c of Object.values(chats)) {
    store.onMessages(c.id, msgs => {
      const known = new Set(c.msgs.map(x => x.id));
      const fresh = c.loaded ? msgs.filter(x => !known.has(x.id)) : [];
      c.msgs = msgs; c.loaded = true;
      for (const x of fresh) onNewMessage(c, x);
      renderChat();
    }, err => toast('메시지를 불러오지 못했어요 (' + err.code + ')'));
  }
  store.onPresence(p => { presence = p; renderPeer(); pushOffice(); });
  setInterval(pushOffice, 60_000);   // 접속이 끊긴 사람은 퇴근 처리
  setInterval(renderPeer, 30_000);
  renderChat();
}

function onNewMessage(c, x) {
  office.say(nameOf(x.from), x.text);     // 보낸 사람 캐릭터 머리 위 말풍선
  if (x.from === me.id || quiet()) return;
  chime('msg');
  if (document.hidden || c.id !== active) notify(`💬 ${nameOf(x.from)}`, x.text, () => { active = c.id; renderChat(); });
}

function unread(c) { const r = getRead(c.id); return c.msgs.filter(x => x.from !== me.id && x.at > r).length; }
function markRead() {
  const c = chats[active]; if (!c || document.hidden || !c.msgs.length) return;
  setRead(c.id, Math.max(getRead(c.id), c.msgs[c.msgs.length - 1].at));
}

function renderChat() {
  markRead();
  const tabs = Object.values(chats);
  $('tabs').innerHTML = tabs.map(c => {
    const n = unread(c);
    const ava = c.peer ? `<img class="ava" alt="" src="${avatar(c.peer)}">` : '<span class="ava" style="display:grid;place-items:center">👥</span>';
    return `<button class="tab" role="tab" data-id="${esc(c.id)}" aria-selected="${c.id === active}">${ava}${esc(c.title)}${n ? `<span class="badge">${n}</span>` : ''}</button>`;
  }).join('') || '<span class="empty">대화할 멤버가 없어요. members.json에 추가하세요.</span>';
  const total = tabs.reduce((a, c) => a + unread(c), 0);
  document.title = (total ? `(${total}) ` : '') + 'Claude Office';
  renderPeer();

  const c = chats[active], box = $('msgs');
  if (!c) { box.innerHTML = ''; return; }
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  let prev = null, prevDay = '';
  box.innerHTML = c.msgs.length ? c.msgs.map(x => {
    const mine = x.from === me.id, m = byId[x.from] || { name: nameOf(x.from) };
    const day = new Date(x.at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
    const cont = prev && prev.from === x.from && x.at - prev.at < 5 * 60_000 && day === prevDay;
    const dayLine = day !== prevDay ? `<li class="day">${esc(day)}</li>` : '';
    prev = x; prevDay = day;
    return `${dayLine}<li class="msg${mine ? ' mine' : ''}${cont ? ' cont' : ''}${x.pending ? ' pending' : ''}">
      <img class="ava" alt="" src="${avatar(m)}">
      <div class="body">
        ${mine ? '' : `<span class="meta name">${esc(m.name)}${m.title ? ' · ' + esc(m.title) : ''}</span>`}
        <div class="bubble">${linkify(x.text)}</div>
        <span class="time">${hhmm(x.at)}</span>
      </div></li>`;
  }).join('') : `<li class="day">${c.peer ? esc(c.peer.name) + '님과의 첫 메시지를 보내보세요' : '첫 메시지를 보내보세요'}</li>`;
  if (nearBottom || c._scrolledOnce !== true) { box.scrollTop = box.scrollHeight; c._scrolledOnce = true; }
}
function renderPeer() {
  const c = chats[active];
  if (!c) { $('peer').innerHTML = ''; return; }
  if (!c.peer) { $('peer').innerHTML = `<b>전체 채팅</b> · 멤버 ${MEMBERS.length}명`; return; }
  const p = presence[c.peer.id], seen = p ? p.at : 0, online = isOnline(c.peer.id);
  $('peer').innerHTML = `<b>${esc(c.peer.name)}</b>${c.peer.title ? ' ' + esc(c.peer.title) : ''} · <span class="dotp${online ? ' on' : ''}"></span> ${online ? STATUS[p.status || 'work'] : seen ? '마지막 접속 ' + ago(seen) : '오프라인'}`;
}

$('tabs').addEventListener('click', e => {
  const b = e.target.closest('[data-id]'); if (!b) return;
  active = b.dataset.id; chats[active]._scrolledOnce = false; renderChat(); $('input').focus();
});
$('compose').addEventListener('submit', e => {
  e.preventDefault();
  const text = $('input').value.trim();
  if (!text || !active) return;
  $('input').value = ''; autosize();
  store.send(active, text).catch(err => { toast('보내지 못했어요: ' + (err.code || err.message)); $('input').value = text; });
});
$('input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('compose').requestSubmit(); }
});
const autosize = () => { const t = $('input'); t.style.height = 'auto'; t.style.height = Math.min(120, t.scrollHeight) + 'px'; };
$('input').addEventListener('input', autosize);
$('msgs').addEventListener('scroll', markRead);

// ======================================================================
//  내 PC 연결
// ======================================================================
$('connectBtn').onclick = () => {
  const code = store.connectCode();
  const files = 'install.js office-hook.js office-state.js';
  $('cmd').textContent = `mkdir -p ~/.claude-office && cd ~/.claude-office && for f in ${files}; do curl -fsSL ${location.origin}/hook/$f -o $f; done && node install.js ${code}`;
  $('connect').showModal();
};
$('closeConnect').onclick = () => $('connect').close();
$('copyCmd').onclick = async () => {
  try { await navigator.clipboard.writeText($('cmd').textContent); $('copyCmd').textContent = '복사됨 ✓'; setTimeout(() => { $('copyCmd').textContent = '명령 복사'; }, 1500); }
  catch { toast('복사하지 못했어요. 직접 선택해서 복사하세요.'); }
};

// ======================================================================
//  알림 (소리 + 데스크톱 알림)
// ======================================================================
let notifyOn = false, audio = null, lastChime = 0;
try { notifyOn = localStorage.getItem('office-notify') === 'on'; } catch {}
function renderNotifyBtn() { $('notify').setAttribute('aria-pressed', notifyOn); $('notify').textContent = notifyOn ? '🔔 알림 켜짐' : '🔕 알림 꺼짐'; }
$('notify').onclick = async () => {
  notifyOn = !notifyOn; renderNotifyBtn();
  try { localStorage.setItem('office-notify', notifyOn ? 'on' : 'off'); } catch {}
  if (notifyOn) {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    chime('done');
    if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
  }
};
renderNotifyBtn();
function chime(kind) {
  if (!notifyOn || performance.now() - lastChime < 400) return;
  try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
  lastChime = performance.now();
  const notes = { wait: [[880, 0], [880, 0.12]], done: [[659, 0], [988, 0.1]], msg: [[784, 0], [1047, 0.08]] }[kind];
  for (const [f, at] of notes) {
    const o = audio.createOscillator(), g = audio.createGain(), t0 = audio.currentTime + at;
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.09, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
    o.connect(g).connect(audio.destination); o.start(t0); o.stop(t0 + 0.2);
  }
}
function notify(title, body, onClick) {
  if (!notifyOn || !('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return;
  try { const n = new Notification(title, { body, tag: title }); n.onclick = () => { window.focus(); onClick && onClick(); n.close(); }; } catch {}
}

// ======================================================================
//  📋 화이트보드
// ======================================================================
let boardItems = [], boardLoaded = false, boardFilter = 'all', editing = null;
function startBoard() {
  $('boardWho').innerHTML = '<option value="">담당 없음</option>' + MEMBERS.map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('');
  store.onBoard(items => {
    // 다른 사람이 나에게 할 일을 맡기면 알려준다
    if (boardLoaded) {
      const prev = new Map(boardItems.map(x => [x.id, x.assignee]));
      for (const x of items) if (x.assignee === me.id && prev.get(x.id) !== me.id && x.by !== me.id && !x.done) {
        toast(`📋 ${nameOf(x.by)}님이 할 일을 맡겼어요: ${x.text}`);
        if (!quiet()) { chime('msg'); notify('📋 새로 맡은 일', x.text); }
      }
    }
    boardItems = items; boardLoaded = true; renderBoard();
  }, err => toast('화이트보드를 불러오지 못했어요 (' + err.code + ')'));
}
const dueInfo = (due, done) => {
  if (!due) return null;
  const t = today(), tm = OfficeState.dayOf(Date.now() + 86400_000);
  if (!done && due < t) return { cls: 'over', text: `⚠️ ${due.slice(5).replace('-', '/')} 지남` };
  return { cls: due === t ? 'soon' : '', text: due === t ? '오늘까지' : due === tm ? '내일까지' : `${due.slice(5).replace('-', '/')}까지` };
};
function renderBoard() {
  const t = today();
  const rank = x => x.done ? 3 : x.due && x.due < t ? 0 : x.due ? 1 : 2;
  const items = boardItems.slice().sort((a, b) => rank(a) - rank(b) || (a.due || '9') .localeCompare(b.due || '9') || (a.at - b.at));
  const left = items.filter(x => !x.done), over = left.filter(x => x.due && x.due < t).length;
  $('boardCount').textContent = items.length ? `${items.length - left.length}/${items.length}` : '';
  office.setBoardBadge(!items.length ? '📋 할 일 추가' : left.length ? `📋 ${left.length}개 남음${over ? ` · ⚠️${over}` : ''}` : '📋 모두 완료!');
  document.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', b.dataset.filter === boardFilter));
  const shown = boardFilter === 'mine' ? items.filter(x => x.assignee === me.id) : items;
  $('boardList').innerHTML = shown.length ? shown.map(x => {
    const who = byId[x.assignee], doneBy = byId[x.doneBy], due = dueInfo(x.due, x.done);
    const carry = !x.done && x.day !== t && !x.due ? `<span class="tag">${esc(x.day.slice(5).replace('-', '/'))}부터</span>` : '';
    const canDel = x.by === me.id || x.done;
    const edit = editing === x.id ? `<div class="bedit">
        <select data-ewho="${esc(x.id)}"><option value="">담당 없음</option>${MEMBERS.map(m => `<option value="${esc(m.id)}" ${x.assignee === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
        <input type="date" data-edue="${esc(x.id)}" value="${esc(x.due || '')}">
        <button class="btn mini" data-esave="${esc(x.id)}">저장</button></div>` : '';
    return `<li class="item${x.done ? ' done' : ''}${due && due.cls === 'over' ? ' overdue' : ''}">
      <div class="brow">
        <label><input type="checkbox" data-toggle="${esc(x.id)}" ${x.done ? 'checked' : ''}><span class="text">${esc(x.text)}</span></label>
        <span class="meta">${carry}${due ? `<span class="due ${due.cls}">${esc(due.text)}</span>` : ''}${who ? `<span class="chip"><img class="ava sm" alt="" src="${avatar(who)}">${esc(who.name)}</span>` : ''}${x.done && doneBy ? `<span class="by">✔ ${esc(doneBy.name)}</span>` : ''}</span>
        ${x.done && (x.doneBy === me.id) && MEMBERS.length > 1 ? `<button class="icon" data-ask="${esc(x.id)}" title="확인 요청 보내기">🙋</button>` : ''}
        ${!x.done ? `<button class="icon" data-edit="${esc(x.id)}" title="담당·마감 바꾸기">✎</button>` : ''}
        ${canDel ? `<button class="icon del" data-del="${esc(x.id)}" aria-label="삭제">×</button>` : ''}
      </div>${edit}
    </li>`;
  }).join('') : `<li class="empty">${boardFilter === 'mine' ? '나에게 맡겨진 할 일이 없어요.' : '오늘 할 일을 적어보세요. 담당자와 마감일도 정할 수 있어요.'}</li>`;
}
const askFor = it => openRequestDialog('', `✔ "${it.text}" 끝냈어요. 확인 부탁드려요!`);
$('boardList').addEventListener('change', e => {
  const id = e.target.dataset.toggle; if (!id) return;
  const it = boardItems.find(x => x.id === id); if (!it) return;
  const finishing = !it.done;
  store.toggleBoard(it)
    .then(() => { if (finishing && MEMBERS.length > 1) toastAction(`✔ "${it.text}" 완료!`, '🙋 확인 요청', () => askFor(it)); })
    .catch(err => toast('체크하지 못했어요 (' + (err.code || err.message) + ')'));
});
$('boardList').addEventListener('click', e => {
  const d = e.target.dataset, find = id => boardItems.find(x => x.id === id);
  if (d.del) { const it = find(d.del); if (it) store.deleteBoard(it).catch(err => toast('지우지 못했어요 (' + (err.code || err.message) + ')')); }
  if (d.edit) { editing = editing === d.edit ? null : d.edit; renderBoard(); }
  if (d.ask) { const it = find(d.ask); if (it) askFor(it); }
  if (d.esave) {
    const it = find(d.esave); if (!it) return;
    const assignee = document.querySelector(`[data-ewho="${CSS.escape(it.id)}"]`).value || null;
    const due = document.querySelector(`[data-edue="${CSS.escape(it.id)}"]`).value || null;
    editing = null;
    store.updateBoard(it, { assignee, due }).catch(err => toast('저장하지 못했어요 (' + (err.code || err.message) + ')'));
  }
});
document.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => { boardFilter = b.dataset.filter; renderBoard(); }));
$('boardForm').addEventListener('submit', e => {
  e.preventDefault();
  const text = $('boardInput').value.trim(); if (!text) return;
  const who = $('boardWho').value || null, due = $('boardDue').value || null;
  $('boardInput').value = ''; $('boardDue').value = '';
  store.addBoard(text, who, due).catch(err => { toast('추가하지 못했어요 (' + (err.code || err.message) + ')'); $('boardInput').value = text; });
});
function focusBoard() {
  $('boardCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('boardCard').classList.remove('flash'); void $('boardCard').offsetWidth; $('boardCard').classList.add('flash');
  $('boardInput').focus({ preventScroll: true });
}

// ======================================================================
//  🙋 확인 요청
// ======================================================================
let requests = [], reqLoaded = false;
const REQ_STATUS = { open: '⏳ 대기 중', ok: '✅ 확인 완료', changes: '✏️ 수정 필요', canceled: '취소됨' };
function startRequests() {
  store.onRequests(list => {
    const prev = new Map(requests.map(r => [r.id, r.status]));
    requests = list;
    if (reqLoaded) for (const r of list) {
      if (r.to === me.id && r.status === 'open' && !prev.has(r.id)) {
        if (!quiet()) chime('wait');
        if (!quiet()) notify(`🙋 ${nameOf(r.from)}님의 확인 요청`, r.text);
        toast(`🙋 ${nameOf(r.from)}님이 확인을 요청했어요: ${r.text}`);
      }
      if (r.from === me.id && prev.get(r.id) === 'open' && (r.status === 'ok' || r.status === 'changes')) {
        chime('done'); notify(`${REQ_STATUS[r.status]} · ${nameOf(r.to)}`, r.reply || r.text);
        toast(`${nameOf(r.to)}님 답변: ${REQ_STATUS[r.status]}${r.reply ? ' · ' + r.reply : ''}`);
      }
    }
    reqLoaded = true;
    renderRequests();
  }, err => toast('확인 요청을 불러오지 못했어요 (' + err.code + ')'));
}
function renderRequests() {
  const open = requests.filter(r => r.status === 'open');
  // 요청을 보낸 사람 캐릭터에 📌 표시
  office.setMarks(Object.fromEntries(open.map(r => [nameOf(r.from), '📌 '])));
  const incoming = open.filter(r => r.to === me.id).sort((a, b) => a.at - b.at);
  const outgoing = open.filter(r => r.from === me.id).sort((a, b) => a.at - b.at);
  const recent = requests.filter(r => r.status !== 'open' && Date.now() - (r.repliedAt || r.at) < 7 * 86400_000)
    .sort((a, b) => (b.repliedAt || b.at) - (a.repliedAt || a.at)).slice(0, 4);
  $('reqCount').innerHTML = incoming.length ? `<span class="badge">${incoming.length}</span>` : '';
  const linkBtn = r => /^https?:\/\//.test(r.link || '') ? `<a class="btn mini" href="${esc(r.link)}" target="_blank" rel="noopener noreferrer">🔗 열어보기</a>` : '';
  const head = r => `<div class="rhead"><img class="ava sm" alt="" src="${avatar(byId[r.from] || { name: '?' })}"><b>${esc(nameOf(r.from))}</b> → ${esc(nameOf(r.to))}${r.project ? ` · <span class="proj">${esc(r.project)}</span>` : ''}<span class="ago">${ago(r.at)}</span></div>`;
  $('reqList').innerHTML = [
    ...incoming.map(r => `<li class="req in">${head(r)}<div class="rtext">${esc(r.text)}</div>
      <div class="ractions">${linkBtn(r)}<input class="reply" data-reply="${esc(r.id)}" placeholder="한마디 (선택)" maxlength="300">
      <button class="btn mini ok" data-ok="${esc(r.id)}">✅ 확인 완료</button><button class="btn mini" data-changes="${esc(r.id)}">✏️ 수정 필요</button></div></li>`),
    ...outgoing.map(r => `<li class="req out">${head(r)}<div class="rtext">${esc(r.text)}</div>
      <div class="ractions">${linkBtn(r)}<span class="status">${REQ_STATUS.open}</span><button class="btn mini" data-cancel="${esc(r.id)}">요청 취소</button></div></li>`),
    ...recent.map(r => `<li class="req past">${head(r)}<div class="rtext">${esc(r.text)}</div>
      <div class="ractions"><span class="status">${REQ_STATUS[r.status]}</span>${r.reply ? `<span class="rreply">“${esc(r.reply)}”</span>` : ''}</div></li>`),
  ].join('') || '<li class="empty">작업을 보여주고 의견을 받고 싶을 때 요청하세요. 내 캐릭터를 클릭해도 돼요.</li>';
}
$('reqList').addEventListener('click', e => {
  const t = e.target, find = id => requests.find(r => r.id === id);
  const answer = (id, status) => {
    const r = find(id); if (!r) return;
    const reply = ((document.querySelector(`[data-reply="${CSS.escape(id)}"]`) || {}).value || '').trim();
    store.replyRequest(r, status, reply)
      .then(() => store.send(chatIdWith(r.from), `${REQ_STATUS[status]}${r.project ? ' · ' + r.project : ''}\n${reply || r.text}`))
      .catch(err => toast('답하지 못했어요 (' + (err.code || err.message) + ')'));
  };
  if (t.dataset.ok) answer(t.dataset.ok, 'ok');
  if (t.dataset.changes) answer(t.dataset.changes, 'changes');
  if (t.dataset.cancel) { const r = find(t.dataset.cancel); if (r) store.cancelRequest(r).catch(err => toast('취소하지 못했어요 (' + (err.code || err.message) + ')')); }
});
$('people').addEventListener('click', e => { const b = e.target.closest('[data-req]'); if (b) openRequestDialog(b.dataset.req); });
$('newReq').onclick = () => openRequestDialog('');

function openRequestDialog(project, prefill) {
  const others = MEMBERS.filter(m => m.id !== me.id);
  if (!others.length) { toast('요청을 받을 다른 멤버가 없어요.'); return; }
  $('reqTo').innerHTML = others.map(m => `<option value="${esc(m.id)}">${esc(m.name)}${m.title ? ' (' + esc(m.title) + ')' : ''}</option>`).join('');
  const mine = [...new Set(sessions.filter(x => x.owner === me.id).map(x => x.project).filter(Boolean))];
  $('reqProjects').innerHTML = mine.map(p => `<option value="${esc(p)}">`).join('');
  $('reqProject').value = project || mine[0] || '';
  $('reqText').value = prefill || '';
  $('reqLink').value = '';
  $('reqDlg').showModal();
  $('reqText').focus();
}
$('reqCancel').onclick = () => $('reqDlg').close();
$('reqForm').addEventListener('submit', e => {
  e.preventDefault();
  const to = $('reqTo').value, text = $('reqText').value.trim(), project = $('reqProject').value.trim();
  let link = $('reqLink').value.trim();
  if (!text) { $('reqText').focus(); return; }
  if (link && !/^https?:\/\//.test(link)) link = 'https://' + link;
  $('reqDlg').close();
  store.createRequest({ to, text, project, link })
    .then(() => store.send(chatIdWith(to), `🙋 확인 요청${project ? ' · ' + project : ''}\n${text}${link ? '\n🔗 ' + link : ''}`))
    .then(() => toast(`${nameOf(to)}님께 확인을 요청했어요.`))
    .catch(err => toast('요청하지 못했어요 (' + (err.code || err.message) + ')'));
});

// ======================================================================
//  📓 오늘의 업무일지
// ======================================================================
const fmtDur = ms => { const m = Math.round(ms / 60000); return m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간 ${m % 60}분`; };
const CAT = { read: ['Read', 'Grep', 'Glob', 'LS', 'NotebookRead'], edit: ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'], cmd: ['Bash', 'BashOutput', 'KillShell', 'Monitor'], web: ['WebFetch', 'WebSearch', 'MCP'] };
const sumTools = (tools, names) => names.reduce((a, n) => a + (tools[n] || 0), 0);
const listMore = (arr, n) => arr.slice(0, n).join(', ') + (arr.length > n ? ` 외 ${arr.length - n}개` : '');

function buildJournal(day, journals, boardDone, reqs) {
  const lines = [], html = [];
  const d = new Date(day + 'T00:00:00');
  const title = `📓 업무일지 · ${d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}`;
  lines.push(title);
  for (const m of MEMBERS) {
    const j = journals.find(x => x.owner === m.id);
    lines.push('', `👤 ${m.name}${m.title ? ' (' + m.title + ')' : ''}`);
    let h = `<section class="jperson"><h4><img class="ava" alt="" src="${avatar(m)}">${esc(m.name)}${m.title ? ` <small>${esc(m.title)}</small>` : ''}`;
    if (!j || !j.projects || !j.projects.length) {
      lines.push('  Claude Code 활동 기록 없음');
      html.push(h + '</h4><p class="empty">Claude Code 활동 기록이 없어요.</p></section>');
      continue;
    }
    const prompts = j.projects.reduce((a, p) => a + p.prompts, 0), done = j.projects.reduce((a, p) => a + p.done, 0);
    const span = `${hhmm(j.first)} ~ ${hhmm(j.last)} · 실작업 약 ${fmtDur(j.activeMs || 0)} · 지시 ${prompts}건 · 완료 ${done}건`;
    lines.push('  ' + span);
    h += `<span class="jspan">${esc(span)}</span></h4>`;
    const total = p => Object.values(p.tools || {}).reduce((x, y) => x + y, 0);
    for (const p of j.projects.slice().sort((a, b) => total(b) - total(a))) {
      const t = p.tools || {};
      const counts = [['읽기', sumTools(t, CAT.read)], ['수정', sumTools(t, CAT.edit)], ['명령', sumTools(t, CAT.cmd)], ['웹', sumTools(t, CAT.web)]].filter(x => x[1]).map(x => `${x[0]} ${x[1]}`).join(' · ');
      const head = `■ ${p.name} — 지시 ${p.prompts} · 완료 ${p.done}${p.subagents ? ` · 서브에이전트 ${p.subagents}` : ''}${counts ? ` (${counts})` : ''}`;
      const rows = [];
      if (p.commits && p.commits.length) rows.push(['✅ 커밋', p.commits.join(' / ')]);
      if (p.asks && p.asks.length) rows.push(['💬 맡긴 일', listMore(p.asks, 8)]);
      if (p.files && p.files.length) rows.push([`✏️ 수정 파일 ${p.files.length}개`, listMore(p.files, 10)]);
      if (p.commands && p.commands.length) rows.push(['🖥 명령', listMore(p.commands, 5)]);
      if (p.web && p.web.length) rows.push(['🔎 조사', listMore(p.web, 5)]);
      lines.push('  ' + head, ...rows.map(([k, v]) => `    ${k}: ${v}`));
      h += `<div class="jproj"><div class="jhead">${esc(head)}</div>${rows.map(([k, v]) => `<div class="jrow"><span>${esc(k)}</span>${esc(v)}</div>`).join('')}</div>`;
    }
    html.push(h + '</section>');
  }
  // 팀 공통
  const team = [];
  if (boardDone.length) team.push([`📋 화이트보드 완료 ${boardDone.length}건`, boardDone.map(x => `${x.text} (${nameOf(x.doneBy)})`)]);
  if (day === today()) { const left = boardItems.filter(x => !x.done); if (left.length) team.push([`📌 남은 할 일 ${left.length}건`, left.map(x => x.text)]); }
  const dayReqs = reqs.filter(r => r.day === day && r.status !== 'canceled');
  if (dayReqs.length) team.push([`🙋 확인 요청 ${dayReqs.length}건`, dayReqs.map(r => `${nameOf(r.from)}→${nameOf(r.to)}${r.project ? ' [' + r.project + ']' : ''} ${r.text} → ${REQ_STATUS[r.status]}${r.reply ? ' “' + r.reply + '”' : ''}`)]);
  if (team.length) {
    lines.push('', '👥 팀');
    html.push(`<section class="jperson"><h4>👥 팀</h4>${team.map(([k, items]) => `<div class="jproj"><div class="jhead">${esc(k)}</div>${items.map(i => `<div class="jrow">· ${esc(i)}</div>`).join('')}</div>`).join('')}</section>`);
    for (const [k, items] of team) lines.push('  ' + k, ...items.map(i => '    · ' + i));
  }
  return { text: lines.join('\n'), html: `<h3 class="jtitle">${esc(title)}</h3>` + html.join('') };
}

let journalText = '';
async function loadJournal() {
  const day = $('jDate').value || today();
  $('jBody').innerHTML = '<p class="empty">불러오는 중…</p>';
  try {
    const [journals, boardDone] = await Promise.all([store.getJournal(day), store.getBoardDone(day)]);
    const out = buildJournal(day, journals, boardDone, requests);
    journalText = out.text;
    $('jBody').innerHTML = out.html;
    $('jSummary').hidden = true; summaryText = '';
  } catch (err) {
    journalText = '';
    $('jBody').innerHTML = `<p class="empty">업무일지를 불러오지 못했어요 (${esc(err.code || err.message)})</p>`;
  }
  const c = chats[active];
  $('jSend').textContent = c ? `💬 ${c.title}${c.peer ? '님께' : '에'} 보내기` : '💬 보내기';
  $('jSend').disabled = !c;
}
$('journalBtn').onclick = () => { $('jDate').value = today(); $('jDate').max = today(); $('jDlg').showModal(); loadJournal(); };
$('jDate').addEventListener('change', loadJournal);
$('jClose').onclick = () => $('jDlg').close();
$('jCopy').onclick = async () => {
  try { await navigator.clipboard.writeText(fullJournal()); $('jCopy').textContent = '복사됨 ✓'; setTimeout(() => { $('jCopy').textContent = '📋 복사'; }, 1500); }
  catch { toast('복사하지 못했어요.'); }
};
let summaryText = '';
$('jAI').onclick = async () => {
  if (!journalText) return;
  $('jAI').disabled = true; $('jAI').textContent = '✨ 요약 중…';
  $('jSummary').hidden = false; $('jSummary').innerHTML = '<p class="empty">Claude가 업무일지를 읽고 있어요…</p>';
  try {
    summaryText = await store.summarize(journalText);
    $('jSummary').innerHTML = `<h4>✨ AI 요약</h4><div class="sumtext">${esc(summaryText)}</div>`;
  } catch (err) {
    summaryText = '';
    $('jSummary').innerHTML = `<p class="empty">요약하지 못했어요: ${esc(err.message)}</p>`;
  }
  $('jAI').disabled = false; $('jAI').textContent = '✨ AI 요약';
};
const fullJournal = () => (summaryText ? `✨ AI 요약\n${summaryText}\n\n` : '') + journalText;
$('jSend').onclick = () => {
  const c = chats[active]; if (!c || !journalText) return;
  const journalText_ = fullJournal();
  const text = journalText_.length > 1990 ? journalText_.slice(0, 1960) + '\n… (전체는 업무일지에서)' : journalText;
  store.send(c.id, text).then(() => { toast(`업무일지를 ${c.title}${c.peer ? '님께' : '에'} 보냈어요.`); $('jDlg').close(); })
    .catch(err => toast('보내지 못했어요 (' + (err.code || err.message) + ')'));
};

// ======================================================================
//  🎨 꾸미기 (내 캐릭터 + 내 Claude)
// ======================================================================
const HUES = [0, 30, 60, 100, 140, 190, 220, 260, 300, 330];
let draft = null;
function openLook() {
  draft = { ...look(me) };
  renderLook();
  $('lookDlg').showModal();
}
function renderLook() {
  const part = (key, hueKey) => `
    <div class="looks">${[0, 1, 2, 3, 4, 5].map(i => `<button type="button" class="lk${draft[key] === i ? ' on' : ''}" data-set="${key}" data-v="${i}" aria-label="캐릭터 ${i + 1}"><img alt="" src="${office.previewFor(i, draft[hueKey])}"></button>`).join('')}</div>
    <div class="hues">${HUES.map(h => `<button type="button" class="hu${draft[hueKey] === h ? ' on' : ''}" data-set="${hueKey}" data-v="${h}" aria-label="옷 색 ${h}"><img alt="" src="${office.avatarFor(draft[key], h)}"></button>`).join('')}</div>`;
  $('lookMe').innerHTML = part('char', 'hue');
  $('lookClaude').innerHTML = part('claudeChar', 'claudeHue');
  $('lookPrev').innerHTML = `
    <figure><img alt="" src="${office.previewFor(draft.char, draft.hue)}"><figcaption>${esc(me.name)}</figcaption></figure>
    <figure><img alt="" src="${office.previewFor(draft.claudeChar, draft.claudeHue)}"><figcaption>🤖 ${esc(draft.claudeName || me.name + '의 Claude')}</figcaption></figure>`;
  if (document.activeElement !== $('lookName')) $('lookName').value = draft.claudeName;
}
$('lookDlg').addEventListener('click', e => {
  const b = e.target.closest('[data-set]'); if (!b) return;
  draft[b.dataset.set] = +b.dataset.v; renderLook();
});
$('lookName').addEventListener('input', () => { draft.claudeName = $('lookName').value; renderLook(); });
$('lookBtn').onclick = openLook;
$('lookCancel').onclick = () => $('lookDlg').close();
$('lookForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('lookName').value.trim().slice(0, 16);
  const p = { char: draft.char, hue: draft.hue, claudeChar: draft.claudeChar, claudeHue: draft.claudeHue, claudeName: name || `${me.name}의 Claude` };
  $('lookDlg').close();
  store.saveProfile(p).then(() => toast('🎨 저장했어요. 상대 화면에도 바로 바뀌어요.'))
    .catch(err => toast('저장하지 못했어요 (' + (err.code || err.message) + ')'));
});

let toastTimer;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 6000); }
// 버튼이 달린 알림 (예: 할 일 완료 → 확인 요청)
function toastAction(msg, label, fn) {
  const t = $('toast'); t.textContent = msg + ' ';
  const b = document.createElement('button'); b.className = 'btn mini primary'; b.textContent = label;
  b.onclick = () => { t.hidden = true; fn(); };
  t.appendChild(b); t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 8000);
}

// ======================================================================
//  📲 앱 설치 (홈 화면에 추가)
// ======================================================================
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost'))
  navigator.serviceWorker.register('sw.js').catch(() => {});
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let installEvt = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('installBtn').hidden = false; });
addEventListener('appinstalled', () => { $('installBtn').hidden = true; toast('📲 홈 화면에 설치됐어요!'); });
if (isIOS && !standalone()) $('installBtn').hidden = false;
$('installBtn').onclick = async () => {
  if (installEvt) { installEvt.prompt(); await installEvt.userChoice; installEvt = null; $('installBtn').hidden = true; }
  else $('iosDlg').showModal();
};
$('iosClose').onclick = () => $('iosDlg').close();

boot();
