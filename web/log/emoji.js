// 😀 이모지 고르기: data-emoji-picker 가 붙은 칸을 누르면 이모지 창이 뜬다 (습관 만들기, 문서 아이콘 등)
// 휴대폰 키보드가 뜨지 않게 칸은 readonly, 창 안의 "직접 입력"으로 아무 이모지나 넣을 수 있다
const SETS = [
  ['최근', null],
  ['습관', '📖 📚 ✍️ 📝 🏃 🚶 🧘 🏋️ 🚴 🏊 🧗 🎸 🎹 🎨 📷 🧠 💻 🗣️ 🌍 💧 🥗 🍎 ☕ 🛌 😴 🧹 🪴 🐕 💊 🦷 💰 📈 🙏 ✨ 🎯 ⏰ 🔥 🧾 📵 🚭'],
  ['표정', '😀 😄 😁 😊 🙂 😉 😎 🤓 🥳 😍 🤩 🥰 🤗 😌 😇 🤔 😴 😤 😮‍💨 😢 😭 😫 😕 😐 🙃 😋 🤯 🫠 😬 🥹'],
  ['활동', '⚽ 🏀 ⚾ 🎾 🏐 🏓 🏸 ⛳ 🥊 🎳 🛹 ⛸️ 🎿 🏄 🤸 🧘‍♀️ 🏃‍♀️ 🚴‍♀️ 🎮 🧩 ♟️ 🎲 🎤 🎧 🎬 🎻 🥁 🎺 🪕 🧶 🪡 🍳'],
  ['음식', '🍎 🍌 🍇 🍓 🍑 🥑 🥦 🥕 🌽 🍚 🍙 🍜 🍲 🍣 🍱 🥟 🍕 🍔 🌮 🥪 🥗 🍰 🍪 🍫 ☕ 🍵 🧋 🧃 🥛 🍺 🍷 💧'],
  ['자연', '🌱 🌿 🍀 🌸 🌻 🌷 🌳 🍁 🌙 ⭐ ☀️ 🌈 ☁️ ❄️ 🔥 🌊 ⛰️ 🐶 🐱 🐰 🐻 🦊 🐼 🐨 🐧 🐢 🦋 🐝 🐳 🦄'],
  ['사물', '💡 📌 📎 📅 🗓️ ⏰ ⌛ 💼 💻 🖥️ 📱 ⌨️ 🖊️ ✏️ 📐 🔬 🎁 🔑 🧳 ✈️ 🏠 🏢 🚗 🚲 🛒 💸 💳 📦 🧺 🛁 🕯️'],
  ['기호', '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 ✅ ☑️ ⭐ 🌟 ✨ 💯 🔔 🎉 🎊 🏆 🥇 🎯 🚀 💎 ♻️ ⚡ 💪 👍 👏 🙌 🫶 ✌️'],
];
const RECENT = 'unframe-emoji-recent';
const recent = () => { try { return JSON.parse(localStorage.getItem(RECENT)) || []; } catch { return []; } };
const remember = e => { try { localStorage.setItem(RECENT, JSON.stringify([e, ...recent().filter(x => x !== e)].slice(0, 24))); } catch {} };
const firstEmoji = s => { try { const seg = new Intl.Segmenter('ko', { granularity: 'grapheme' }); for (const g of seg.segment(s.trim())) return g.segment; } catch {} return Array.from(s.trim()).slice(0, 2).join(''); };

let pop = null, target = null, tab = 1;
function close() { if (pop) pop.remove(); pop = null; target = null; }
function list() { return tab === 0 ? recent() : SETS[tab][1].split(' '); }
function render() {
  const items = list();
  pop.innerHTML = `<div class="em-tabs" role="tablist">${SETS.map(([n], i) => `<button type="button" role="tab" aria-selected="${i === tab}" data-tab="${i}">${n}</button>`).join('')}</div>
    <div class="em-grid" role="listbox" aria-label="이모지">${items.length ? items.map(e => `<button type="button" role="option" data-e="${e}" aria-label="${e}">${e}</button>`).join('') : '<p class="em-empty">아직 고른 이모지가 없어요</p>'}</div>
    <form class="em-own"><input maxlength="8" placeholder="직접 입력 (키보드 이모지)" aria-label="이모지 직접 입력"><button type="submit">넣기</button></form>
    <button type="button" class="em-clear" data-e="">비우기</button>`;
}
function pick(e) {
  if (!target) return;
  target.value = e;
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
  if (e) remember(e);
  const t = target; close(); t.focus({ preventScroll: true });
}
function open(input) {
  close();
  target = input;
  tab = recent().length ? 0 : 1;
  pop = document.createElement('div');
  pop.className = 'em-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', '이모지 고르기');
  (input.closest('dialog') || document.body).appendChild(pop);
  render();
  const r = input.getBoundingClientRect(), w = Math.min(320, innerWidth - 16);
  pop.style.width = w + 'px';
  pop.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
  const h = 330, below = r.bottom + 6 + h < innerHeight;
  pop.style.top = (below ? r.bottom + 6 : Math.max(8, r.top - h - 6)) + 'px';
  pop.querySelector('[aria-selected=true]')?.focus();
  pop.addEventListener('click', e => {
    const tb = e.target.closest('[data-tab]'); if (tb) { tab = +tb.dataset.tab; render(); pop.querySelector(`[data-tab="${tab}"]`).focus(); return; }
    const b = e.target.closest('[data-e]'); if (b) pick(b.dataset.e);
  });
  pop.addEventListener('submit', e => { e.preventDefault(); const v = firstEmoji(e.target.querySelector('input').value); if (v) pick(v); });
  pop.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); const t = target; close(); t && t.focus(); } });
}

document.addEventListener('click', e => {
  const inp = e.target.closest && e.target.closest('[data-emoji-picker]');
  if (inp) { e.preventDefault(); if (pop && target === inp) close(); else open(inp); return; }
  if (pop && !e.target.closest('.em-pop')) close();
}, true);
document.addEventListener('keydown', e => {
  const inp = e.target.closest && e.target.closest('[data-emoji-picker]');
  if (inp && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) { e.preventDefault(); open(inp); }
});
addEventListener('resize', close);
