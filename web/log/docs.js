// 문서 탭: 노션형 블록 편집기 (평평한 목록 + 태그, 자동 저장, 덮어쓰기 방지)
import { dayKey, statsFor, bigParts, num } from './model.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const TYPES = [
  { type: 'p', label: '본문', key: 'text p', icon: '¶' },
  { type: 'h1', label: '제목 1', key: 'h1 heading', icon: 'H1' },
  { type: 'h2', label: '제목 2', key: 'h2 heading', icon: 'H2' },
  { type: 'h3', label: '제목 3', key: 'h3 heading', icon: 'H3' },
  { type: 'bullet', label: '글머리 목록', key: 'bullet list ul', icon: '•' },
  { type: 'number', label: '번호 목록', key: 'number list ol', icon: '1.' },
  { type: 'todo', label: '할 일', key: 'todo check', icon: '☐' },
  { type: 'quote', label: '인용', key: 'quote', icon: '❝' },
  { type: 'callout', label: '콜아웃', key: 'callout note', icon: '💡' },
  { type: 'code', label: '코드', key: 'code', icon: '</>' },
  { type: 'divider', label: '구분선', key: 'divider hr line', icon: '—' },
  { type: 'habit', label: '습관 카드', key: 'habit tracker 습관 기록', icon: '🔥' },
];
const TEXTLESS = new Set(['divider', 'habit']);
const KEEP_TYPE_ON_ENTER = new Set(['bullet', 'number', 'todo']);
const SHORTCUTS = [['### ', 'h3'], ['## ', 'h2'], ['# ', 'h1'], ['- ', 'bullet'], ['* ', 'bullet'], ['1. ', 'number'], ['[] ', 'todo'], ['[ ] ', 'todo'], ['> ', 'quote'], ['``` ', 'code']];
const newId = () => 'b' + Math.random().toString(36).slice(2, 9);

/** 붙여넣기·저장 전에 허용한 태그(b i code a br)만 남긴다. 링크는 http(s)만 */
export function sanitize(html) {
  const t = document.createElement('template');
  t.innerHTML = String(html || '');
  const walk = node => {
    for (const c of [...node.childNodes]) {
      if (c.nodeType === 3) continue;
      if (c.nodeType !== 1) { c.remove(); continue; }
      walk(c);
      const tag = c.tagName;
      const keep = tag === 'B' || tag === 'STRONG' ? 'b' : tag === 'I' || tag === 'EM' ? 'i' : tag === 'CODE' ? 'code' : tag === 'BR' ? 'br' : tag === 'A' ? 'a' : null;
      if (!keep || (keep === 'a' && !/^https?:\/\//i.test(c.getAttribute('href') || ''))) { c.replaceWith(...c.childNodes); continue; }
      const n = document.createElement(keep);
      if (keep === 'a') { n.setAttribute('href', c.getAttribute('href')); n.setAttribute('target', '_blank'); n.setAttribute('rel', 'noopener noreferrer'); }
      n.append(...c.childNodes);
      c.replaceWith(n);
    }
  };
  walk(t.content);
  return t.innerHTML.replace(/&nbsp;/g, ' ').replace(/(<br>)+$/, '');
}
const textOf = html => { const d = document.createElement('div'); d.innerHTML = html || ''; return d.textContent || ''; };

// ---------- 커서 ----------
function caretOffset(el) {
  const s = getSelection();
  if (!s.rangeCount) return 0;
  const r = s.getRangeAt(0);
  if (!el.contains(r.startContainer)) return 0;
  const pre = document.createRange();
  pre.selectNodeContents(el); pre.setEnd(r.startContainer, r.startOffset);
  return pre.toString().length;
}
function setCaret(el, off) {
  if (!el) return;
  el.focus({ preventScroll: false });
  const s = getSelection(), r = document.createRange();
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n, left = off;
  while ((n = w.nextNode())) {
    if (left <= n.length) { r.setStart(n, left); r.collapse(true); s.removeAllRanges(); s.addRange(r); return; }
    left -= n.length;
  }
  r.selectNodeContents(el); r.collapse(off <= 0); s.removeAllRanges(); s.addRange(r);
}
const collapsed = () => { const s = getSelection(); return s.rangeCount && s.getRangeAt(0).collapsed; };

export function initDocs(ctx) {
  const { work, logs, me, members, toast, go } = ctx;
  const nameOf = id => (members.find(m => m.id === id) || {}).name || id;
  let pages = [], loaded = false, q = '', tagF = null, sort = 'updated';
  let openId = null, doc = null, dirty = false, saveTimer = null, conflict = false, visible = false;
  let menu = null;   // { mode: 'slash'|'block'|'habit', bid, items, idx }
  let dragId = null;
  try { openId = sessionStorage.getItem('unframe-doc-open'); } catch {}
  const pane = $('paneDocs');

  work.onPages(list => { pages = list; loaded = true; onRemote(); }, e => toast('문서를 불러오지 못했어요 (' + (e.code || e.message) + ')'));
  logs.onChange(() => { if (visible && doc) pane.querySelectorAll('[data-habit]').forEach(el => { el.innerHTML = habitInner(el.dataset.habit); }); });

  const rel = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? '방금' : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.round(m / 60)}시간 전` : new Date(t).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' }); };
  const pageText = p => [p.title, p.preview, ...(p.blocks || []).map(b => textOf(b.text))].join(' ').toLowerCase();

  // ==================================================================
  //  목록
  // ==================================================================
  function renderList() {
    const tags = [...new Set(pages.flatMap(p => p.tags || []))].sort();
    let list = pages.filter(p => (!tagF || (p.tags || []).includes(tagF)) && (!q || pageText(p).includes(q.toLowerCase())));
    list.sort((a, b) => (b.pinned - a.pinned) || (sort === 'created' ? b.createdAt - a.createdAt : b.updatedAt - a.updatedAt));
    pane.innerHTML = `
      <section class="lg-sec light">
        <div class="lg-kicker">문서</div>
        <h1 class="lg-display xl"><span class="lg-n">${num(pages.length)}</span><span class="lg-u">개의 문서</span></h1>
        <div class="dc-tools"><input type="search" id="dcSearch" placeholder="제목·내용 검색" value="${esc(q)}" aria-label="문서 검색">
          <select id="dcSort" aria-label="정렬"><option value="updated"${sort === 'updated' ? ' selected' : ''}>최근 수정</option><option value="created"${sort === 'created' ? ' selected' : ''}>만든 순</option></select>
          <button class="lg-btn primary" data-act="new" type="button">+ 새 문서</button></div>
        ${tags.length ? `<nav class="lg-chips flat" aria-label="태그">${['', ...tags].map(t => `<button type="button" class="lg-chip${(tagF || '') === t ? ' on' : ''}" data-tag="${esc(t)}">${t ? '#' + esc(t) : '전체'}</button>`).join('')}</nav>` : ''}
      </section>
      <section class="lg-sec light tight"><ul class="dc-list">${list.map(p => `
        <li><button type="button" class="dc-item" data-open="${p.id}">
          <span class="dc-ie">${esc(p.emoji || '📄')}</span>
          <span class="dc-ib"><b>${p.pinned ? '📌 ' : ''}${esc(p.title || '제목 없음')}</b>
            <small>${esc((p.preview || '').slice(0, 90))}</small>
            <span class="dc-im">${(p.tags || []).map(t => `<i>#${esc(t)}</i>`).join('')}<em>${p.shared ? '함께 보기' : '🔒 나만 보기'} · ${p.updatedBy && p.updatedBy !== me.id ? esc(nameOf(p.updatedBy)) + '님 · ' : ''}${rel(p.updatedAt)}</em></span></span>
        </button></li>`).join('') || `<li class="lg-lede">${q || tagF ? '찾는 문서가 없어요.' : '첫 문서를 만들어 보세요. / 를 누르면 블록을 고를 수 있어요.'}</li>`}</ul></section>`;
  }
  pane.addEventListener('input', e => {
    if (e.target.id === 'dcSearch') { q = e.target.value; const pos = e.target.selectionStart; renderList(); const s = $('dcSearch'); s.focus(); s.setSelectionRange(pos, pos); }
  });
  pane.addEventListener('change', e => { if (e.target.id === 'dcSort') { sort = e.target.value; renderList(); } });

  // ==================================================================
  //  편집기
  // ==================================================================
  const editable = p => p && (p.owner === me.id || p.shared);
  function openPage(id) {
    flush();
    const p = pages.find(x => x.id === id);
    if (!p) { openId = null; renderList(); return; }
    openId = id; try { sessionStorage.setItem('unframe-doc-open', id); } catch {}
    doc = structuredClone({ id: p.id, owner: p.owner, title: p.title || '', emoji: p.emoji || '📄', tags: p.tags || [], shared: !!p.shared, pinned: !!p.pinned, blocks: (p.blocks || []).length ? p.blocks : [{ id: newId(), type: 'p', text: '' }], rev: p.rev || 0 });
    doc.blocks.forEach(b => { b.text = sanitize(b.text); });
    dirty = false; conflict = false;
    renderEditor();
  }
  function closePage() { flush(); openId = null; doc = null; try { sessionStorage.removeItem('unframe-doc-open'); } catch {} renderList(); window.scrollTo(0, 0); }

  function renderEditor() {
    const p = pages.find(x => x.id === doc.id) || doc, mine = doc.owner === me.id;
    pane.innerHTML = `
      <div class="dc-top"><button class="lg-btn ghost" data-act="back" type="button">← 문서</button>
        <span class="dc-status" id="dcStatus" aria-live="polite">${dirty ? '저장 중…' : '저장됨'}</span>
        <button class="lg-btn ghost${doc.pinned ? ' on' : ''}" data-act="pin" type="button" aria-pressed="${doc.pinned}" title="목록 맨 위에 고정">📌</button>
        ${mine ? `<button class="lg-btn ghost" data-act="share" type="button" title="공개 범위">${doc.shared ? '👥 함께 보기' : '🔒 나만 보기'}</button>
          <button class="lg-btn ghost" data-act="del" type="button" title="삭제">삭제</button>` : `<span class="dc-badge">👥 ${esc(nameOf(doc.owner))}님 문서</span>`}</div>
      <div class="dc-conflict" id="dcConflict" hidden></div>
      <article class="dc-page">
        <input class="dc-emoji" id="dcEmoji" value="${esc(doc.emoji)}" maxlength="8" readonly data-emoji-picker aria-label="문서 아이콘 고르기" title="눌러서 아이콘 바꾸기">
        <textarea class="dc-title" id="dcTitle" rows="1" maxlength="100" placeholder="제목 없음" aria-label="제목">${esc(doc.title)}</textarea>
        <div class="dc-tags" id="dcTags">${doc.tags.map(t => `<span class="dc-tag">#${esc(t)}<button type="button" data-untag="${esc(t)}" aria-label="${esc(t)} 태그 빼기">×</button></span>`).join('')}
          ${doc.tags.length < 10 ? '<input id="dcTagIn" maxlength="20" placeholder="+ 태그" aria-label="태그 추가 (Enter)">' : ''}</div>
        <div class="dc-meta" id="dcMeta">${metaText(p)}</div>
        <div class="dc-blocks" id="dcBlocks">${blocksHtml()}</div>
        <button class="dc-addblock" data-act="addblock" type="button">+ 블록 추가 <small>/ 를 누르면 블록을 골라요</small></button>
      </article>`;
    autoTitle();
  }
  const metaText = p => `${esc(nameOf(p.owner))}님이 만듦${p.updatedAt ? ` · ${p.updatedBy && p.updatedBy !== p.owner ? esc(nameOf(p.updatedBy)) + '님이 ' : ''}${rel(p.updatedAt)} 수정` : ''}`;
  const autoTitle = () => { const t = $('dcTitle'); if (t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; } };

  function blocksHtml() {
    let n = 0;
    return doc.blocks.map(b => {
      n = b.type === 'number' ? n + 1 : 0;
      return blockHtml(b, n);
    }).join('');
  }
  function blockHtml(b, n) {
    const h = `<button class="dc-h" data-h type="button" draggable="true" tabindex="-1" aria-label="블록 메뉴 (끌어서 옮기기)">⋮⋮</button>`;
    if (b.type === 'divider') return `<div class="dc-b t-divider" data-bid="${b.id}">${h}<hr></div>`;
    if (b.type === 'habit') return `<div class="dc-b t-habit" data-bid="${b.id}">${h}<div class="dc-habit" data-habit="${esc(b.tracker || '')}" role="button" tabindex="0">${habitInner(b.tracker)}</div></div>`;
    const mark = b.type === 'bullet' ? '<span class="dc-mark">•</span>' : b.type === 'number' ? `<span class="dc-mark">${n}.</span>`
      : b.type === 'todo' ? `<span class="dc-mark"><input type="checkbox" data-check ${b.checked ? 'checked' : ''} aria-label="완료"></span>` : b.type === 'callout' ? '<span class="dc-mark">💡</span>' : '';
    const ph = b.type === 'p' ? '‘/’를 눌러 블록 고르기' : (TYPES.find(x => x.type === b.type) || {}).label;
    return `<div class="dc-b t-${b.type}${b.checked ? ' done' : ''}" data-bid="${b.id}">${h}${mark}<div class="dc-t" contenteditable="true" spellcheck="true" data-ph="${esc(ph)}">${sanitize(b.text)}</div></div>`;
  }
  function habitInner(tid) {
    const { trackers, byT } = logs.data();
    const t = trackers.find(x => x.id === tid);
    if (!t) return '<span class="dc-hx">🔥 볼 수 없는 습관이에요 (삭제됐거나 🔒 나만 보기)</span>';
    const s = statsFor(t, byT.get(t.id), dayKey()), big = bigParts(t, s.yearTotal, { days: s.yearDays });
    return `<span class="dc-hk" style="--c:${esc(t.color)}">${esc(t.emoji || '')} ${esc(t.name)} · ${new Date().getFullYear()}년${t.owner !== me.id ? ` · ${esc(nameOf(t.owner))}님` : ''}</span>
      <span class="dc-hn" style="--c:${esc(t.color)}"><b>${big.num}</b><em>${esc(big.unit)}</em></span>
      <span class="dc-hs">🔥 ${num(s.streak)}일 연속 · 최장 ${num(s.best)}일 · 올해 ${num(s.yearDays)}일 기록</span>`;
  }
  const bIndex = id => doc.blocks.findIndex(b => b.id === id);
  const bEl = id => pane.querySelector(`.dc-b[data-bid="${id}"]`);
  const tEl = id => { const e = bEl(id); return e && e.querySelector('.dc-t'); };
  function rerender(focusId, off = 0) {
    $('dcBlocks').innerHTML = blocksHtml();
    if (focusId) { const t = tEl(focusId); if (t) setCaret(t, off); else bEl(focusId)?.querySelector('[data-h]')?.focus(); }
  }
  function insertAfter(i, b) { doc.blocks.splice(i + 1, 0, b); return b; }
  const status = (s, warn) => { const el = $('dcStatus'); if (el) { el.textContent = s; el.classList.toggle('warn', !!warn); } };

  // ---------- 저장 ----------
  function markDirty() {
    dirty = true;
    if (conflict) return;
    status('저장 중…');
    clearTimeout(saveTimer); saveTimer = setTimeout(save, 1000);
  }
  function patch() {
    const blocks = doc.blocks.map(b => ({ id: b.id, type: b.type, text: TEXTLESS.has(b.type) ? '' : sanitize(b.text), ...(b.type === 'todo' ? { checked: !!b.checked } : {}), ...(b.type === 'habit' ? { tracker: b.tracker || '' } : {}) }));
    return { title: doc.title.trim().slice(0, 100), emoji: Array.from(doc.emoji.trim()).slice(0, 4).join('') || '📄', tags: doc.tags, shared: doc.shared, pinned: doc.pinned, blocks,
      preview: blocks.filter(b => !TEXTLESS.has(b.type)).map(b => textOf(b.text)).join(' ').replace(/\s+/g, ' ').trim().slice(0, 200) };
  }
  function save() {
    clearTimeout(saveTimer);
    if (!doc || !dirty || conflict) return;
    dirty = false;
    const id = doc.id, rev = ++doc.rev;
    status(navigator.onLine ? '저장 중…' : '오프라인 · 연결되면 저장돼요');
    work.savePage(id, patch(), rev).then(() => { if (doc && doc.id === id && !dirty && !conflict) status('저장됨'); })
      .catch(e => {
        if (!doc || doc.id !== id) return toast('문서를 저장하지 못했어요 (' + (e.code || e.message) + ')');
        if (e.code === 'permission-denied') showConflict();
        else { dirty = true; status('저장하지 못했어요 · 다시 시도할게요', true); clearTimeout(saveTimer); saveTimer = setTimeout(save, 5000); }
      });
  }
  const flush = () => { if (doc && dirty && !conflict) save(); };
  function showConflict() {
    conflict = true; dirty = true;
    const r = pages.find(x => x.id === doc.id);
    status('저장 안 됨', true);
    const el = $('dcConflict'); if (!el) return;
    el.hidden = false;
    el.innerHTML = `<b>${r ? esc(nameOf(r.updatedBy)) + '님이' : '누군가'} 먼저 이 문서를 고쳤어요.</b> 내 변경은 아직 저장되지 않았어요.
      <span><button class="lg-btn" data-act="reload" type="button">새 내용 불러오기</button><button class="lg-btn primary" data-act="overwrite" type="button">내 내용으로 덮어쓰기</button></span>`;
  }
  /** 다른 사람이 저장한 새 내용 (또는 내 저장의 메아리) */
  function onRemote() {
    if (!visible) return;
    if (!doc) { if (openId && loaded && pages.some(p => p.id === openId)) openPage(openId); else renderList(); return; }
    const r = pages.find(x => x.id === doc.id);
    if (!r) { if (loaded) { toast('이 문서가 삭제됐어요'); doc = null; openId = null; renderList(); } return; }
    if ($('dcMeta')) $('dcMeta').innerHTML = metaText(r);
    if ((r.rev || 0) > doc.rev) {
      if (dirty || conflict) { if (!conflict) showConflict(); return; }
      // 내가 안 고치고 있으면 조용히 새 내용으로 (커서 자리는 지킨다)
      const a = document.activeElement, blk = a && a.closest && a.closest('.dc-b'), fid = blk && blk.dataset.bid, off = fid && a.classList.contains('dc-t') ? caretOffset(a) : 0;
      openPage(doc.id);
      if (fid && tEl(fid)) setCaret(tEl(fid), off);
      toast(`✎ ${nameOf(r.updatedBy)}님이 고친 내용을 불러왔어요`);
    }
  }

  // ---------- 블록 바꾸기 ----------
  function setType(b, type, extra = {}) {
    const i = bIndex(b.id);
    Object.assign(b, { type }, extra);
    if (type !== 'todo') delete b.checked;
    if (TEXTLESS.has(type)) {
      b.text = '';
      const next = doc.blocks[i + 1];
      const nb = next && next.type === 'p' && !textOf(next.text) ? next : insertAfter(i, { id: newId(), type: 'p', text: '' });
      rerender(nb.id);
    } else rerender(b.id, textOf(b.text).length);
    markDirty();
  }

  // ---------- / 메뉴 · 블록 메뉴 ----------
  function openMenu(mode, bid, anchor, query = '') {
    let items;
    if (mode === 'habit') {
      const { trackers } = logs.data();
      items = trackers.filter(t => !t.archived).map(t => ({ act: 'habit', tracker: t.id, label: `${t.emoji || ''} ${t.name}${t.owner !== me.id ? ` · ${nameOf(t.owner)}님` : ''}`, icon: '🔥' }));
      if (!items.length) items = [{ act: 'none', label: '먼저 오늘 탭에서 습관을 만들어 주세요', icon: '·' }];
    } else if (mode === 'block') {
      items = [{ act: 'up', label: '위로', icon: '↑' }, { act: 'down', label: '아래로', icon: '↓' }, { act: 'dup', label: '복제', icon: '⧉' }, { act: 'turn', label: '블록 바꾸기', icon: '⇄' }, { act: 'remove', label: '삭제', icon: '✕' }];
    } else {
      const qq = query.toLowerCase();
      items = TYPES.filter(t => !qq || t.label.includes(qq) || t.key.includes(qq)).map(t => ({ act: 'type', type: t.type, label: t.label, icon: t.icon }));
    }
    menu = { mode, bid, items, idx: 0 };
    let el = $('dcMenu');
    if (!el) { el = document.createElement('div'); el.id = 'dcMenu'; el.className = 'dc-menu'; el.setAttribute('role', 'listbox'); document.body.appendChild(el); }
    if (!items.length) { closeMenu(); return; }
    el.innerHTML = items.map((it, i) => `<button type="button" role="option" class="${i === 0 ? 'on' : ''}" data-mi="${i}"><span>${esc(it.icon)}</span>${esc(it.label)}</button>`).join('');
    const r = anchor.getBoundingClientRect();
    el.hidden = false;
    const top = r.bottom + 6 + 260 > innerHeight ? Math.max(8, r.top - 6 - Math.min(260, el.scrollHeight)) : r.bottom + 6;
    el.style.top = top + 'px'; el.style.left = Math.min(r.left, innerWidth - 240) + 'px';
  }
  function closeMenu() { menu = null; const el = $('dcMenu'); if (el) el.hidden = true; }
  function menuMove(d) {
    menu.idx = (menu.idx + d + menu.items.length) % menu.items.length;
    $('dcMenu').querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i === menu.idx));
    $('dcMenu').querySelectorAll('button')[menu.idx].scrollIntoView({ block: 'nearest' });
  }
  function menuPick(i = menu.idx) {
    const m = menu, it = m.items[i]; if (!it) return;
    const b = doc.blocks.find(x => x.id === m.bid); closeMenu(); if (!b) return;
    const idx = bIndex(b.id);
    if (it.act === 'type') {
      if (m.mode === 'slash') b.text = '';
      if (it.type === 'habit') { setTimeout(() => openMenu('habit', b.id, bEl(b.id)), 0); return; }
      setType(b, it.type);
    } else if (it.act === 'habit') setType(b, 'habit', { tracker: it.tracker });
    else if (it.act === 'up' && idx > 0) { doc.blocks.splice(idx - 1, 0, ...doc.blocks.splice(idx, 1)); rerender(b.id); markDirty(); }
    else if (it.act === 'down' && idx < doc.blocks.length - 1) { doc.blocks.splice(idx + 1, 0, ...doc.blocks.splice(idx, 1)); rerender(b.id); markDirty(); }
    else if (it.act === 'dup') { const c = insertAfter(idx, { ...structuredClone(b), id: newId() }); rerender(c.id); markDirty(); }
    else if (it.act === 'turn') setTimeout(() => openMenu('turn', b.id, bEl(b.id)), 0);
    else if (it.act === 'remove') {
      doc.blocks.splice(idx, 1);
      if (!doc.blocks.length) doc.blocks.push({ id: newId(), type: 'p', text: '' });
      const f = doc.blocks[Math.max(0, idx - 1)]; rerender(f.id, textOf(f.text).length); markDirty();
    }
  }
  document.addEventListener('click', e => {
    if (!menu) return;
    const mi = e.target.closest('#dcMenu [data-mi]');
    if (mi) { e.preventDefault(); menuPick(+mi.dataset.mi); return; }
    if (!e.target.closest('#dcMenu, [data-h]')) closeMenu();
  });
  addEventListener('resize', closeMenu);

  // ---------- 입력 ----------
  pane.addEventListener('input', e => {
    if (!doc) return;
    const t = e.target;
    if (t.id === 'dcTitle') { doc.title = t.value; autoTitle(); markDirty(); return; }
    if (t.id === 'dcEmoji') { doc.emoji = t.value; markDirty(); return; }
    if (!t.classList.contains('dc-t')) return;
    const b = doc.blocks.find(x => x.id === t.closest('.dc-b').dataset.bid);
    b.text = sanitize(t.innerHTML);
    const txt = t.textContent;
    // 마크다운 단축 입력
    if (b.type === 'p' && !e.isComposing) {
      if (txt === '---') { setType(b, 'divider'); return; }
      const sc = SHORTCUTS.find(([p]) => txt.startsWith(p) || txt.replace(/ /g, ' ').startsWith(p));
      if (sc) { b.text = esc(txt.replace(/ /g, ' ').slice(sc[0].length)); setType(b, sc[1]); return; }
    }
    // / 메뉴
    const m = /^\/(\S{0,12})$/.exec(txt);
    if (m) openMenu('slash', b.id, t, m[1]);
    else if (menu && menu.mode === 'slash') closeMenu();
    markDirty();
  });
  pane.addEventListener('keydown', e => {
    if (!doc) return;
    const t = e.target;
    if (t.id === 'dcTitle' && e.key === 'Enter' && !e.isComposing) { e.preventDefault(); const f = doc.blocks.find(b => !TEXTLESS.has(b.type)); f ? setCaret(tEl(f.id), 0) : (insertAfter(-1, { id: newId(), type: 'p', text: '' }), rerender(doc.blocks[0].id)); return; }
    if (t.id === 'dcTagIn' && (e.key === 'Enter' || e.key === ',') && !e.isComposing) {
      e.preventDefault();
      const v = t.value.trim().replace(/^#/, '').slice(0, 20);
      if (v && !doc.tags.includes(v) && doc.tags.length < 10) { doc.tags.push(v); markDirty(); renderTags(); $('dcTagIn')?.focus(); }
      return;
    }
    if (t.dataset.habit != null && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openHabit(t.dataset.habit); return; }
    if (!t.classList.contains('dc-t')) return;
    if (menu && ['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab'].includes(e.key) && !e.isComposing) {
      e.preventDefault();
      if (e.key === 'ArrowDown' || e.key === 'Tab') menuMove(1); else if (e.key === 'ArrowUp') menuMove(-1); else if (e.key === 'Enter') menuPick(); else closeMenu();
      return;
    }
    const b = doc.blocks.find(x => x.id === t.closest('.dc-b').dataset.bid), i = bIndex(b.id);
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const url = prompt('링크 주소 (https://…)');
      if (url && /^https?:\/\//i.test(url.trim())) document.execCommand('createLink', false, url.trim());
      return;
    }
    if (mod && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      const s = getSelection(); if (!s.rangeCount || s.isCollapsed) return;
      const r = s.getRangeAt(0), c = document.createElement('code');
      try { c.appendChild(r.extractContents()); r.insertNode(c); } catch {}
      b.text = sanitize(t.innerHTML); markDirty();
      return;
    }
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); document.execCommand('insertLineBreak'); return; }
    if (e.key === 'Enter' && b.type === 'code' && !mod) { e.preventDefault(); document.execCommand('insertLineBreak'); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!textOf(b.text).trim() && b.type !== 'p') { setType(b, 'p'); return; }   // 빈 목록에서 Enter → 목록 끝내기
      const s = getSelection(), r = s.getRangeAt(0);
      r.deleteContents();
      const tail = document.createRange(); tail.setStart(r.startContainer, r.startOffset); tail.setEnd(t, t.childNodes.length);
      const box = document.createElement('div'); box.appendChild(tail.extractContents());
      b.text = sanitize(t.innerHTML);
      const nb = insertAfter(i, { id: newId(), type: KEEP_TYPE_ON_ENTER.has(b.type) ? b.type : 'p', text: sanitize(box.innerHTML) });
      if (nb.type === 'todo') nb.checked = false;
      rerender(nb.id, 0); markDirty();
      return;
    }
    if (e.key === 'Backspace' && collapsed() && caretOffset(t) === 0) {
      e.preventDefault();
      if (b.type !== 'p') { setType(b, 'p'); rerender(b.id, 0); return; }
      const prev = doc.blocks[i - 1];
      if (!prev) { if (!textOf(b.text) && doc.blocks.length > 1) { doc.blocks.splice(i, 1); rerender(doc.blocks[0].id); markDirty(); } return; }
      if (TEXTLESS.has(prev.type)) { doc.blocks.splice(i - 1, 1); rerender(b.id, 0); markDirty(); return; }
      const at = textOf(prev.text).length;
      prev.text = sanitize(prev.text + b.text); doc.blocks.splice(i, 1);
      rerender(prev.id, at); markDirty();
      return;
    }
    if (e.key === 'ArrowUp' && caretOffset(t) === 0) {
      const p = doc.blocks.slice(0, i).reverse().find(x => !TEXTLESS.has(x.type));
      if (p) { e.preventDefault(); setCaret(tEl(p.id), textOf(p.text).length); }
    }
    if (e.key === 'ArrowDown' && caretOffset(t) >= t.textContent.length) {
      const nx = doc.blocks.slice(i + 1).find(x => !TEXTLESS.has(x.type));
      if (nx) { e.preventDefault(); setCaret(tEl(nx.id), 0); }
    }
  });
  pane.addEventListener('beforeinput', e => {
    if (e.inputType === 'insertParagraph' && e.target.closest && e.target.closest('.dc-t')) e.preventDefault();
  });
  pane.addEventListener('paste', e => {
    const t = e.target.closest && e.target.closest('.dc-t'); if (!t || !doc) return;
    e.preventDefault();
    const text = (e.clipboardData.getData('text/plain') || '').replace(/\r/g, '');
    const lines = text.split('\n');
    document.execCommand('insertText', false, lines[0]);
    if (lines.length === 1) return;
    const b = doc.blocks.find(x => x.id === t.closest('.dc-b').dataset.bid);
    b.text = sanitize(t.innerHTML);
    let i = bIndex(b.id), last = b;
    for (const line of lines.slice(1)) {
      const sc = SHORTCUTS.find(([p]) => line.startsWith(p));
      last = insertAfter(i++, line.trim() === '---' ? { id: newId(), type: 'divider', text: '' } : { id: newId(), type: sc ? sc[1] : 'p', text: esc(sc ? line.slice(sc[0].length) : line) });
    }
    rerender(last.id, textOf(last.text).length); markDirty();
  });
  function renderTags() {
    $('dcTags').innerHTML = doc.tags.map(t => `<span class="dc-tag">#${esc(t)}<button type="button" data-untag="${esc(t)}" aria-label="${esc(t)} 태그 빼기">×</button></span>`).join('')
      + (doc.tags.length < 10 ? '<input id="dcTagIn" maxlength="20" placeholder="+ 태그" aria-label="태그 추가 (Enter)">' : '');
  }
  function openHabit(tid) {
    const { trackers } = logs.data(), t = trackers.find(x => x.id === tid);
    if (t && t.owner === me.id) ctx.openTracker(tid);
  }

  pane.addEventListener('click', e => {
    const open = e.target.closest('[data-open]');
    if (open) { openPage(open.dataset.open); window.scrollTo(0, 0); return; }
    const tag = e.target.closest('[data-tag]');
    if (tag) { tagF = tag.dataset.tag || null; renderList(); return; }
    if (e.target.matches('[data-check]')) {
      const b = doc.blocks.find(x => x.id === e.target.closest('.dc-b').dataset.bid);
      b.checked = e.target.checked; bEl(b.id).classList.toggle('done', b.checked); markDirty(); return;
    }
    const h = e.target.closest('[data-h]');
    if (h) { openMenu('block', h.closest('.dc-b').dataset.bid, h); return; }
    const hb = e.target.closest('[data-habit]');
    if (hb) { openHabit(hb.dataset.habit); return; }
    const un = e.target.closest('[data-untag]');
    if (un) { doc.tags = doc.tags.filter(t => t !== un.dataset.untag); renderTags(); markDirty(); return; }
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'new') newPage();
    else if (act === 'back') closePage();
    else if (act === 'pin') { doc.pinned = !doc.pinned; b.classList.toggle('on', doc.pinned); b.setAttribute('aria-pressed', doc.pinned); markDirty(); }
    else if (act === 'share') { doc.shared = !doc.shared; b.textContent = doc.shared ? '👥 함께 보기' : '🔒 나만 보기'; markDirty(); toast(doc.shared ? '👥 함께 보기: 상대도 읽고 고칠 수 있어요' : '🔒 나만 보기: 상대에게 보이지 않아요'); }
    else if (act === 'del') {
      if (!confirm(`「${doc.title || '제목 없음'}」 문서를 지울까요? 되돌릴 수 없어요.`)) return;
      const id = doc.id; dirty = false; clearTimeout(saveTimer);
      work.deletePage(id).then(() => toast('🗑 문서를 지웠어요')).catch(err => toast('지우지 못했어요 (' + (err.code || err.message) + ')'));
      doc = null; openId = null; renderList();
    } else if (act === 'addblock') {
      const last = doc.blocks[doc.blocks.length - 1];
      const nb = last && last.type === 'p' && !textOf(last.text) ? last : insertAfter(doc.blocks.length - 1, { id: newId(), type: 'p', text: '' });
      rerender(nb.id); markDirty();
    } else if (act === 'reload') { conflict = false; dirty = false; openPage(doc.id); toast('새 내용을 불러왔어요'); }
    else if (act === 'overwrite') { const r = pages.find(x => x.id === doc.id); if (r) doc.rev = r.rev || 0; conflict = false; dirty = true; $('dcConflict').hidden = true; save(); }
  });
  pane.addEventListener('focusout', e => { if (e.target.id === 'dcTagIn' && e.target.value.trim()) { const v = e.target.value.trim().replace(/^#/, '').slice(0, 20); if (!doc.tags.includes(v) && doc.tags.length < 10) { doc.tags.push(v); markDirty(); } renderTags(); } });

  // ---------- 끌어서 옮기기 (PC) ----------
  pane.addEventListener('dragstart', e => {
    const h = e.target.closest && e.target.closest('[data-h]'); if (!h) return;
    dragId = h.closest('.dc-b').dataset.bid;
    e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId);
    e.dataTransfer.setDragImage(h.closest('.dc-b'), 10, 10);
  });
  const clearDrop = () => pane.querySelectorAll('.drop-before, .drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after'));
  pane.addEventListener('dragover', e => {
    if (!dragId) return;
    const over = e.target.closest && e.target.closest('.dc-b'); if (!over) return;
    e.preventDefault(); clearDrop();
    const r = over.getBoundingClientRect();
    over.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
  });
  pane.addEventListener('drop', e => {
    if (!dragId) return;
    e.preventDefault();
    const over = pane.querySelector('.drop-before, .drop-after');
    if (over && over.dataset.bid !== dragId) {
      const [b] = doc.blocks.splice(bIndex(dragId), 1);
      let j = bIndex(over.dataset.bid); if (over.classList.contains('drop-after')) j++;
      doc.blocks.splice(j, 0, b); rerender(); markDirty();
    }
    clearDrop(); dragId = null;
  });
  pane.addEventListener('dragend', () => { clearDrop(); dragId = null; });
  addEventListener('beforeunload', e => { if (dirty) { flush(); e.preventDefault(); e.returnValue = ''; } });

  function newPage(title = '', tags = []) {
    const id = work.newPage({ title, emoji: '📝', tags, shared: true, pinned: false, blocks: [{ id: newId(), type: 'p', text: '' }], preview: '' });
    const wait = () => (pages.some(p => p.id === id) ? (openPage(id), setTimeout(() => (title ? setCaret(tEl(doc.blocks[0].id), 0) : $('dcTitle')?.focus()), 0)) : setTimeout(wait, 50));
    wait();
    return id;
  }

  return {
    show(tab) {
      const was = visible; visible = tab === 'docs';
      if (!visible) { flush(); closeMenu(); return; }
      if (!was) { if (openId && pages.some(p => p.id === openId)) { if (doc && doc.id === openId && dirty) renderEditor(); else openPage(openId); } else { doc = null; renderList(); } }
    },
    /** 캘린더에서: 그날 메모를 열거나 새로 만든다 */
    openOrCreate(title, tags) {
      const p = pages.find(x => x.owner === me.id && x.title === title);
      go('docs');
      if (p) openPage(p.id); else newPage(title, tags);
    },
    open(id) { go('docs'); openPage(id); },
    pages: () => pages,
    newPage: () => { go('docs'); newPage(); },
  };
}
