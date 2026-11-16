// 문서(pages)와 일정(events) 저장소: Firestore 또는 데모(메모리)
// pages/{id}  : owner, title, emoji, tags[], shared, pinned, blocks[], preview, rev, createdAt, updatedAt, updatedBy
//   - 동시 편집 대신 덮어쓰기 방지: 저장할 때마다 rev를 1 올리고, 규칙은 '이전 rev + 1'만 받는다
// events/{id} : owner, title, day, time, endDay(''이면 하루), endTime, cal(''·'unframe'·'kuns' 회사 캘린더), note, shared, createdAt, updatedAt
import { dayKey, addDays } from './model.js';

function merge2(cb) {
  const parts = [null, null];
  return i => list => {
    parts[i] = list;
    if (parts[0] && parts[1]) cb([...new Map([...parts[0], ...parts[1]].map(x => [x.id, x])).values()]);
  };
}

export function firebaseWorkStore(F, db, meId) {
  const pages = F.collection(db, 'pages'), events = F.collection(db, 'events');
  const ms = v => (v && v.toMillis ? v.toMillis() : Date.now());
  const conv = s => s.docs.map(d => { const x = d.data({ serverTimestamps: 'estimate' }); return { ...x, id: d.id, createdAt: ms(x.createdAt), updatedAt: ms(x.updatedAt), pending: d.metadata.hasPendingWrites }; });
  const both = (col, cb, err) => {
    const m = merge2(cb);
    F.onSnapshot(F.query(col, F.where('owner', '==', meId)), s => m(0)(conv(s)), err);
    F.onSnapshot(F.query(col, F.where('shared', '==', true)), s => m(1)(conv(s)), err);
  };
  return {
    onPages: (cb, err) => both(pages, cb, err),
    /** 새 문서: id를 먼저 만들어 바로 열 수 있게 (오프라인이어도) */
    newPage(p) {
      const ref = F.doc(pages);
      F.setDoc(ref, { ...p, owner: meId, rev: 0, createdAt: F.serverTimestamp(), updatedAt: F.serverTimestamp(), updatedBy: meId }).catch(() => {});
      return ref.id;
    },
    /** 저장: rev = 새 값(이전 + 1). 상대가 먼저 고쳤으면 규칙이 거절(permission-denied) */
    savePage: (id, patch, rev) => F.updateDoc(F.doc(pages, id), { ...patch, rev, updatedAt: F.serverTimestamp(), updatedBy: meId }),
    deletePage: id => F.deleteDoc(F.doc(pages, id)),

    onEvents: (cb, err) => both(events, cb, err),
    addEvent: e => F.addDoc(events, { ...e, owner: meId, createdAt: F.serverTimestamp(), updatedAt: F.serverTimestamp() }),
    updateEvent: (id, patch) => F.updateDoc(F.doc(events, id), { ...patch, updatedAt: F.serverTimestamp() }),
    deleteEvent: id => F.deleteDoc(F.doc(events, id)),

    // 😊 기분·점심 (멤버__날짜), 🐾 펫이 보낸 말, 펫 비서 설정
    onMoods: (cb, err) => both(F.collection(db, 'moods'), cb, err),
    saveMood: (day, patch) => F.setDoc(F.doc(db, 'moods', `${meId}__${day}`), { ...patch, owner: meId, day, updatedAt: F.serverTimestamp() }, { merge: true }),
    onPetNotes: (day, cb) => F.onSnapshot(F.query(F.collection(db, 'petNotes'), F.where('member', '==', meId), F.where('day', '==', day)), s => cb(conv(s)), () => cb([])),
    getAssistant: async () => { const d = await F.getDoc(F.doc(db, 'assistant', meId)); return d.exists() ? d.data() : null; },
    saveAssistant: a => F.setDoc(F.doc(db, 'assistant', meId), { ...a, updatedAt: F.serverTimestamp() }),
    // 📮 편지 · 👏 응원 · 🍖 펫 상태
    onLetters: cb => F.onSnapshot(F.collection(db, 'letters'), s => cb(conv(s).map(x => ({ ...x, at: ms(x.at) }))), () => cb([])),
    onCheers: cb => {
      const m = merge2(cb), c = F.collection(db, 'cheers');
      F.onSnapshot(F.query(c, F.where('to', '==', meId)), s => m(0)(conv(s).map(x => ({ ...x, at: ms(x.at) }))), () => m(0)([]));
      F.onSnapshot(F.query(c, F.where('from', '==', meId)), s => m(1)(conv(s).map(x => ({ ...x, at: ms(x.at) }))), () => m(1)([]));
    },
    sendCheer: c => F.addDoc(F.collection(db, 'cheers'), { ...c, from: meId, at: F.serverTimestamp() }),
    onPetState: cb => F.onSnapshot(F.collection(db, 'petState'), s => cb(Object.fromEntries(s.docs.map(d => [d.id, d.data()]))), () => cb({})),
    feedPet: (fed, day) => F.setDoc(F.doc(db, 'petState', meId), { fed, lastFed: day, updatedAt: F.serverTimestamp() }),
  };
}

// ======================================================================
//  데모: 문서 5개, 일정 몇 개. 상대가 공유 문서를 고치는 상황도 흉내 낸다
// ======================================================================
export function demoWorkStore(meId, otherId) {
  const today = dayKey(), now = Date.now();
  let n = 0;
  const bid = () => 'b' + (++n);
  const B = (type, text = '', extra = {}) => ({ id: bid(), type, text, ...extra });
  const P = [], E = [];
  const page = (owner, title, emoji, tags, shared, pinned, blocks, agoH) => P.push({
    id: 'p' + P.length, owner, title, emoji, tags, shared, pinned, blocks, rev: 3,
    preview: blocks.map(b => b.text.replace(/<[^>]+>/g, '')).join(' ').slice(0, 200),
    createdAt: now - agoH * 3600e3 - 86400e3 * 3, updatedAt: now - agoH * 3600e3, updatedBy: owner,
  });
  page(meId, '독서 노트 — 올해 읽은 책', '📚', ['독서', '기록'], true, true, [
    B('callout', '하루 20쪽이면 1년에 <b>7,300쪽</b> — 300쪽짜리 책 24권이에요.'),
    B('habit', '', { tracker: 'read' }),
    B('h2', '11월에 읽는 중'),
    B('bullet', '<b>아주 작은 습관의 힘</b> — 1% 개선이 쌓이면 37배'),
    B('bullet', '<i>디자인의 디자인</i> — 하라 켄야'),
    B('h2', '밑줄'),
    B('quote', '목표는 결과를 위한 것이고, 시스템은 과정을 위한 것이다.'),
  ], 2);
  page(meId, '주간 회고 · 11월 3주', '🗓️', ['회고'], true, false, [
    B('h2', '잘한 것'),
    B('todo', '독서 29일 연속 이어가기', { checked: true }),
    B('todo', '기타 100시간 채우기', { checked: false }),
    B('h2', '다음 주'),
    B('number', '월요일 오전 집중 시간 2시간 확보'),
    B('number', 'Unframe Log 문서 기능 써보기'),
    B('divider'),
    B('p', '작게, 그러나 매일.'),
  ], 20);
  page(meId, '프로젝트 아이디어', '💡', ['아이디어', 'unframe'], false, false, [
    B('p', '나만 보는 메모예요. 🔒 나만 보기 문서는 상대에게 보이지 않아요.'),
    B('bullet', '월간 리포트를 인스타 스토리 크기로'),
    B('bullet', '습관별 "10년이면" 포스터'),
    B('code', 'const 하루 = 10; // 분\nconst 일년 = 하루 * 365 / 60; // 60.8시간'),
  ], 50);
  if (otherId) {
    page(otherId, '11월 회의 메모', '📝', ['회의', 'unframe'], true, false, [
      B('h1', '11월 운영 회의'),
      B('p', '참석: 재우, 소연'),
      B('todo', '12월 뉴스레터 원고 마감 정하기', { checked: false }),
      B('todo', '관리자 화면 배포', { checked: true }),
      B('callout', '다음 회의는 캘린더에 넣어 두었어요.'),
    ], 5);
    page(otherId, '영어 공부 루틴', '🗣️', ['영어'], true, false, [
      B('habit', '', { tracker: 'o-eng' }),
      B('p', '출근길 20분 팟캐스트 + 저녁 단어 복습'),
    ], 30);
  }
  const ev = (owner, title, d, time, note, shared = true) => E.push({ id: 'e' + E.length, owner, title, day: addDays(today, d), time, note, shared, createdAt: now, updatedAt: now });
  ev(meId, '독서 모임', 2, '19:30', '「아주 작은 습관의 힘」 3장까지');
  ev(meId, '치과', -3, '10:00', '', false);
  ev(meId, '월간 리포트 보기', 14, '', '');
  E.push({ id: 'e' + E.length, owner: meId, cal: 'unframe', title: '언프레임 뉴스레터 발송', day: addDays(today, 4), time: '10:00', endDay: '', endTime: '', note: '', shared: true, createdAt: now, updatedAt: now });
  E.push({ id: 'e' + E.length, owner: meId, cal: 'kuns', title: '작가 미팅', day: addDays(today, 1), time: '15:00', endDay: '', endTime: '', note: '쿤스갤러리 2층', shared: true, createdAt: now, updatedAt: now });
  E.push({ id: 'e' + E.length, owner: meId, cal: 'kuns', title: '🖼 봄 그림 전시', day: addDays(today, -2), time: '', endDay: addDays(today, 9), endTime: '', note: '갤러리 1층 · 매일 11~19시', shared: true, createdAt: now, updatedAt: now });
  if (otherId) {
    ev(otherId, '12월 운영 회의', 3, '14:00', '뉴스레터 · 관리자 화면');
    ev(otherId, '외근 (미팅)', 0, '16:00', '');
    ev(otherId, '정산 마감', 9, '', '');
  }

  // 기분 60일치 (점심 몇 개)
  const M = [];
  const LUNCH = ['김치찌개', '샐러드', '돈가스', '쌀국수', '김밥', '비빔밥'];
  for (let i = 60; i >= 0; i--) {
    const d = addDays(today, -i);
    if (i > 0 || otherId) {
      for (const o of [meId, otherId].filter(Boolean)) {
        if (o === meId && i === 0) continue;   // 오늘 내 기분은 비워 둬서 고르는 화면을 볼 수 있게
        if (Math.random() < 0.8) M.push({ id: `${o}__${d}`, owner: o, day: d, score: 2 + Math.floor(Math.random() * 4), note: '', lunch: Math.random() < 0.4 ? LUNCH[i % LUNCH.length] : '', shared: true });
      }
    }
  }
  let assistant = null;
  const letters = [
    { id: 'l1', member: meId, week: addDays(today, -13), pet: '재우의 보더콜리', at: now - 8 * 86400e3, text: '재우님께 📮\n\n이번 주 독서를 6일이나 했어요! 특히 목요일엔 38쪽이나 읽었죠. 글쓰기는 화요일·수요일에 쉬어서 조금 아쉬웠어요.\n\n기분은 주 초반엔 😐였다가 주말에 😄까지 올라갔어요. 「10월 정산 자료 정리」도 끝냈고요.\n\n다음 주엔 글쓰기를 아침 10분만 먼저 해 볼까요? 🐾\n\n— 재우의 보더콜리' },
    ...(otherId ? [{ id: 'l2', member: otherId, week: addDays(today, -13), pet: '박소연의 토끼', at: now - 8 * 86400e3, text: '소연님께 🐰\n\n영어 공부를 매일 했어요! 7일 연속이에요. 물은 하루 평균 6잔, 목표까지 2잔 남았어요.\n\n수요일 회의가 길었는데도 저녁에 일기를 썼죠. 대단해요 ✨\n\n다음 주는 물 한 잔을 점심에 더 마셔 봐요.\n\n— 박소연의 토끼' }] : []),
  ];
  const cheers = otherId ? [{ id: 'c1', from: otherId, to: meId, tracker: 'read', label: '📖 독서', emoji: '👏', day: today, at: now - 1800e3 }] : [];
  let petState = { [meId]: { fed: 3, lastFed: addDays(today, -1) } };
  const subsX = { l: [], c: [], ps: [] };
  const notes = [{ id: 'n1', member: meId, day: today, slot: 'brief', text: '좋은 아침이에요 멍! 🐾 오늘 기분은 어때요? 서울은 흐리고 3~11°C예요. 오후 4시 박소연님 외근이 있고, 마감 지난 할 일 「오후 3시 배포」가 하나 있어요.', at: now - 3600e3 }];
  const visible = x => x.owner === meId || x.shared;
  const subs = { p: [], e: [], m: [] };
  const pushM = () => subs.m.forEach(cb => cb(M.filter(visible).map(m => ({ ...m }))));
  const pushP = () => subs.p.forEach(cb => cb(P.filter(visible).map(p => structuredClone(p))));
  const pushE = () => subs.e.forEach(cb => cb(E.filter(visible).map(e => ({ ...e }))));
  const denied = () => Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
  const canEdit = p => p.owner === meId || p.shared;
  // 데모: 상대가 공유 회의 메모를 25초 뒤에 한 번 고친다 (동시에 고치면 안내가 뜨는지 볼 수 있게)
  if (otherId) setTimeout(() => {
    const p = P.find(x => x.owner === otherId && x.title.startsWith('11월'));
    p.blocks.push(B('p', '(소연) 원고 마감은 12월 5일로 해요.')); p.rev++; p.updatedAt = Date.now(); p.updatedBy = otherId; pushP();
  }, 25000);
  return {
    onPages: cb => { subs.p.push(cb); pushP(); },
    newPage(p) { const id = 'p' + Date.now().toString(36); P.push({ ...structuredClone(p), id, owner: meId, rev: 0, createdAt: Date.now(), updatedAt: Date.now(), updatedBy: meId }); pushP(); return id; },
    async savePage(id, patch, rev) {
      const p = P.find(x => x.id === id);
      if (!p || !canEdit(p) || rev !== p.rev + 1) throw denied();
      if ('shared' in patch && patch.shared !== p.shared && p.owner !== meId) throw denied();
      Object.assign(p, structuredClone(patch), { rev, updatedAt: Date.now(), updatedBy: meId }); pushP();
    },
    async deletePage(id) { const i = P.findIndex(x => x.id === id); if (P[i].owner !== meId) throw denied(); P.splice(i, 1); pushP(); },
    onEvents: cb => { subs.e.push(cb); pushE(); },
    async addEvent(e) { E.push({ ...e, id: 'e' + Date.now().toString(36), owner: meId, createdAt: Date.now(), updatedAt: Date.now() }); pushE(); },
    async updateEvent(id, patch) { const e = E.find(x => x.id === id); if (e.owner !== meId && !e.shared) throw denied(); Object.assign(e, patch, { updatedAt: Date.now() }); pushE(); },
    async deleteEvent(id) { const i = E.findIndex(x => x.id === id); E.splice(i, 1); pushE(); },
    onMoods: cb => { subs.m.push(cb); pushM(); },
    async saveMood(day, patch) { const id = `${meId}__${day}`; let m = M.find(x => x.id === id); if (!m) M.push(m = { id, owner: meId, day, shared: true }); Object.assign(m, patch); pushM(); },
    onPetNotes: (day, cb) => cb(notes.filter(x => x.day === day)),
    getAssistant: async () => assistant,
    onLetters: cb => { subsX.l.push(cb); cb(letters.slice()); },
    onCheers: cb => { subsX.c.push(cb); cb(cheers.slice()); },
    sendCheer: async c => { cheers.push({ ...c, id: 'c' + Date.now(), from: meId, at: Date.now() }); subsX.c.forEach(cb => cb(cheers.slice()));
      // 데모: 상대도 잠시 뒤 응원을 돌려준다
      if (otherId) setTimeout(() => { cheers.push({ id: 'c' + Date.now(), from: otherId, to: meId, tracker: '', label: '오늘 하루', emoji: '🙌', day: today, at: Date.now() }); subsX.c.forEach(cb => cb(cheers.slice())); }, 4000); },
    onPetState: cb => { subsX.ps.push(cb); cb({ ...petState }); },
    feedPet: async (fed, day) => { petState = { ...petState, [meId]: { fed, lastFed: day } }; subsX.ps.forEach(cb => cb({ ...petState })); },
    saveAssistant: async a => { assistant = { ...a }; },
  };
}
