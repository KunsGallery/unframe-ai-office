// Unframe Log 저장소: Firestore 또는 데모(메모리)
// trackers/{id}  : 습관 (owner, name, emoji, unit, unitLabel, dailyGoal, color, private, order, createdAt, archived)
// logs/{owner}__{trackerId}__{day} : 하루 한 문서에 합산 (owner, tracker, day, amount, note, private, updatedAt)
//   - logs.private는 습관의 private를 그대로 복사한다 (보안 규칙이 문서만 보고 읽기를 막을 수 있게)
import { dayKey, addDays } from './model.js';

const logId = (owner, tracker, day) => `${owner}__${tracker}__${day}`;

/** 두 실시간 구독(내 것 + 공개된 것)을 id로 합친다 */
function merge2(cb) {
  const parts = [null, null];
  return i => list => {
    parts[i] = list;
    if (parts[0] && parts[1]) cb([...new Map([...parts[0], ...parts[1]].map(x => [x.id, x])).values()]);
  };
}

export function firebaseLogStore(F, db, meId) {
  const trackers = F.collection(db, 'trackers'), logs = F.collection(db, 'logs');
  const ms = v => (v && v.toMillis ? v.toMillis() : Date.now());
  const conv = s => s.docs.map(d => { const x = d.data({ serverTimestamps: 'estimate' }); return { ...x, id: d.id, createdAt: ms(x.createdAt), pending: d.metadata.hasPendingWrites }; });
  return {
    onTrackers(cb, err) {
      const m = merge2(cb);
      F.onSnapshot(F.query(trackers, F.where('owner', '==', meId)), s => m(0)(conv(s)), err);
      F.onSnapshot(F.query(trackers, F.where('private', '==', false)), s => m(1)(conv(s)), err);
    },
    onLogs(cb, err) {
      const m = merge2(cb), c = s => s.docs.map(d => ({ ...d.data(), id: d.id }));
      F.onSnapshot(F.query(logs, F.where('owner', '==', meId)), s => m(0)(c(s)), err);
      F.onSnapshot(F.query(logs, F.where('private', '==', false)), s => m(1)(c(s)), err);
    },
    addTracker: t => F.addDoc(trackers, { ...t, owner: meId, archived: false, order: Date.now(), createdAt: F.serverTimestamp() }),
    updateTracker: (id, patch) => F.updateDoc(F.doc(trackers, id), patch),
    /** 공개/비공개를 바꾸면 그 습관의 기록 문서들도 같이 바꾼다 */
    async setPrivate(t, priv) {
      await F.updateDoc(F.doc(trackers, t.id), { private: priv });
      const snap = await F.getDocs(F.query(logs, F.where('owner', '==', meId), F.where('tracker', '==', t.id)));
      for (let i = 0; i < snap.docs.length; i += 400) {
        const b = F.writeBatch(db);
        snap.docs.slice(i, i + 400).forEach(d => b.update(d.ref, { private: priv, updatedAt: F.serverTimestamp() }));
        await b.commit();
      }
    },
    /** 양 더하기(빼기). 하루 한 문서에 합산 */
    add: (t, day, delta) => F.setDoc(F.doc(logs, logId(meId, t.id, day)),
      { owner: meId, tracker: t.id, day, amount: F.increment(delta), private: !!t.private, updatedAt: F.serverTimestamp() }, { merge: true }),
    set: (t, day, amount) => F.setDoc(F.doc(logs, logId(meId, t.id, day)),
      { owner: meId, tracker: t.id, day, amount, private: !!t.private, updatedAt: F.serverTimestamp() }, { merge: true }),
    note: (t, day, note) => F.setDoc(F.doc(logs, logId(meId, t.id, day)),
      { owner: meId, tracker: t.id, day, amount: F.increment(0), note, private: !!t.private, updatedAt: F.serverTimestamp() }, { merge: true }),
  };
}

// ======================================================================
//  데모: 습관 4개씩, 200일치 가짜 기록. 성취 화면을 바로 볼 수 있게
//  - 내 📖 독서: 어제까지 29일 연속 → 오늘 기록하면 "30일 연속" 축하
//  - 내 🎸 기타: 누적 99시간 50분 → +10분이면 "누적 100시간" 축하
// ======================================================================
export function demoLogStore(meId, otherId) {
  const today = dayKey();
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const T = [], L = new Map();
  const mk = (owner, id, name, emoji, unit, unitLabel, dailyGoal, color, priv, startAgo) =>
    T.push({ id, owner, name, emoji, unit, unitLabel, dailyGoal, color, private: priv, order: T.length, archived: false, createdAt: Date.now() - startAgo * 86400000 });
  const put = (owner, tracker, day, amount, note) => { if (amount > 0) L.set(logId(owner, tracker, day), { id: logId(owner, tracker, day), owner, tracker, day, amount, note: note || '', private: T.find(t => t.id === tracker).private }); };

  mk(meId, 'read', '독서', '📖', 'count', '쪽', 20, '#1f3fbf', false, 200);
  mk(meId, 'write', '글쓰기', '✍️', 'minutes', '', 30, '#e4572e', false, 200);
  mk(meId, 'stretch', '스트레칭', '🧘', 'check', '', 1, '#17a673', false, 180);
  mk(meId, 'guitar', '기타 연습', '🎸', 'minutes', '', 45, '#8e44ad', true, 150);
  for (let i = 200; i >= 1; i--) {
    const d = addDays(today, -i);
    put(meId, 'read', d, i <= 29 || rnd() < 0.72 ? 8 + Math.round(rnd() * 30) : 0);
    put(meId, 'write', d, rnd() < 0.62 ? 5 * (2 + Math.round(rnd() * 10)) : 0, rnd() < 0.08 ? '초고 한 꼭지 끝' : '');
    if (i <= 180) put(meId, 'stretch', d, rnd() < (i < 40 ? 0.9 : 0.6) ? 1 : 0);
    if (i <= 150) put(meId, 'guitar', d, rnd() < 0.85 ? 15 + 5 * Math.round(rnd() * 12) : 0);
  }
  // 기타 누적을 99시간 50분으로 맞춘다
  const g = [...L.values()].filter(l => l.tracker === 'guitar').sort((a, b) => (a.day < b.day ? 1 : -1));
  let diff = 5990 - g.reduce((a, l) => a + l.amount, 0);
  for (let pass = 0; pass < 20 && diff; pass++) for (const l of g) { if (!diff) break; const n = Math.max(5, Math.min(l.amount + 30, l.amount + diff)); diff -= n - l.amount; l.amount = n; }
  put(meId, 'write', today, 15);

  if (otherId) {
    mk(otherId, 'o-run', '달리기', '🏃', 'count', 'km', 3, '#e4572e', false, 200);
    mk(otherId, 'o-eng', '영어 공부', '🗣️', 'minutes', '', 20, '#1f3fbf', false, 200);
    mk(otherId, 'o-water', '물 마시기', '💧', 'count', '잔', 8, '#17a673', false, 120);
    mk(otherId, 'o-diary', '일기', '📓', 'check', '', 1, '#111111', true, 90);
    for (let i = 200; i >= 0; i--) {
      const d = addDays(today, -i);
      put(otherId, 'o-run', d, rnd() < 0.45 ? 3 + Math.round(rnd() * 5) : 0);
      put(otherId, 'o-eng', d, i <= 11 || rnd() < 0.7 ? 10 + 5 * Math.round(rnd() * 5) : 0);
      if (i <= 120) put(otherId, 'o-water', d, i === 0 ? 5 : 4 + Math.round(rnd() * 5));
      if (i <= 90) put(otherId, 'o-diary', d, rnd() < 0.8 ? 1 : 0);
    }
  }
  // 데모에서도 보안 규칙처럼: 상대의 비공개 습관·기록은 안 보인다
  const visible = x => x.owner === meId || !x.private;
  const subs = { t: [], l: [] };
  const pushT = () => subs.t.forEach(cb => cb(T.filter(visible).map(t => ({ ...t }))));
  const pushL = () => subs.l.forEach(cb => cb([...L.values()].filter(visible).map(l => ({ ...l }))));
  const upsert = (t, day, fn) => {
    const id = logId(meId, t.id, day), l = L.get(id) || { id, owner: meId, tracker: t.id, day, amount: 0, note: '' };
    fn(l); l.private = !!t.private; L.set(id, l); pushL();
  };
  return {
    onTrackers: cb => { subs.t.push(cb); pushT(); },
    onLogs: cb => { subs.l.push(cb); pushL(); },
    addTracker: async t => { T.push({ ...t, id: 't' + Date.now().toString(36), owner: meId, archived: false, order: Date.now(), createdAt: Date.now() }); pushT(); },
    updateTracker: async (id, patch) => { Object.assign(T.find(t => t.id === id), patch); pushT(); },
    setPrivate: async (t, priv) => { T.find(x => x.id === t.id).private = priv; for (const l of L.values()) if (l.tracker === t.id) l.private = priv; pushT(); pushL(); },
    add: async (t, day, delta) => upsert(t, day, l => { l.amount = Math.max(0, l.amount + delta); }),
    set: async (t, day, amount) => upsert(t, day, l => { l.amount = amount; }),
    note: async (t, day, note) => upsert(t, day, l => { l.note = note; }),
  };
}
