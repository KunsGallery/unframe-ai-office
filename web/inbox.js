// 🔔 알림센터: 앱이 열려 있는 동안 온 알림(소리·휴대폰 알림)을 모아 두는 목록.
// 다른 창을 보다가 "또록" 소리에 돌아왔을 때 무슨 알림이었는지 볼 수 있게. 이 기기(브라우저)에만 저장된다.
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MAX = 80, KEEP_MS = 14 * 86400000;
let key = '', items = [], btn = null, panel = null, go = () => {};

const load = () => { try { const v = JSON.parse(localStorage.getItem(key)); return Array.isArray(v) ? v : []; } catch { return []; } };
const save = () => { try { localStorage.setItem(key, JSON.stringify(items)); } catch {} };
const unreadN = () => items.filter(x => !x.read).length;

function ago(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return '방금';
  if (s < 3600) return Math.floor(s / 60) + '분 전';
  const d = new Date(t), now = new Date();
  const hm = d.toTimeString().slice(0, 5);
  if (d.toDateString() === now.toDateString()) return hm;
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return '어제 ' + hm;
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

/** 앱 시작 때 한 번. host: 버튼을 넣을 자리(프로필 옆) */
export function initInbox({ meId, host, before, onGo }) {
  key = 'unframe-inbox-' + meId; go = onGo || go;
  items = load().filter(x => Date.now() - x.at < KEEP_MS);
  if (btn) { renderBtn(); return; }
  btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'ibx-btn'; btn.id = 'inboxBtn';
  btn.setAttribute('aria-haspopup', 'true'); btn.setAttribute('aria-expanded', 'false');
  host.insertBefore(btn, before || null);
  panel = document.createElement('div');
  panel.className = 'ibx-panel'; panel.id = 'inboxPanel'; panel.hidden = true;
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', '알림센터');
  document.body.appendChild(panel);
  btn.addEventListener('click', e => { e.stopPropagation(); panel.hidden ? open() : close(); });
  document.addEventListener('click', e => { if (!panel.hidden && !panel.contains(e.target) && e.target !== btn) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) { close(); btn.focus(); } });
  panel.addEventListener('click', e => {
    const it = e.target.closest('[data-ibx]');
    if (it) { const x = items.find(i => i.id === it.dataset.ibx); close(); if (x && x.url) go(x.url); return; }
    const a = e.target.closest('[data-ibx-act]'); if (!a) return;
    if (a.dataset.ibxAct === 'clear') { items = []; save(); render(); renderBtn(); }
  });
  // 다른 탭(같은 기기에서 앱을 두 개 열었을 때)과 맞추기
  addEventListener('storage', e => { if (e.key === key) { items = load(); renderBtn(); if (!panel.hidden) render(); } });
  setInterval(() => { if (!panel.hidden) render(); }, 60_000);
  renderBtn();
}

function renderBtn() {
  if (!btn) return;
  const n = unreadN();
  btn.innerHTML = `<span aria-hidden="true">🔔</span>${n ? `<b class="ibx-n">${n > 99 ? '99+' : n}</b>` : ''}`;
  btn.title = n ? `알림센터 · 안 읽은 알림 ${n}개` : '알림센터';
  btn.setAttribute('aria-label', btn.title);
  btn.classList.toggle('has', n > 0);
}

function render() {
  const groups = [];
  for (const x of items) {
    const d = new Date(x.at), label = d.toDateString() === new Date().toDateString() ? '오늘' : `${d.getMonth() + 1}월 ${d.getDate()}일`;
    if (!groups.length || groups[groups.length - 1][0] !== label) groups.push([label, []]);
    groups[groups.length - 1][1].push(x);
  }
  panel.innerHTML = `<div class="ibx-head"><b>알림센터</b><small>이 기기에서 받은 최근 2주</small>${items.length ? '<button type="button" class="ibx-clear" data-ibx-act="clear">모두 지우기</button>' : ''}</div>
    <div class="ibx-list">${groups.map(([label, xs]) => `<div class="ibx-day">${label}</div>${xs.map(x => `<button type="button" class="ibx-it${x.wasUnread ? ' new' : ''}" data-ibx="${x.id}">
      <span class="ibx-ic">${esc(x.icon || '🔔')}</span><span class="ibx-tx"><b>${esc(x.title)}${x.count > 1 ? ` <em>${x.count}</em>` : ''}</b>${x.body ? `<small>${esc(x.body)}</small>` : ''}</span><time>${ago(x.at)}</time></button>`).join('')}`).join('')
      || '<p class="ibx-empty">아직 알림이 없어요.<br>채팅·확인 요청·할 일·일정·응원·펫 비서·내 Claude 알림이 여기 모여요.</p>'}</div>`;
}

function open() {
  for (const x of items) { x.wasUnread = !x.read; x.read = true; }
  save(); render(); renderBtn();
  panel.hidden = false; btn.setAttribute('aria-expanded', 'true');
  const r = btn.getBoundingClientRect();
  panel.style.top = Math.round(r.bottom + 8) + 'px';
}
function close() {
  panel.hidden = true; btn.setAttribute('aria-expanded', 'false');
  for (const x of items) delete x.wasUnread;
  save();
}

/** 알림 하나 넣기. 같은 tag의 안 읽은 알림이 있으면 하나로 합친다 (채팅 여러 개 → "3") */
export function inboxAdd({ title, body = '', tag = '', url = '', icon = '' }) {
  if (!key || !title) return;
  const m = /^(\p{Extended_Pictographic}️?|[⏰✅🙋💬📋📅👏📮🐾])\s*/u.exec(title);
  if (!icon && m) { icon = m[1]; title = title.slice(m[0].length); }
  const same = tag && items.find(x => x.tag === tag && !x.read);
  if (same) {
    Object.assign(same, { title, body: String(body).slice(0, 200), at: Date.now(), count: (same.count || 1) + 1 });
    items = [same, ...items.filter(x => x !== same)];
  } else {
    items.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: String(title).slice(0, 100), body: String(body).slice(0, 200), tag, url, icon, at: Date.now(), read: false, count: 1 });
    items = items.slice(0, MAX);
  }
  // 창을 보고 있고 패널이 열려 있으면 바로 읽음
  if (panel && !panel.hidden && !document.hidden) { items[0].read = true; items[0].wasUnread = true; render(); }
  save(); renderBtn();
}
