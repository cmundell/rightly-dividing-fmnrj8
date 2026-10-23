'use strict';
/* global tsk, makeRefParser */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = {
  books: [],
  parse: null,
  settings: { tr: 'kjv', theme: 'light', fs: 19, split: 56, expandAll: false },
  bookmarks: [], // [{id, added}]
  notes: {}, // {verseId: text}
  cur: { book: 1, ch: 1, sel: null, range: null },
  chapter: null,
  xref: null,
  history: [],
  hIndex: -1,
  search: { q: '', results: [], total: 0 },
  markFilter: 'all',
};

// ---------- persistence ----------
let saveTimer;
const pendingKeys = new Set();
function saveUser(keys) {
  for (const k of keys || ['settings', 'bookmarks', 'notes', 'last']) pendingKeys.add(k);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const patch = {};
    const ks = [...pendingKeys];
    pendingKeys.clear();
    for (const k of ks) {
      if (k === 'last') patch.last = { book: state.cur.book, ch: state.cur.ch, sel: state.cur.sel };
      else patch[k] = state[k];
    }
    tsk.userSet(patch);
  }, 300);
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), 1800);
}

// Translation used for data queries ("both" reads KJV for anchors/search/previews)
const dataTr = () => 'kjv'; // v3 is KJV-only
const trLabel = () => dataTr().toUpperCase();

// ---------- settings ----------
function applySettings() {
  const s = state.settings;
  document.documentElement.dataset.theme = s.theme;
  document.documentElement.style.setProperty('--fs', `${s.fs}px`);
  $('#reader').style.flexBasis = `${s.split}%`;
  $('#study').style.flexBasis = `${100 - s.split}%`;
  $$('.seg button').forEach((b) => b.classList.toggle('on', b.dataset.tr === s.tr));
}

function setFont(delta) {
  state.settings.fs = delta === 0 ? 19 : Math.min(30, Math.max(14, state.settings.fs + delta));
  applySettings();
  saveUser(['settings']);
}

async function setTranslation(tr) {
  if (state.settings.tr === tr) return;
  state.settings.tr = tr;
  applySettings();
  saveUser(['settings']);
  await renderChapter();
  if (state.cur.sel) await showRefs(state.cur.sel);
  if (state.search.q) runSearch(state.search.q);
  renderMarks();
}

// ---------- navigation ----------
function fillChapters() {
  const b = state.books[state.cur.book - 1];
  const sel = $('#chapSel');
  sel.innerHTML = '';
  for (let i = 1; i <= b.chapters; i++) sel.add(new Option(String(i), String(i)));
  sel.value = String(state.cur.ch);
  $('#bookSel').value = String(state.cur.book);
}

function pushHistory() {
  const entry = { book: state.cur.book, ch: state.cur.ch, sel: state.cur.sel, range: state.cur.range };
  const top = state.history[state.hIndex];
  if (top && top.book === entry.book && top.ch === entry.ch && top.sel === entry.sel) return;
  state.history = state.history.slice(0, state.hIndex + 1);
  state.history.push(entry);
  if (state.history.length > 200) state.history.shift();
  state.hIndex = state.history.length - 1;
  updateHistoryButtons();
}

function updateHistoryButtons() {
  $('#btnBack').disabled = state.hIndex <= 0;
  $('#btnFwd').disabled = state.hIndex >= state.history.length - 1;
}

async function stepHistory(d) {
  const i = state.hIndex + d;
  if (i < 0 || i >= state.history.length) return;
  state.hIndex = i;
  const h = state.history[i];
  await go({ book: h.book, ch: h.ch, selId: h.sel, range: h.range }, { push: false });
  updateHistoryButtons();
}

/**
 * Navigate to a location.
 * loc: {book, ch, vs?, vsEnd?} or {id, endId?} or {book, ch, selId}
 */
async function go(loc, { push = true } = {}) {
  let book, ch, selId = null, range = null;
  if (loc.id) {
    const l = await tsk.locate(loc.id);
    book = l.book; ch = l.ch; selId = loc.id;
    if (loc.endId && loc.endId !== loc.id) range = [loc.id, loc.endId];
  } else {
    book = loc.book; ch = loc.ch;
    if (loc.selId) selId = loc.selId;
    else if (loc.vs) {
      selId = await tsk.verseId(book, ch, loc.vs);
      if (loc.vsEnd && loc.vsEnd > loc.vs) range = [selId, await tsk.verseId(book, ch, loc.vsEnd)];
    }
    if (loc.range) range = loc.range;
  }
  const changed = book !== state.cur.book || ch !== state.cur.ch || !state.chapter;
  state.cur = { book, ch, sel: selId, range };
  if (changed) {
    fillChapters();
    await renderChapter();
  } else {
    markSelection();
  }
  if (selId) {
    scrollToVerse(selId);
    await showRefs(selId);
  } else {
    $('#reader').scrollTop = 0;
    renderRefsPlaceholder();
  }
  if (push) pushHistory();
  saveUser(['last']);
}

async function stepChapter(d) {
  let { book, ch } = state.cur;
  ch += d;
  if (ch < 1) {
    if (book === 1) return;
    book -= 1;
    ch = state.books[book - 1].chapters;
  } else if (ch > state.books[book - 1].chapters) {
    if (book === 66) return;
    book += 1;
    ch = 1;
  }
  await go({ book, ch });
}

// ---------- reader ----------
async function renderChapter() {
  const { book, ch } = state.cur;
  const both = false; // v3 is KJV-only
  const data = both ? await tsk.parallel(book, ch) : await tsk.chapter(book, ch, dataTr());
  state.chapter = data;
  const multi = state.books[book - 1].chapters > 1;
  const html = [
    `<div class="chapter-head"><h1>${esc(book === 19 ? 'Psalm' : data.name)}${multi ? ' ' + data.ch : ''}</h1><span class="tr">${both ? 'KJV · BSB' : trLabel()}</span></div>`,
  ];
  if (both) html.push('<div class="pcols"><span>KING JAMES VERSION</span><span>BEREAN STANDARD BIBLE</span></div>');
  for (const v of data.verses) {
    const body = both
      ? `<div class="kjvcol">${esc(v.kjv)}${markIcons(v.id)}</div><div class="bsbcol">${esc(v.bsb)}</div>`
      : `${window.v33Text ? window.v33Text(v) : esc(v.text)}${markIcons(v.id)}`;
    html.push(`<div class="verse${both ? ' par' : ''}${v.para ? ' para' : ''}${v.hasRefs ? '' : ' norefs'}" id="v${v.id}" data-id="${v.id}"><span class="vn">${v.vs}</span>${body}</div>`);
  }
  $('#readerInner').classList.toggle('wide', both);
  const prev = !(book === 1 && ch === 1);
  const next = !(book === 66 && ch === 22);
  html.push(
    `<div class="chapter-foot"><button data-step="-1" ${prev ? '' : 'disabled'}>&#8249; Previous chapter</button><button data-step="1" ${next ? '' : 'disabled'}>Next chapter &#8250;</button></div>`
  );
  $('#readerInner').innerHTML = html.join('');
  markSelection();
  if (window.v3AfterChapter) window.v3AfterChapter(); // paint highlights onto the new verses
}

function markIcons(id) {
  const parts = [];
  if (state.bookmarks.some((b) => b.id === id)) parts.push('&#9733;');
  if (state.notes[id]) parts.push('&#9998;');
  return parts.length ? `<span class="marks">${parts.join(' ')}</span>` : '';
}

function refreshMarkIcons(id) {
  const el = document.getElementById(`v${id}`);
  if (!el) return;
  const old = $('.marks', el);
  if (old) old.remove();
  ($('.kjvcol', el) || el).insertAdjacentHTML('beforeend', markIcons(id));
}

function markSelection() {
  const { sel, range } = state.cur;
  $$('.verse').forEach((el) => {
    const id = Number(el.dataset.id);
    el.classList.toggle('sel', id === sel);
    el.classList.toggle('range', !!range && id >= range[0] && id <= range[1] && id !== sel);
  });
}

function scrollToVerse(id) {
  const el = document.getElementById(`v${id}`);
  if (!el) return;
  const r = $('#reader');
  const top = el.offsetTop - r.clientHeight * 0.25;
  r.scrollTop = Math.max(0, top);
}

// ---------- cross-references ----------
function renderRefsPlaceholder() {
  $('#pane-refs').innerHTML =
    '<div class="empty">Click any verse to see its Treasury of Scripture Knowledge cross-references.<br><br>Verse numbers in <b style="color:var(--accent)">red</b> have entries.</div>';
}

function highlightAnchors(text, groups) {
  const lower = text.toLowerCase();
  const spans = [];
  let from = 0;
  groups.forEach((g, gi) => {
    const a = (g.anchor || '').trim().toLowerCase();
    if (!a || a.length >= lower.length * 0.9) return;
    let at = lower.indexOf(a, from);
    if (at < 0) at = lower.indexOf(a);
    if (at < 0) return;
    const end = at + a.length;
    if (spans.some((s) => at < s.end && end > s.start)) return;
    spans.push({ start: at, end, gi });
    from = end;
  });
  spans.sort((x, y) => x.start - y.start);
  let out = '';
  let pos = 0;
  for (const s of spans) {
    out += esc(text.slice(pos, s.start));
    out += `<mark data-g="${s.gi}">${esc(text.slice(s.start, s.end))}<sup>${s.gi + 1}</sup></mark>`;
    pos = s.end;
  }
  return out + esc(text.slice(pos));
}

async function showRefs(id) {
  const x = await tsk.xrefs(id, dataTr());
  state.xref = x;
  const pane = $('#pane-refs');
  const v = x.verse;
  const marked = state.bookmarks.some((b) => b.id === id);
  const html = [];
  html.push(`<div class="xhead"><h2>${esc(v.label)}</h2>`);
  html.push(`<div class="sub">${x.groups.length} keyword${x.groups.length === 1 ? '' : 's'} · ${x.total} reference${x.total === 1 ? '' : 's'}</div>`);
  html.push(`<div class="vtext">${highlightAnchors(v.text, x.groups)}</div>`);
  html.push(`<div class="actions">
      <button data-act="mark" class="${marked ? 'on' : ''}">${marked ? '&#9733; Bookmarked' : '&#9734; Bookmark'}</button>
      <button data-act="expandAll" class="${state.settings.expandAll ? 'on' : ''}">Show verse text for all</button>
      <button data-act="copy">Copy verse</button>
      <button data-act="copyRefs">Copy references</button>
    </div>`);
  html.push(`<textarea class="note" placeholder="Your notes on ${esc(v.label)}…" data-id="${id}">${esc(state.notes[id] || '')}</textarea></div>`);
  if (!x.groups.length) html.push('<div class="empty">No TSK entries for this verse.</div>');
  x.groups.forEach((g, gi) => {
    html.push(`<div class="grp" id="g${gi}" data-gi="${gi}">
      <div class="kw"><span>${gi + 1}. ${esc(g.anchor || '(whole verse)')}</span><span class="n">${g.refs.length}</span>
      <button class="exp" data-gi="${gi}">${state.settings.expandAll ? 'hide text' : 'show text'}</button></div>
      <div class="body"></div></div>`);
  });
  if (x.referencedBy.length) {
    html.push(`<details class="back"><summary>Referenced from ${x.referencedBy.length} other verse${x.referencedBy.length === 1 ? '' : 's'}</summary>
      <div class="refs">${x.referencedBy.map(chip).join('')}</div></details>`);
  }
  pane.innerHTML = html.join('');
  pane.scrollTop = 0;
  for (let gi = 0; gi < x.groups.length; gi++) renderGroupBody(gi, state.settings.expandAll);
  loadWords(id);
  if (window.v3OnVerse) window.v3OnVerse(id, x);
  if (!['words', 'comm', 'topics'].includes(state.tab)) switchTab('refs');
}

function chip(r) {
  return `<span class="ref" data-s="${r.start}" data-e="${r.end}">${esc(r.label)}</span>`;
}

async function renderGroupBody(gi, expanded) {
  const g = state.xref.groups[gi];
  const box = $(`#g${gi} .body`);
  const btn = $(`#g${gi} .exp`);
  if (!box) return;
  btn.textContent = expanded ? 'hide text' : 'show text';
  box.dataset.expanded = expanded ? '1' : '';
  if (!expanded) {
    box.innerHTML = `<div class="refs">${g.refs.map(chip).join('')}</div>`;
    return;
  }
  const xr = state.xref;
  const rows = await Promise.all(g.refs.map((r) => tsk.passage(r.start, Math.min(r.end, r.start + 7), dataTr())));
  if (state.xref !== xr) return; // user moved on
  box.innerHTML = `<div class="reflist">${g.refs
    .map((r, i) => {
      const p = rows[i];
      const multi = p.verses.length > 1;
      const txt = p.verses.map((v) => (multi ? `<sup>${v.vs}</sup>` : '') + esc(v.text)).join(' ');
      const more = r.end > r.start + 7 ? ' …' : '';
      return `<div class="refrow">${chip(r)}${txt}${more}</div>`;
    })
    .join('')}</div>`;
}

// ---------- hover preview ----------
let previewFor = null;
async function showPreview(el, ev) {
  const s = Number(el.dataset.s), e = Number(el.dataset.e);
  const key = `${s}-${e}`;
  previewFor = key;
  const p = await tsk.passage(s, e, dataTr());
  if (previewFor !== key) return;
  const multi = p.verses.length > 1;
  const box = $('#preview');
  box.innerHTML = `<div class="lab">${esc(p.label)}</div>${p.verses.map((v) => (multi ? `<sup>${v.vs}</sup>` : '') + esc(v.text)).join(' ')}${p.truncated ? ' …' : ''}`;
  box.hidden = false;
  const r = el.getBoundingClientRect();
  const w = Math.min(460, window.innerWidth - 20);
  let left = Math.min(r.left, window.innerWidth - w - 10);
  box.style.left = `${Math.max(10, left)}px`;
  box.style.top = '0px';
  const h = box.offsetHeight;
  const below = r.bottom + 6;
  box.style.top = `${below + h > window.innerHeight - 10 ? Math.max(10, r.top - h - 6) : below}px`;
}
function hidePreview() {
  previewFor = null;
  $('#preview').hidden = true;
}

// ---------- search ----------
function hiliteTerms(text, q) {
  const terms = [];
  const re = /"([^"]+)"|(\S+)/g;
  let m;
  while ((m = re.exec(q))) {
    if (m[1]) terms.push(m[1].trim());
    else if (m[2] !== 'OR' && !m[2].startsWith('-')) terms.push(m[2]);
  }
  const pats = terms
    .map((t) => t.replace(/[^A-Za-z0-9' *]/g, '').trim())
    .filter(Boolean)
    .map((t) => {
      const prefix = t.endsWith('*');
      const base = t.replace(/\*$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\W+');
      // porter stemming matches word variants, so allow a few trailing letters
      return `\\b${base}${prefix ? '\\w*' : "(?:e|es|s|ed|d|eth|th|ing|est|st)?\\b"}`;
    });
  let html = esc(text);
  if (!pats.length) return html;
  try {
    const rx = new RegExp(`(${pats.join('|')})`, 'gi');
    html = html.replace(rx, '<b>$1</b>');
  } catch {
    /* ignore */
  }
  return html;
}

async function runSearch(q, append = false) {
  q = (q || '').trim();
  if (!q) return;
  const scope = $('#scopeSel').value;
  const offset = append ? state.search.results.length : 0;
  const res = await tsk.search(q, dataTr(), scope, 200, offset);
  state.search = { q, total: res.total, results: append ? state.search.results.concat(res.results) : res.results, error: res.error };
  renderSearch();
  switchTab('search');
}

function renderSearch() {
  const s = state.search;
  $('#searchCount').textContent = s.q ? `(${s.total.toLocaleString()})` : '';
  $('#searchStatus').textContent = s.error
    ? s.error
    : s.q
    ? `${s.total.toLocaleString()} verse${s.total === 1 ? '' : 's'} for ${s.q.includes('"') ? s.q : `“${s.q}”`}${s.total > s.results.length ? ` — showing ${s.results.length}` : ''}`
    : '';
  const box = $('#searchResults');
  if (!s.q) {
    box.innerHTML = helpHtml();
    return;
  }
  if (!s.results.length && !s.error) {
    box.innerHTML = '<div class="empty">No verses found.</div>';
    return;
  }
  box.innerHTML =
    s.results.map((r) => `<div class="hit" data-id="${r.id}"><div class="lab">${esc(r.label)}</div><div class="t">${hiliteTerms(r.text, s.q)}</div></div>`).join('') +
    (s.total > s.results.length ? '<button class="more">Load more results</button>' : '');
}

function helpHtml() {
  return `<div class="help hint">
    <p><b>Search tips</b></p>
    <p><code>faith hope charity</code> — verses containing all of the words</p>
    <p><code>"living water"</code> — an exact phrase</p>
    <p><code>shepherd OR sheep</code> — either word</p>
    <p><code>grace -law</code> — leave out verses with a word</p>
    <p><code>redeem*</code> — word beginnings (redeem, redeemed, redeemer…)</p>
    <p>Word endings are matched loosely, so <code>love</code> also finds <i>loved</i> and <i>loveth</i>.</p>
    <p><b>Go to</b> box: <code>John 3:16</code>, <code>jn 3 16</code>, <code>1 cor 13:4-7</code>, <code>Ps 23</code>.</p>
    <p><b>Keys</b>: ↑/↓ move between verses · Ctrl+←/→ change chapter · Alt+←/→ back/forward · Ctrl+G go to · Ctrl+F search · Ctrl+T switch KJV/BSB.</p>
  </div>`;
}

// ---------- bookmarks ----------
async function toggleBookmark(id) {
  const i = state.bookmarks.findIndex((b) => b.id === id);
  if (i >= 0) state.bookmarks.splice(i, 1);
  else state.bookmarks.push({ id, added: Date.now() });
  saveUser(['bookmarks']);
  refreshMarkIcons(id);
  renderMarks();
  if (state.cur.sel === id) {
    const btn = $('[data-act="mark"]');
    const on = i < 0;
    if (btn) {
      btn.classList.toggle('on', on);
      btn.innerHTML = on ? '&#9733; Bookmarked' : '&#9734; Bookmark';
    }
  }
}

async function renderMarks() {
  const ids = new Set(state.bookmarks.map((b) => b.id));
  Object.keys(state.notes).forEach((k) => state.notes[k] && ids.add(Number(k)));
  let list = [...ids].sort((a, b) => a - b);
  if (state.markFilter === 'marks') list = list.filter((id) => state.bookmarks.some((b) => b.id === id));
  if (state.markFilter === 'notes') list = list.filter((id) => state.notes[id]);
  $('#markCount').textContent = ids.size ? `(${ids.size})` : '';
  const verses = await tsk.versesByIds(list, dataTr());
  const pane = $('#pane-marks');
  const f = state.markFilter;
  pane.innerHTML =
    `<div class="filter">
      <button data-f="all" class="${f === 'all' ? 'on' : ''}">All</button>
      <button data-f="marks" class="${f === 'marks' ? 'on' : ''}">Bookmarked</button>
      <button data-f="notes" class="${f === 'notes' ? 'on' : ''}">With notes</button></div>` +
    (verses.length
      ? verses
          .map((v) => {
            const isMark = state.bookmarks.some((b) => b.id === v.id);
            return `<div class="mark" data-id="${v.id}"><div class="top"><span class="lab">${isMark ? '&#9733; ' : ''}${esc(v.label)}</span>
            ${isMark ? `<button class="del" data-id="${v.id}" title="Remove bookmark">&times;</button>` : ''}</div>
            <div class="t">${esc(v.text)}</div>${state.notes[v.id] ? `<div class="nt">${esc(state.notes[v.id])}</div>` : ''}</div>`;
          })
          .join('')
      : '<div class="empty">Nothing here yet. Use “Bookmark” or write a note on any verse.</div>');
}

// ---------- tabs ----------
function switchTab(name) {
  state.tab = name;
  $$('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  $$('.pane').forEach((p) => p.classList.toggle('on', p.id === `pane-${name}`));
}

// ---------- events ----------
function wire() {
  $('#bookSel').addEventListener('change', (e) => go({ book: Number(e.target.value), ch: 1 }));
  $('#chapSel').addEventListener('change', (e) => go({ book: state.cur.book, ch: Number(e.target.value) }));
  $('#btnPrev').addEventListener('click', () => stepChapter(-1));
  $('#btnNext').addEventListener('click', () => stepChapter(1));
  $('#btnBack').addEventListener('click', () => stepHistory(-1));
  $('#btnFwd').addEventListener('click', () => stepHistory(1));
  $('#btnFontUp').addEventListener('click', () => setFont(1));
  $('#btnFontDown').addEventListener('click', () => setFont(-1));
  $('#btnTheme').addEventListener('click', toggleTheme);
  $$('.seg button').forEach((b) => b.addEventListener('click', () => setTranslation(b.dataset.tr)));

  $('#gotoForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const r = state.parse($('#gotoInput').value);
    if (!r) return toast('Reference not recognized — try “John 3:16” or “Ps 23”.');
    $('#gotoInput').value = '';
    $('#gotoInput').blur();
    go(r);
  });
  $('#searchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('#searchInput').value;
    // A reference typed into search just navigates there
    const r = /\d/.test(q) ? state.parse(q) : null;
    if (r) return go(r);
    runSearch(q);
  });
  $('#scopeSel').addEventListener('change', () => state.search.q && runSearch(state.search.q));

  $('#readerInner').addEventListener('click', (e) => {
    const step = e.target.closest('[data-step]');
    if (step) return stepChapter(Number(step.dataset.step));
    const v = e.target.closest('.verse');
    if (v) {
      const id = Number(v.dataset.id);
      state.cur.sel = id;
      state.cur.range = null;
      markSelection();
      showRefs(id);
      pushHistory();
      saveUser(['last']);
    }
  });

  document.addEventListener('mouseover', (e) => {
    const r = e.target.closest('.ref');
    if (r && !r.closest('.refrow')) showPreview(r, e);
  });
  document.addEventListener('mouseout', (e) => {
    if (e.target.closest('.ref')) hidePreview();
  });

  $('#pane-refs').addEventListener('click', (e) => {
    const ref = e.target.closest('.ref');
    if (ref) {
      hidePreview();
      return go({ id: Number(ref.dataset.s), endId: Number(ref.dataset.e) });
    }
    const m = e.target.closest('mark[data-g]');
    if (m) {
      const g = document.getElementById(`g${m.dataset.g}`);
      if (g) g.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const exp = e.target.closest('.exp');
    if (exp) {
      const gi = Number(exp.dataset.gi);
      const box = $(`#g${gi} .body`);
      return renderGroupBody(gi, !box.dataset.expanded);
    }
    const act = e.target.closest('[data-act]');
    if (!act || !state.xref) return;
    const id = state.xref.verse.id;
    if (act.dataset.act === 'mark') toggleBookmark(id);
    if (act.dataset.act === 'expandAll') {
      state.settings.expandAll = !state.settings.expandAll;
      act.classList.toggle('on', state.settings.expandAll);
      saveUser(['settings']);
      state.xref.groups.forEach((_, gi) => renderGroupBody(gi, state.settings.expandAll));
    }
    if (act.dataset.act === 'copy') {
      navigator.clipboard.writeText(`${state.xref.verse.label} (${trLabel()}) ${state.xref.verse.text}`);
      toast('Verse copied');
    }
    if (act.dataset.act === 'copyRefs') {
      const lines = [state.xref.verse.label];
      state.xref.groups.forEach((g, i) => lines.push(`${i + 1}. ${g.anchor}: ${g.refs.map((r) => r.label).join('; ')}`));
      navigator.clipboard.writeText(lines.join('\n'));
      toast('References copied');
    }
  });

  $('#pane-refs').addEventListener('input', (e) => {
    if (!e.target.classList.contains('note')) return;
    const id = Number(e.target.dataset.id);
    const t = e.target.value;
    if (t.trim()) state.notes[id] = t;
    else delete state.notes[id];
    saveUser(['notes']);
    clearTimeout(wire.nt);
    wire.nt = setTimeout(() => {
      refreshMarkIcons(id);
      renderMarks();
    }, 500);
  });

  $('#searchResults').addEventListener('click', (e) => {
    if (e.target.closest('.more')) return runSearch(state.search.q, true);
    const h = e.target.closest('.hit');
    if (h) go({ id: Number(h.dataset.id) }).then(() => switchTab('search'));
  });

  $('#pane-marks').addEventListener('click', (e) => {
    const f = e.target.closest('[data-f]');
    if (f) {
      state.markFilter = f.dataset.f;
      return renderMarks();
    }
    const del = e.target.closest('.del');
    if (del) return toggleBookmark(Number(del.dataset.id));
    const m = e.target.closest('.mark');
    if (m) go({ id: Number(m.dataset.id) });
  });

  $$('.tabs button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

  // resizable split
  const div = $('#divider');
  div.addEventListener('mousedown', (e) => {
    e.preventDefault();
    div.classList.add('drag');
    const total = $('#layout').getBoundingClientRect();
    const move = (ev) => {
      const pct = ((ev.clientX - total.left) / total.width) * 100;
      state.settings.split = Math.round(Math.min(75, Math.max(30, pct)));
      applySettings();
    };
    const up = () => {
      div.classList.remove('drag');
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      saveUser(['settings']);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });

  document.addEventListener('keydown', (e) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (e.key === 'Escape') {
      hidePreview();
      if (typing) document.activeElement.blur();
      return;
    }
    if (typing) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!state.chapter) return;
      e.preventDefault();
      const ids = state.chapter.verses.map((v) => v.id);
      let i = ids.indexOf(state.cur.sel);
      i = i < 0 ? 0 : Math.min(ids.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)));
      state.cur.sel = ids[i];
      state.cur.range = null;
      markSelection();
      const el = document.getElementById(`v${ids[i]}`);
      el && el.scrollIntoView({ block: 'nearest' });
      clearTimeout(wire.kt);
      wire.kt = setTimeout(() => {
        showRefs(state.cur.sel);
        pushHistory();
        saveUser(['last']);
      }, 120);
    }
  });

  tsk.onMenu((cmd) => {
    const map = {
      back: () => stepHistory(-1),
      forward: () => stepHistory(1),
      prevChapter: () => stepChapter(-1),
      nextChapter: () => stepChapter(1),
      goto: () => {
        $('#searchInput').focus();
        $('#searchInput').select();
      },
      search: () => {
        $('#searchInput').focus();
        $('#searchInput').select();
      },
      fontUp: () => setFont(1),
      fontDown: () => setFont(-1),
      fontReset: () => setFont(0),
      toggleTr: () => setTranslation({ kjv: 'bsb', bsb: 'both', both: 'kjv' }[state.settings.tr] || 'kjv'),
      wordTab: () => switchTab('words'),
      toggleTheme,
      help: () => {
        state.search = { q: '', results: [], total: 0 };
        renderSearch();
        switchTab('search');
      },
    };
    map[cmd] && map[cmd]();
  });
}

function toggleTheme() {
  state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
  applySettings();
  saveUser(['settings']);
}

// =====================================================================
// v2: Word study (Strong's), Webster 1828, word card
// =====================================================================
const ws = { verseId: null, words: [], view: 'verse', strong: null, conc: null, selPos: null, dict: null };

const IRREG = {
  hath: 'have', hast: 'have', had: 'have', doth: 'do', dost: 'do', did: 'do', saith: 'say', said: 'say', spake: 'speak',
  spoken: 'speak', art: 'be', is: 'be', was: 'be', were: 'be', wast: 'be', been: 'be', begat: 'beget', begotten: 'beget',
  gave: 'give', given: 'give', went: 'go', gone: 'go', came: 'come', made: 'make', took: 'take', taken: 'take',
  knew: 'know', known: 'know', saw: 'see', seen: 'see', slew: 'slay', slain: 'slay', smote: 'smite', wrought: 'work',
  men: 'man', brethren: 'brother', children: 'child', thee: 'you', thou: 'you', ye: 'you', thy: 'your', thine: 'your',
  shalt: 'shall', wilt: 'will', unto: 'to', spirit: 'spirit', sware: 'swear', bare: 'bear', brake: 'break',
};
const STOP = new Set(('the a an and of to in that for is be it he she they them his her their which with as by but not ' +
  'this was were shall will i me my you your our we us all from upon on at so or are have hath had unto thee thou thy ye ' +
  'there then when what who whom also even o do does did may might having being let can could would should must ' +
  'been am being shalt wilt hast doth dost').split(' '));

function stems(word) {
  const w = String(word).toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return [];
  const out = new Set([w]);
  if (IRREG[w]) out.add(IRREG[w]);
  const rules = [[/ieth$/, 'y'], [/ied$/, 'y'], [/ies$/, 'y'], [/eth$/, 'e'], [/eth$/, ''], [/est$/, 'e'], [/est$/, ''],
    [/edst$/, ''], [/ed$/, 'e'], [/ed$/, ''], [/ing$/, 'e'], [/ing$/, ''], [/es$/, ''], [/s$/, ''], [/ly$/, ''], [/(.)\1(ed|ing|eth|est)$/, '$1']];
  for (const [re, r] of rules) if (re.test(w)) out.add(w.replace(re, r));
  return [...out].filter((x) => x.length > 1);
}
function stemsMatch(a, b) {
  for (const x of a) for (const y of b) {
    if (x === y) return true;
    if (x.length >= 4 && y.length >= 4 && (x.startsWith(y) || y.startsWith(x))) return true;
  }
  return false;
}
const tokensOf = (s) => String(s || '').toLowerCase().replace(/<[^>]*>|\[[^\]]*\]|\([^)]*\)/g, ' ').split(/[^a-z]+/).filter(Boolean);

/** Best original-language word for an English token. Returns the word row or null. */
function alignToken(token, words, tokenIndex = 0, tokenCount = 1) {
  if (!words.length) return null;
  const T = stems(token);
  if (!T.length) return null;
  let best = null, bestScore = 0, bestDist = 9;
  words.forEach((w, i) => {
    let score = 0;
    if (tokensOf(w.gloss).some((g) => stemsMatch(T, stems(g)))) score = 3;
    else if (tokensOf(w.kjv_def).some((g) => stemsMatch(T, stems(g)))) score = 2;
    if (!score) return;
    if (STOP.has(token.toLowerCase())) score -= 1.5;
    const dist = Math.abs(i / words.length - tokenIndex / Math.max(1, tokenCount));
    if (score > bestScore || (score === bestScore && dist < bestDist)) {
      best = w; bestScore = score; bestDist = dist;
    }
  });
  return bestScore > 0 ? best : null;
}

// Allow only harmless formatting tags from dictionary HTML
function sanitize(html) {
  const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
  const OK = new Set(['P', 'B', 'I', 'EM', 'STRONG', 'BR', 'HR', 'SUP', 'SUB']);
  const walk = (node) => {
    let out = '';
    for (const n of node.childNodes) {
      if (n.nodeType === 3) out += esc(n.textContent);
      else if (n.nodeType === 1) {
        const inner = walk(n);
        const t = n.tagName;
        if (OK.has(t)) out += t === 'BR' || t === 'HR' ? `<${t.toLowerCase()}>` : `<${t.toLowerCase()}>${inner}</${t.toLowerCase()}>`;
        else out += inner;
      }
    }
    return out;
  };
  return walk(doc.body.firstChild);
}

function wrapWords(text) {
  let i = 0;
  return esc(text).replace(/[A-Za-z][A-Za-z']*/g, (m) => `<span class="w" data-t="${m}" data-i="${i++}">${m}</span>`);
}

async function loadWords(id) {
  if (ws.verseId === id && ws.words.length) {
    if (ws.view === 'verse') renderWordsPane();
    return;
  }
  ws.verseId = id;
  ws.words = await tsk.words(id);
  ws.view = 'verse';
  ws.selPos = null;
  renderWordsPane();
}

function strongChip(id) {
  return id ? `<span class="sn" data-sn="${esc(id)}">${esc(id)}</span>` : '';
}

function renderWordsPane() {
  const pane = $('#pane-words');
  if (ws.view === 'strong') return renderStrongEntry();
  const x = state.xref;
  if (!x || x.verse.id !== ws.verseId) {
    pane.innerHTML = '<div class="empty">Select a verse to study its Hebrew or Greek words.</div>';
    return;
  }
  const lang = ws.words[0] ? (ws.words[0].lang === 'H' ? 'Hebrew' : 'Greek') : '';
  const html = [`<div class="xhead"><h2>${esc(x.verse.label)}</h2><div class="sub">${ws.words.length} ${lang} words · click an English word or a row</div></div>`];
  html.push(`<div class="ws-verse" id="wsVerse">${wrapWords(x.verse.text)}</div>`);
  if (!ws.words.length) {
    html.push('<div class="empty">No original-language tagging for this verse (it is absent from the Hebrew manuscript used).</div>');
  } else {
    html.push(`<div class="wslist-head"><span>English gloss</span><span>${lang}</span><span>Transliteration</span><span>Strong's</span></div>`);
    for (const w of ws.words) {
      html.push(`<div class="wsrow${ws.selPos === w.pos ? ' on' : ''}" data-pos="${w.pos}" data-sn="${esc(w.strongs || '')}" title="${esc(w.def || '')}">
        <span class="gl">${esc(w.gloss)}</span><span class="og ${w.lang}">${esc(w.word)}</span>
        <span class="tl">${esc(w.translit)}</span>${strongChip(w.strongs)}</div>`);
    }
  }
  html.push(`<div class="section-title">Webster's 1828 Dictionary</div>
    <form class="lookup" id="dictForm"><input id="dictInput" placeholder="Look up any word, e.g. conversation, prevent, charity" value="${esc(ws.dict ? ws.dict.query : '')}" /><button>Look up</button></form>
    <div id="dictOut">${ws.dict ? dictHtml(ws.dict) : '<div class="hint">KJV forms like “loveth” or “spake” are matched to their headwords.</div>'}</div>`);
  pane.innerHTML = html.join('');
}

function dictHtml(d) {
  if (!d.headword) return `<div class="empty">No 1828 entry found for “${esc(d.query)}”.</div>`;
  const note = d.headword !== String(d.query).toLowerCase() ? `<div class="hint">Showing <b>${esc(d.headword.toUpperCase())}</b> for “${esc(d.query)}”</div>` : '';
  return `${note}<div class="dictbox dict">${sanitize(d.html)}</div>`;
}

async function openStrong(id, { push = true } = {}) {
  if (!id) return;
  const [entry, conc] = await Promise.all([tsk.strong(id), tsk.concordance(id, dataTr(), 150, 0)]);
  if (!entry) return toast(`No dictionary entry for ${id}`);
  if (push) ws.back = { view: ws.view, strong: ws.strong };
  ws.view = 'strong';
  ws.strong = entry;
  ws.conc = conc;
  renderStrongEntry();
  switchTab('words');
  $('#pane-words').scrollTop = 0;
}

function linkStrongs(text) {
  return esc(text).replace(/\b([HG]\d{1,4})\b/g, '<span class="sn" data-sn="$1">$1</span>');
}

function renderStrongEntry() {
  const e = ws.strong;
  const c = ws.conc;
  const lang = e.id[0] === 'H' ? 'Hebrew' : 'Greek';
  const html = [`<button class="backlink" data-act="wsBack">&#8592; Back to ${ws.verseId && state.xref ? esc(state.xref.verse.label) : 'verse'}</button>`];
  html.push(`<div class="entry">
    <div class="top"><span class="lemma ${e.id[0]}">${esc(e.lemma)}</span><span class="xl">${esc(e.xlit)}</span>
      ${e.pron ? `<span class="pr">(${esc(e.pron)})</span>` : ''}<span class="num">${esc(e.id)} · ${lang}</span></div>
    <dl>
      <dt>Definition</dt><dd>${esc(e.def) || '—'}</dd>
      ${e.derivation ? `<dt>Derivation</dt><dd>${linkStrongs(e.derivation)}</dd>` : ''}
      <dt>KJV renders</dt><dd>${esc(e.kjv_def) || '—'}</dd>
      <dt>Occurs</dt><dd>${e.uses.toLocaleString()} time${e.uses === 1 ? '' : 's'} in ${e.verses.toLocaleString()} verse${e.verses === 1 ? '' : 's'}</dd>
      ${e.glosses.length ? `<dt>Glossed as</dt><dd><div class="gloss-chips">${e.glosses.map((g) => `<span>${esc(g.g)}<b>${g.n}</b></span>`).join('')}</div></dd>` : ''}
    </dl></div>`);
  html.push(`<div class="conc-head"><h3>Every verse with ${esc(e.id)}</h3><span class="hint">${c.total.toLocaleString()} verses${c.total > c.results.length ? ` · showing ${c.results.length}` : ''}</span></div>`);
  html.push(`<div class="results">${c.results
    .map((r) => `<div class="hit" data-id="${r.id}"><div class="lab">${esc(r.label)}<span class="gls">${esc(r.glosses || '')}</span></div><div class="t">${hiliteGloss(r.text, r.glosses, e.kjv_def)}</div></div>`)
    .join('')}</div>`);
  if (c.total > c.results.length) html.push('<button class="more" data-act="concMore">Load more verses</button>');
  $('#pane-words').innerHTML = html.join('');
}

// Highlight the English words in a verse that render the studied Strong's word
function hiliteGloss(text, glosses, kjvDef) {
  const keys = [...tokensOf(glosses), ...tokensOf(kjvDef)].filter((t) => !STOP.has(t)).map(stems);
  if (!keys.length) return esc(text);
  return esc(text).replace(/[A-Za-z][A-Za-z']*/g, (m) => (keys.some((k) => stemsMatch(stems(m), k)) && !STOP.has(m.toLowerCase()) ? `<b>${m}</b>` : m));
}

// ---------- floating word card ----------
async function showWordCard(word, rect, verseId, tokenIndex, tokenCount) {
  const card = $('#wordcard');
  const [d, words] = await Promise.all([tsk.dict(word), verseId === ws.verseId ? ws.words : tsk.words(verseId)]);
  const match = alignToken(word, words, tokenIndex, tokenCount);
  const label = verseId && state.xref && state.xref.verse.id === verseId ? state.xref.verse.label : '';
  card.innerHTML = `
    <div class="wc-head"><h4>${esc(word)}</h4><span class="hint">${esc(label)}</span><button class="x" title="Close (Esc)">&times;</button></div>
    ${match ? `<div class="wc-label">Original word (best match)</div>
      <div class="wc-strong"><span class="og">${esc(match.word)}</span><i>${esc(match.translit)}</i>${strongChip(match.strongs)}
      <span class="d"><b>${esc(match.gloss)}</b> — ${esc(match.def || '')}</span></div>` : ''}
    <div class="wc-label">Webster's 1828</div>
    ${d.headword ? `${d.headword !== word.toLowerCase() ? `<div class="hint">Entry: ${esc(d.headword.toUpperCase())}</div>` : ''}<div class="dict">${sanitize(d.html)}</div>` : `<div class="hint">No 1828 entry for “${esc(word)}”.</div>`}
    ${match && match.strongs ? `<button class="more" data-sn="${esc(match.strongs)}">Open ${esc(match.strongs)} word study</button>` : ''}`;
  card.hidden = false;
  const w = card.offsetWidth, h = card.offsetHeight;
  let left = Math.min(Math.max(12, rect.left), window.innerWidth - w - 12);
  let top = rect.bottom + 8;
  if (top + h > window.innerHeight - 12) top = Math.max(12, rect.top - h - 8);
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
  card.scrollTop = 0;
}
const hideWordCard = () => ($('#wordcard').hidden = true);

function tokenIndexIn(text, offsetWord) {
  const toks = String(text).match(/[A-Za-z][A-Za-z']*/g) || [];
  return { count: toks.length, index: Math.max(0, toks.findIndex((t) => t.toLowerCase() === offsetWord.toLowerCase())) };
}

function wireV2() {
  // Double-click a word in the reading pane -> word card
  $('#readerInner').addEventListener('dblclick', async (e) => {
    const v = e.target.closest('.verse');
    if (!v) return;
    const sel = window.getSelection();
    const word = (sel && sel.toString().trim().match(/[A-Za-z][A-Za-z']*/) || [])[0];
    if (!word) return;
    const rect = sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : e.target.getBoundingClientRect();
    const id = Number(v.dataset.id);
    const col = e.target.closest('.kjvcol, .bsbcol');
    const text = col ? col.textContent : v.textContent;
    const { index, count } = tokenIndexIn(text, word);
    showWordCard(word, rect, id, index, count);
  });

  $('#wordcard').addEventListener('click', (e) => {
    if (e.target.closest('.x')) return hideWordCard();
    const sn = e.target.closest('[data-sn]');
    if (sn) {
      hideWordCard();
      openStrong(sn.dataset.sn);
    }
  });
  document.addEventListener('mousedown', (e) => {
    if (!$('#wordcard').hidden && !e.target.closest('#wordcard')) hideWordCard();
  });
  document.addEventListener('keydown', (e) => e.key === 'Escape' && hideWordCard());

  $('#pane-words').addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]');
    if (act && act.dataset.act === 'wsBack') {
      ws.view = 'verse';
      return renderWordsPane();
    }
    if (act && act.dataset.act === 'concMore') {
      const more = await tsk.concordance(ws.strong.id, dataTr(), 150, ws.conc.results.length);
      ws.conc.results = ws.conc.results.concat(more.results);
      const y = $('#pane-words').scrollTop;
      renderStrongEntry();
      $('#pane-words').scrollTop = y;
      return;
    }
    const sn = e.target.closest('.sn');
    if (sn) return openStrong(sn.dataset.sn);
    const hit = e.target.closest('.hit');
    if (hit) {
      await go({ id: Number(hit.dataset.id) });
      ws.view = 'strong';
      renderStrongEntry();
      return switchTab('words');
    }
    const w = e.target.closest('#wsVerse .w');
    if (w) {
      $$('#wsVerse .w').forEach((x) => x.classList.toggle('on', x === w));
      const all = $$('#wsVerse .w');
      const m = alignToken(w.dataset.t, ws.words, Number(w.dataset.i), all.length);
      ws.selPos = m ? m.pos : null;
      $$('.wsrow').forEach((r) => r.classList.toggle('on', m && Number(r.dataset.pos) === m.pos));
      const row = m && $(`.wsrow[data-pos="${m.pos}"]`);
      if (row) row.scrollIntoView({ block: 'nearest' });
      showWordCard(w.dataset.t, w.getBoundingClientRect(), ws.verseId, Number(w.dataset.i), all.length);
      return;
    }
    const row = e.target.closest('.wsrow');
    if (row && row.dataset.sn) openStrong(row.dataset.sn);
  });

  $('#pane-words').addEventListener('submit', async (e) => {
    if (e.target.id !== 'dictForm') return;
    e.preventDefault();
    const q = $('#dictInput').value.trim();
    if (!q) return;
    ws.dict = await tsk.dict(q);
    $('#dictOut').innerHTML = dictHtml(ws.dict);
  });
}

// ---------- boot ----------
(async function init() {
  // Wait until every script (v3.js, v32.js) has run, so their startup hooks receive the saved
  // data. Without this, a fast database reply could let startup continue mid-load.
  if (document.readyState === 'loading') await new Promise((r) => document.addEventListener('DOMContentLoaded', r, { once: true }));
  state.books = await tsk.books();
  state.parse = makeRefParser(state.books);
  const u = await tsk.userGet();
  if (!u.settings || !u.settings.theme) {
    state.settings.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  Object.assign(state.settings, u.settings || {});
  state.settings.tr = 'kjv';
  if (window.v3Init) window.v3Init(u);
  state.bookmarks = u.bookmarks || [];
  state.notes = u.notes || {};
  const bs = $('#bookSel');
  const og = document.createElement('optgroup');
  og.label = 'Old Testament';
  const ng = document.createElement('optgroup');
  ng.label = 'New Testament';
  for (const b of state.books) (b.id <= 39 ? og : ng).appendChild(new Option(b.name, String(b.id)));
  bs.append(og, ng);
  applySettings();
  wire();
  wireV2();
  renderSearch();
  renderMarks();
  const last = u.last;
  if (last && last.book) await go({ book: last.book, ch: last.ch, selId: last.sel || undefined });
  else await go({ book: 1, ch: 1, vs: 1 });
})();
