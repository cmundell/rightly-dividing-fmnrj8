'use strict';
/* Reading and the core of the app: the text, cross-references, search, word study, the word card, highlights and tags, commentary, topics, the notes list, the trail and study sheets.
   Merged in 3.15 from the per-release layers (app.js, v3.js), kept in their original order: later
   sections still extend earlier ones by wrapping window.X. */

// =====================================================================================================
// from app.js
// =====================================================================================================
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
  const html = [];
  html.push(`<div class="xhead"><h2>${esc(v.label)}</h2>`);
  html.push(`<div class="sub">${x.groups.length} keyword${x.groups.length === 1 ? '' : 's'} · ${x.total} reference${x.total === 1 ? '' : 's'}</div>`);
  html.push(`<div class="vtext">${highlightAnchors(v.text, x.groups)}</div>`);
  // what you can do with the verse: the everyday ones first, the rest under More
  html.push(`<div class="actions">
      <button data-act="copy">Copy verse</button>
      <button data-act="vaMore" class="va-more-btn" aria-haspopup="true" aria-expanded="false">More &#8943;</button>
      <div class="va-menu" hidden>
        <button data-act="copyRefs">Copy references</button>
        <button data-act="expandAll" class="${state.settings.expandAll ? 'on' : ''}">Show verse text for all references</button>
        <button data-act="addTags">Add tags…</button>
        <a class="va-link" href="${blbUrl(v.label)}" target="_blank" rel="noopener" title="Opens in your web browser (needs the internet)">Commentary at Blue Letter Bible ↗</a>
      </div>
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
  if (!['words', 'topics'].includes(state.tab)) switchTab('refs');
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
    const menu = $('#pane-refs .va-menu');
    if (act.dataset.act === 'vaMore' && menu) {
      menu.hidden = !menu.hidden;
      act.setAttribute('aria-expanded', String(!menu.hidden));
      return;
    }
    if (menu && act.closest('.va-menu')) setTimeout(() => (menu.hidden = true), 0); // after the item has done its work
    if (act.dataset.act === 'addTags') {
      const t = $('#pane-refs .tagin');
      if (t) {
        t.hidden = false;
        t.focus();
      }
      return;
    }
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

  document.addEventListener('click', (e) => {
    const menu = $('#pane-refs .va-menu');
    if (menu && !menu.hidden && !e.target.closest('#pane-refs .actions')) menu.hidden = true;
  });
  $('#pane-marks').addEventListener('click', (e) => {
    const un = e.target.closest('[data-unhl]');
    if (un) {
      e.stopPropagation();
      return setHighlight(Number(un.dataset.unhl), '');
    }
    const c = e.target.closest('[data-hlf]');
    if (c) {
      v3.markColor = v3.markColor === c.dataset.hlf ? null : c.dataset.hlf;
      return renderMarks();
    }
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
  // 3.15: a bookmark is now simply a highlight
  if (state.bookmarks.length) {
    state.highlights = state.highlights || {}; // loaded by v3Init, just above
    for (const b of state.bookmarks) if (!state.highlights[b.id]) state.highlights[b.id] = 'yellow';
    state.bookmarks = [];
    saveUser(['bookmarks', 'highlights']);
  }
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

// =====================================================================================================
// from v3.js
// =====================================================================================================
/* v3 features: reference trail, highlights & tags, Matthew Henry commentary, Nave's topics,
   grammar parsing, Strong's-aware search results, notes manager, study sheets.
   Loaded after app.js and shares its globals (state, tsk, go, esc, $, $$, ...). */
/* global tsk, state, $, $$, esc, go, toast, switchTab, showPreview, hidePreview, sanitize, saveUser,
   ws, openStrong, alignToken, tokensOf, stems, stemsMatch, STOP, hiliteTerms, hiliteGloss, refreshMarkIcons,
   markSelection, strongChip, wrapWords, dictHtml, renderStrongEntry, hideWordCard */

const v3 = {
  topicsVerse: [],
  topicsFor: null,
  topic: null,
  topicView: 'list',
  topicQuery: '',
  topicResults: [],
  cursor: -1,
  skipTrail: false,
  markTag: null,
  markColor: null,
  markQuery: '',
};
const HL_COLORS = ['yellow', 'green', 'blue', 'pink', 'purple'];
// Defaults until v3Init receives the saved data (init in app.js is async)
state.highlights = state.highlights || {};
state.tags = state.tags || {};
state.trail = state.trail || [];

// ===================================================================== init + hooks
window.v3Init = (u) => {
  state.highlights = u.highlights || {};
  state.tags = u.tags || {};
  state.trail = Array.isArray(u.trail) ? u.trail : [];
  v3.cursor = state.trail.length - 1;
  if (u.importedFrom) setTimeout(() => toast(`Notes and highlights copied from “${u.importedFrom}”`), 1500);
};

window.v3AfterChapter = () => {
  for (const el of $$('.verse')) applyHighlight(el);
};

window.v3OnVerse = (id, x) => {
  pushTrail(id);
  renderTrail();
  injectVerseTools(id);
  loadVerseTopics(id, x);
};

// ===================================================================== reference trail
function pushTrail(id) {
  if (v3.skipTrail) {
    v3.skipTrail = false;
    return;
  }
  const t = state.trail;
  if (t[t.length - 1] === id) {
    v3.cursor = t.length - 1;
    return;
  }
  t.push(id);
  if (t.length > 60) t.splice(0, t.length - 60);
  v3.cursor = t.length - 1;
  saveUser(['trail']);
}

async function renderTrail() {
  const box = $('#trailItems');
  const ids = state.trail;
  if (!ids.length) {
    box.innerHTML = '<span class="hint">Verses you study appear here in order, so you can retrace a chain of cross-references.</span>';
    return;
  }
  const rows = await tsk.versesByIds([...new Set(ids)]);
  const label = new Map(rows.map((r) => [r.id, r.label]));
  box.innerHTML = ids
    .map((id, i) => `${i ? '<span class="sep">›</span>' : ''}<button class="crumb${i === v3.cursor ? ' on' : ''}" data-i="${i}" data-id="${id}" title="${esc(label.get(id) || '')}">${esc(shortLabel(label.get(id) || ''))}</button>`)
    .join('');
  const cur = $('.crumb.on', box);
  if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'center' });
}

function shortLabel(full) {
  const b = state.books.find((x) => full.startsWith(x.name + ' '));
  return b ? full.replace(b.name, b.abbr) : full;
}

// ===================================================================== highlights + tags
function applyHighlight(el) {
  const c = state.highlights[el.dataset.id];
  HL_COLORS.forEach((k) => el.classList.remove(`hl-${k}`));
  if (c) el.classList.add(`hl-${c}`);
}

function injectVerseTools(id) {
  const note = $('#pane-refs .note');
  if (!note || $('#pane-refs .v3tools')) return;
  const cur = state.highlights[id] || '';
  const tags = (state.tags[id] || []).join(', ');
  note.insertAdjacentHTML(
    'afterend',
    `<div class="v3tools">
      <span class="lbl">Highlight</span>
      ${HL_COLORS.map((c) => `<button class="dot hl-${c}${cur === c ? ' on' : ''}" data-hl="${c}" title="${c}"></button>`).join('')}
      <button class="dot none${cur ? '' : ' on'}" data-hl="" title="No highlight">&times;</button>
      <input class="tagin" data-id="${id}" placeholder="Tags, e.g. prayer, sermon idea" value="${esc(tags)}" title="Comma-separated tags; press Enter to save"${tags ? '' : ' hidden'} />
    </div>`
  );
}

function setHighlight(id, color) {
  if (color) state.highlights[id] = color;
  else delete state.highlights[id];
  saveUser(['highlights']);
  const el = document.getElementById(`v${id}`);
  if (el) applyHighlight(el);
  $$('#pane-refs .v3tools .dot').forEach((d) => d.classList.toggle('on', d.dataset.hl === (color || '')));
  renderMarks();
}

function setTags(id, text) {
  const tags = [...new Set(String(text).split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))];
  if (tags.length) state.tags[id] = tags;
  else delete state.tags[id];
  saveUser(['tags']);
  renderMarks();
}

// ===================================================================== commentary
// commentary is not part of the app: the verse's More menu (and right-click) opens it at Blue Letter Bible, online
const BLB_BOOKS = ['gen', 'exo', 'lev', 'num', 'deu', 'jos', 'jdg', 'rth', '1sa', '2sa', '1ki', '2ki', '1ch', '2ch', 'ezr', 'neh', 'est', 'job', 'psa',
  'pro', 'ecc', 'sng', 'isa', 'jer', 'lam', 'eze', 'dan', 'hos', 'joe', 'amo', 'oba', 'jon', 'mic', 'nah', 'hab', 'zep', 'hag', 'zec', 'mal', 'mat',
  'mar', 'luk', 'jhn', 'act', 'rom', '1co', '2co', 'gal', 'eph', 'phl', 'col', '1th', '2th', '1ti', '2ti', 'tit', 'phm', 'heb', 'jas', '1pe', '2pe',
  '1jo', '2jo', '3jo', 'jde', 'rev'];
/** The verse at Blue Letter Bible (online), where many commentaries can be read. */
function blbUrl(label) {
  const m = label ? label.match(/^(.+) (\d+):(\d+)/) : null;
  const b = m ? state.books.findIndex((x) => x.name === m[1]) + 1 : 0;
  return b ? `https://www.blueletterbible.org/kjv/${BLB_BOOKS[b - 1]}/${m[2]}/${m[3]}/` : 'https://www.blueletterbible.org/';
}

// ===================================================================== Nave's topics
async function loadVerseTopics(id, x) {
  v3.topicsVerse = await tsk.naveForVerse(id);
  v3.topicsFor = x ? x.verse.label : '';
  $('#topicCount').textContent = v3.topicsVerse.length ? `(${v3.topicsVerse.length})` : '';
  if (v3.topicView === 'list') renderTopicList();
}

function renderTopicList() {
  v3.topicView = 'list';
  const pane = $('#pane-topics');
  const found = v3.topicQuery
    ? v3.topicResults.length
      ? `<div class="topic-grid">${v3.topicResults.map(topicChip).join('')}</div>`
      : `<div class="empty">No topic matches “${esc(v3.topicQuery)}”.</div>`
    : '';
  pane.innerHTML = `
    <div class="kicker">Nave’s Topical Bible</div>
    <form class="lookup" id="topicForm"><input id="topicInput" placeholder="Find a topic, e.g. covenant, prayer, faith" value="${esc(v3.topicQuery)}" /><button>Find</button></form>
    ${found}
    <div class="section-title">${v3.topicsFor ? `Topics that cite ${esc(v3.topicsFor)}` : 'Topics for the selected verse'}</div>
    ${v3.topicsVerse.length ? `<div class="topic-grid">${v3.topicsVerse.map(topicChip).join('')}</div>` : '<div class="empty">No Nave’s topics cite this verse directly.</div>'}`;
}

function topicChip(t) {
  return `<button class="topic" data-topic="${t.id}">${esc(t.subject)}<span>${t.refs}</span></button>`;
}

async function openTopic(id) {
  v3.topic = await tsk.naveTopic(id);
  v3.topicView = 'topic';
  const t = v3.topic;
  const lines = t.lines
    .map((l) => {
      const refs = l.refs.map((r) => `<span class="ref" data-s="${r.start}" data-e="${r.end}">${esc(r.label)}</span>`).join('');
      const head = !l.refs.length;
      return `<div class="tline${head ? ' head' : ''}" style="margin-left:${Math.min(l.depth, 4) * 18}px">
        ${l.text ? `<span class="tt">${esc(l.text)}</span>` : ''}${refs ? `<span class="refs">${refs}</span>` : ''}</div>`;
    })
    .join('');
  $('#pane-topics').innerHTML = `
    <button class="backlink" data-act="topicBack">&#8592; Back to topics</button>
    <div class="kicker">Nave’s Topical Bible</div>
    <h2 class="topic-title">${esc(t.subject)}</h2>
    <div class="sub">${t.refs.toLocaleString()} references · hover to preview, click to read</div>
    <div class="tlines">${lines}</div>`;
  $('#pane-topics').scrollTop = 0;
  switchTab('topics');
}

// ===================================================================== grammar in word study
function shortGrammar(exp) {
  if (!exp) return '';
  const vals = exp
    .split(';')
    .map((p) => p.split('=')[1])
    .filter(Boolean)
    .map((v) => v.replace(/\(hence[^)]*\)/g, '').trim())
    .map((v) => ({ Third: '3rd', Second: '2nd', First: '1st' }[v] || v))
    .filter((v) => v && !/^Common$/i.test(v));
  return vals.join(' · ');
}

// 3.16: the same grammar in plain words, for anyone who has not studied Greek or Hebrew
// (Settings › Grammar shows the grammar terms instead: Aorist, Qal, Nominative …)
function plainGrammar(exp) {
  if (!exp) return '';
  const g = {};
  for (const m of exp.matchAll(/([A-Za-z][A-Za-z .]*?)\s*=\s*([^;()]+)/g)) g[m[1].trim()] = m[2].trim();
  const fn = g.Function || '';
  const who = (() => {
    const p = { First: 1, '1st': 1, '1st Person': 1, Second: 2, '2nd': 2, '2nd Person': 2, '2nd Singular': 2, Third: 3, '3rd': 3 }[g.Person];
    if (!p) return '';
    const pl = g.Number === 'Plural';
    return p === 1 ? (pl ? 'we' : 'I') : p === 2 ? (pl ? 'you (more than one)' : 'you (one person)') : pl ? 'they' : 'he, she or it';
  })();
  const parts = [];
  if (fn === 'Verb') {
    const form = g.Form || '';
    const tense = { Present: 'happening now, or going on', Imperfect: 'going on in the past', Aorist: 'an action seen as a whole (often past)', '2nd Aorist': 'an action seen as a whole (often past)', Perfect: 'done, with results that last', '2nd Perfect': 'done, with results that last', Pluperfect: 'already done in the past', '2nd Pluperfect': 'already done in the past', Future: 'will happen', '2nd Future': 'will happen' }[g.Tense];
    const hform = { Perfect: 'a completed action', Imperfect: 'an unfinished or future action', 'Consecutive Imperfect': '“and then …” — telling what happened next', 'Consecutive Perfect': '“and …” — what will follow', 'Conjunction+Imperfect': '“and …”, unfinished or future' }[form];
    const stem = { Niphal: 'done to the subject (or to itself)', Piel: 'done with intensity', Pual: 'done with intensity, to the subject', Hiphil: 'causing it to happen', Hophal: 'caused to happen', Hithpael: 'done to oneself', Hitpael: 'done to oneself', Hitpaal: 'done to oneself', Hitpeel: 'done to oneself', Hishtaphel: 'done to oneself (bowing down)', Haphel: 'causing it to happen', Aphel: 'causing it to happen', Shaphel: 'causing it to happen', Tiphil: 'causing it to happen', Peil: 'done to the subject', Hothpaal: 'done to oneself', Nithpael: 'done to oneself', Ishtaphel: 'done to oneself' }[g.Stem];
    if (form === 'Infinitive') parts.push('“to …”');
    else if (form === 'Participle') parts.push(/Passive/.test(g.Voice || '') ? 'an “-ed” word' : 'an “-ing” word');
    else if (form === 'Participle passive') parts.push('an “-ed” word');
    else if (form === 'Imperative' || /^Imperative/.test(g.Mood || '')) parts.push('a command');
    if (hform) parts.push(hform);
    if (tense) parts.push(tense);
    if (stem) parts.push(stem);
    else if (!g.Stem) {
      const v = (g.Voice || '').replace(')', '');
      if (/^Passive$/.test(v)) parts.push('done to the subject');
      else if (/^Middle$/.test(v)) parts.push('done by the subject, for itself');
      else if (/^Middle or Passive$/.test(v)) parts.push('done by or to the subject');
    }
    const mood = { Subjunctive: 'what may or should happen', Optative: 'a wish or prayer', 'Jussive)': 'a wish: “let it …”', 'Cohortative)': '“let us …” or “let me …”' }[g.Mood];
    if (mood) parts.push(mood);
    if (who) parts.push(`subject: ${who}`);
    return `Verb (an action word)${parts.length ? `: ${parts.join(' · ')}` : ''}`;
  }
  const kind = /pronoun/i.test(fn) ? 'Pronoun (stands for someone)' : fn === 'Noun' ? (g['Name type'] || g.Form === 'Proper' ? 'A name' : 'Noun (a naming word)')
    : fn === 'Adjective' ? 'Adjective (a describing word)' : fn === 'Definite article' ? '“the”' : fn === 'Adverb' ? 'Adverb (how, when or where)'
      : fn === 'Conjunction' ? 'Joining word' : fn === 'Preposition' ? 'Preposition (in, on, to, from …)' : /Particle/.test(fn) ? 'A small word (particle)' : fn === 'Interjection' ? 'An exclamation' : fn;
  const cs = { Nominative: 'the subject', Accusative: 'the object', Genitive: '“of …”', Dative: '“to”, “for” or “with …”', Vocative: 'someone spoken to' }[g.Case];
  if (cs) parts.push(cs);
  if (g.State === 'Construct') parts.push('“… of”');
  if (g.Number === 'Plural') parts.push('more than one');
  else if (g.Number === 'Dual') parts.push('two');
  if (g.Extra === 'Comparative') parts.push('“more …”');
  if (g.Extra === 'Superlative') parts.push('“most …”');
  return `${kind}${parts.length ? `: ${parts.join(' · ')}` : ''}`;
}
const grammarLine = (exp) => (state.settings.grammarTerms ? shortGrammar(exp) : plainGrammar(exp));

// Override: word list with a grammar line per word
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
        <span class="tl">${esc(w.translit)}</span>${strongChip(w.strongs)}
        ${w.grammar ? `<span class="gr" title="${esc(w.morph || '')}: ${esc(shortGrammar(w.grammar))}">${esc(grammarLine(w.grammar))}</span>` : ''}</div>`);
    }
  }
  html.push(`<div class="section-title">Webster's 1828 Dictionary</div>
    <form class="lookup" id="dictForm"><input id="dictInput" placeholder="Look up any word, e.g. conversation, prevent, charity" value="${esc(ws.dict ? ws.dict.query : '')}" /><button>Look up</button></form>
    <div id="dictOut">${ws.dict ? dictHtml(ws.dict) : '<div class="hint">KJV forms like “loveth” or “spake” are matched to their headwords.</div>'}</div>`);
  pane.innerHTML = html.join('');
}

// Override: word card with grammar line
async function showWordCard(word, rect, verseId, tokenIndex, tokenCount) {
  const card = $('#wordcard');
  const [d, words] = await Promise.all([tsk.dict(word), verseId === ws.verseId ? ws.words : tsk.words(verseId)]);
  const match = alignToken(word, words, tokenIndex, tokenCount);
  const label = verseId && state.xref && state.xref.verse.id === verseId ? state.xref.verse.label : '';
  card.innerHTML = `
    <div class="wc-head"><h4>${esc(word)}</h4><span class="hint">${esc(label)}</span><button class="x" title="Close (Esc)">&times;</button></div>
    ${match ? `<div class="wc-label">Original word (best match)</div>
      <div class="wc-strong"><span class="og">${esc(match.word)}</span><i>${esc(match.translit)}</i>${strongChip(match.strongs)}
      <span class="d"><b>${esc(match.gloss)}</b> — ${esc(match.def || '')}</span>
      ${match.grammar ? `<span class="d gr2" title="${esc(shortGrammar(match.grammar))}">${esc(grammarLine(match.grammar))}</span>` : ''}</div>` : ''}
    <div class="wc-label">Webster's 1828</div>
    ${d.headword ? `${d.headword !== word.toLowerCase() ? `<div class="hint">Entry: ${esc(d.headword.toUpperCase())}</div>` : ''}<div class="dict">${sanitize(d.html)}</div>` : `<div class="hint">No 1828 entry for “${esc(word)}”.</div>`}
    ${match && match.strongs ? `<button class="more" data-sn="${esc(match.strongs)}">Open ${esc(match.strongs)} word study</button>` : ''}`;
  card.hidden = false;
  const w = card.offsetWidth, h = card.offsetHeight;
  const left = Math.min(Math.max(12, rect.left), window.innerWidth - w - 12);
  let top = rect.bottom + 8;
  if (top + h > window.innerHeight - 12) top = Math.max(12, rect.top - h - 8);
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
  card.scrollTop = 0;
}

// ===================================================================== search (override)
function renderSearch() {
  const s = state.search;
  $('#searchCount').textContent = s.q ? `(${s.total.toLocaleString()})` : '';
  const sn = (s.strongs || []).length ? ` · Strong's ${s.strongs.join(', ')}` : '';
  $('#searchStatus').textContent = s.error
    ? s.error
    : s.q
    ? `${s.total.toLocaleString()} verse${s.total === 1 ? '' : 's'} for ${s.q.includes('"') ? s.q : `“${s.q}”`}${sn}${s.total > s.results.length ? ` — showing ${s.results.length}` : ''}`
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
    s.results
      .map((r) => {
        let t = hiliteTerms(r.text, s.q.replace(/\b[HGhg]\d{1,4}[a-z]?\b/g, ' '));
        if (r.glosses) t = hiliteGloss(r.text, r.glosses, '').replace(/<b>/g, '<b class="sg">');
        return `<div class="hit" data-id="${r.id}"><div class="lab">${esc(r.label)}${r.glosses ? `<span class="gls">${esc(r.glosses)}</span>` : ''}</div><div class="t">${t}</div></div>`;
      })
      .join('') + (s.total > s.results.length ? '<button class="more">Load more results</button>' : '');
}


function helpHtml() {
  return `<div class="help hint">
    <p><b>Search tips</b></p>
    <p><code>faith hope charity</code> — verses containing all of the words</p>
    <p><code>"living water"</code> — an exact phrase</p>
    <p><code>shepherd OR sheep</code> — either word</p>
    <p><code>grace -law</code> — leave out verses with a word</p>
    <p><code>redeem*</code> — word beginnings (redeem, redeemed, redeemer…)</p>
    <p><code>G25</code> — every verse using Greek <i>agapaō</i>; <code>H2617 mercy</code> — Hebrew <i>hesed</i> where the KJV says “mercy”</p>
    <p><code>G26 -love</code> — where <i>agapē</i> is translated some other way (e.g. “charity”)</p>
    <p>Word endings are matched loosely, so <code>love</code> also finds <i>loved</i> and <i>loveth</i>.</p>
    <p><b>Go to</b> box: <code>John 3:16</code>, <code>jn 3 16</code>, <code>1 cor 13:4-7</code>, <code>Ps 23</code>.</p>
    <p><b>Keys</b>: ↑/↓ verses · Ctrl+←/→ chapter · Alt+←/→ back/forward · Ctrl+1–7 tabs · Ctrl+P study sheet · double-click a word for its card.</p>
  </div>`;
}

// ===================================================================== notes manager (override)
async function renderMarks() {
  // Notes › Notes (verses with a note or tags) and Notes › Highlights; the other views live in study.js and walk.js
  const view = typeof v32 !== 'undefined' && v32.marksView === 'hl' ? 'hl' : 'notes';
  const noted = new Set();
  for (const k of Object.keys(state.notes)) if (state.notes[k]) noted.add(Number(k));
  for (const k of Object.keys(state.tags || {})) noted.add(Number(k));
  const lit = new Set(Object.keys(state.highlights || {}).map(Number));
  const all = new Set([...noted, ...lit]);
  $('#markCount').textContent = all.size ? `(${all.size})` : '';

  const tagCounts = {};
  for (const list of Object.values(state.tags || {})) for (const t of list) tagCounts[t] = (tagCounts[t] || 0) + 1;
  const colorCounts = {};
  for (const c of Object.values(state.highlights || {})) colorCounts[c] = (colorCounts[c] || 0) + 1;

  let list = [...(view === 'hl' ? lit : noted)].sort((a, b) => a - b);
  if (view === 'notes' && v3.markTag) list = list.filter((id) => (state.tags[id] || []).includes(v3.markTag));
  if (view === 'hl' && v3.markColor) list = list.filter((id) => state.highlights[id] === v3.markColor);
  const verses = await tsk.versesByIds(list);
  const q = v3.markQuery.trim().toLowerCase();
  const shown = q
    ? verses.filter((v) => [v.label, v.text, state.notes[v.id] || '', (state.tags[v.id] || []).join(' ')].join(' ').toLowerCase().includes(q))
    : verses;

  const pane = $('#pane-marks');
  const hadFocus = document.activeElement && document.activeElement.id === 'markSearch';
  const head = view === 'hl'
    ? (Object.keys(colorCounts).length > 1 ? `<div class="tagbar hlbar-f">${HL_COLORS.filter((c) => colorCounts[c]).map((c) => `<button class="tag hlf${v3.markColor === c ? ' on' : ''}" data-hlf="${c}" title="${c}"><i class="dot hl-${c}"></i> <span>${colorCounts[c]}</span></button>`).join('')}</div>` : '')
    : (Object.keys(tagCounts).length ? `<div class="tagbar">${Object.entries(tagCounts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([t, n]) => `<button class="tag${v3.markTag === t ? ' on' : ''}" data-tag="${esc(t)}">#${esc(t)} <span>${n}</span></button>`)
      .join('')}</div>` : '');
  const empty = view === 'hl'
    ? (lit.size ? 'Nothing matches.' : 'No highlights yet. Select a verse and pick a highlight color — highlighted verses are kept here, like bookmarks.')
    : (noted.size ? 'Nothing matches.' : 'No notes yet. Tap a verse and choose Note — or write in the box under Related verses.');
  pane.innerHTML = `${head}
    <input id="markSearch" class="marksearch" placeholder="${view === 'hl' ? 'Search your highlighted verses' : 'Search your notes and tags'}" value="${esc(v3.markQuery)}" />` +
    (shown.length
      ? shown
          .map((v) => {
            const hl = state.highlights[v.id];
            const tags = state.tags[v.id] || [];
            return `<div class="mark${hl ? ` hlbar hl-${hl}` : ''}" data-id="${v.id}"><div class="top"><span class="lab">${esc(v.label)}</span>
            ${view === 'hl' ? `<button class="del" data-unhl="${v.id}" title="Remove highlight">&times;</button>` : ''}</div>
            <div class="t">${esc(v.text)}</div>
            ${tags.length ? `<div class="mtags">${tags.map((t) => `<span>#${esc(t)}</span>`).join('')}</div>` : ''}
            ${state.notes[v.id] ? `<div class="nt">${esc(state.notes[v.id])}</div>` : ''}</div>`;
          })
          .join('')
      : `<div class="empty">${empty}</div>`);
  if (hadFocus) {
    const inp = $('#markSearch');
    inp.focus();
    inp.setSelectionRange(inp.value.length, inp.value.length);
  }
}

// ===================================================================== study sheet
async function buildSheet(id) {
  const [x, words, topics] = await Promise.all([tsk.xrefs(id), tsk.words(id), tsk.naveForVerse(id)]);
  const groups = await Promise.all(
    x.groups.map(async (g) => ({
      ...g,
      texts: await Promise.all(g.refs.map((r) => tsk.passage(r.start, Math.min(r.end, r.start + 4)))),
    }))
  );
  const note = state.notes[id];
  const tags = state.tags[id] || [];
  const date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(x.verse.label)} — Study sheet</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #1f1b16; font-size: 11pt; line-height: 1.45; }
  h1 { font-size: 20pt; font-weight: normal; margin: 0 0 4pt; }
  h2 { font-size: 12pt; text-transform: uppercase; letter-spacing: .08em; color: #1f3a6b; border-bottom: 1px solid #d6dbe6; padding-bottom: 3pt; margin: 18pt 0 8pt; font-family: 'Segoe UI', Arial, sans-serif; }
  .meta { color: #6b6155; font-size: 9pt; font-family: 'Segoe UI', Arial, sans-serif; }
  .verse { font-size: 14pt; background: #f1f4fa; padding: 10pt 12pt; border-left: 3pt solid #1f3a6b; margin: 10pt 0; }
  .note { white-space: pre-wrap; background: #fffdf9; border: 1px solid #e1dccf; padding: 8pt 10pt; }
  .tags span { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9pt; background: #e4eaf5; padding: 1pt 6pt; border-radius: 8pt; margin-right: 4pt; }
  .kw { font-weight: bold; color: #1f3a6b; margin-top: 8pt; }
  .ref { margin: 2pt 0 2pt 12pt; }
  .ref b { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9pt; color: #8a6414; }
  table { border-collapse: collapse; width: 100%; font-size: 10pt; }
  td, th { border-bottom: 1px solid #e1dccf; padding: 3pt 5pt; text-align: left; vertical-align: top; }
  th { font-family: 'Segoe UI', Arial, sans-serif; font-size: 8pt; text-transform: uppercase; color: #6b6155; }
  .og { font-size: 13pt; }
  .H { direction: rtl; }
  .topics { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9.5pt; }
  .credits { margin-top: 24pt; font-size: 7.5pt; color: #8a8072; font-family: 'Segoe UI', Arial, sans-serif; }
  h2, .kw { page-break-after: avoid; }
</style></head><body>
<h1>${esc(x.verse.label)}</h1>
<div class="meta">King James Version · Study sheet · ${esc(date)}</div>
<div class="verse">${esc(x.verse.text)}</div>
${tags.length ? `<div class="tags">${tags.map((t) => `<span>#${esc(t)}</span>`).join('')}</div>` : ''}
${note ? `<h2>My notes</h2><div class="note">${esc(note)}</div>` : ''}
<h2>Treasury of Scripture Knowledge</h2>
${groups.length ? groups
  .map((g, i) => `<div class="kw">${i + 1}. ${esc(g.anchor || '(whole verse)')}</div>${g.texts
    .map((p, j) => `<div class="ref"><b>${esc(g.refs[j].label)}</b> ${p.verses.map((v) => esc(v.text)).join(' ')}${g.refs[j].end > g.refs[j].start + 4 ? ' …' : ''}</div>`)
    .join('')}`)
  .join('') : '<p>No TSK entries for this verse.</p>'}
${words.length ? `<h2>Word study</h2><table><tr><th>English</th><th>Original</th><th>Translit.</th><th>Strong's</th><th>Grammar</th><th>Definition</th></tr>
${words.map((w) => `<tr><td>${esc(w.gloss)}</td><td class="og ${w.lang}">${esc(w.word)}</td><td><i>${esc(w.translit)}</i></td><td>${esc(w.strongs || '')}</td><td>${esc(shortGrammar(w.grammar))}</td><td>${esc(w.def || '')}</td></tr>`).join('')}</table>` : ''}
${topics.length ? `<h2>Nave's Topical Bible</h2><div class="topics">Topics that cite this verse: ${topics.map((t) => esc(t.subject)).join(' · ')}</div>` : ''}
<div class="credits">KJV (public domain). Treasury of Scripture Knowledge via CrossReferences.org (CC BY 4.0). Hebrew/Greek data: STEPBible.org, Tyndale House (CC BY 4.0).
Strong's (public domain; Open Scriptures CC BY-SA). Nave's Topical Bible (public domain; BibleData CC BY 4.0).</div>
</body></html>`;
  return { html, name: `${x.verse.label} - study sheet` };
}

async function exportSheet(print) {
  const id = state.cur.sel;
  if (!id) return toast('Select a verse first');
  toast(print ? 'Preparing to print…' : 'Building study sheet…');
  const { html, name } = await buildSheet(id);
  if (print) await tsk.printSheet(html);
  else {
    const saved = await tsk.exportSheet(html, name);
    if (saved) toast('Study sheet saved');
  }
}

// ===================================================================== events
function wireV3() {
  // trail
  $('#trailItems').addEventListener('click', (e) => {
    const c = e.target.closest('.crumb');
    if (!c) return;
    v3.skipTrail = true;
    v3.cursor = Number(c.dataset.i);
    go({ id: Number(c.dataset.id) });
  });
  $('#trailClear').addEventListener('click', () => {
    state.trail = state.cur.sel ? [state.cur.sel] : [];
    v3.cursor = state.trail.length - 1;
    saveUser(['trail']);
    renderTrail();
  });

  // highlight + tags (refs pane)
  $('#pane-refs').addEventListener('click', (e) => {
    const d = e.target.closest('.v3tools .dot');
    if (d && state.xref) setHighlight(state.xref.verse.id, d.dataset.hl);
  });
  $('#pane-refs').addEventListener('change', (e) => {
    if (e.target.classList.contains('tagin')) setTags(Number(e.target.dataset.id), e.target.value);
  });
  $('#pane-refs').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.classList.contains('tagin')) {
      e.preventDefault();
      setTags(Number(e.target.dataset.id), e.target.value);
      e.target.blur();
      toast('Tags saved');
    }
  });

  // topics
  let tq;
  $('#pane-topics').addEventListener('input', (e) => {
    if (e.target.id !== 'topicInput') return;
    clearTimeout(tq);
    tq = setTimeout(async () => {
      v3.topicQuery = e.target.value.trim();
      v3.topicResults = v3.topicQuery ? await tsk.naveSearch(v3.topicQuery) : [];
      const pos = e.target.selectionStart;
      renderTopicList();
      const inp = $('#topicInput');
      inp.focus();
      inp.setSelectionRange(pos, pos);
    }, 200);
  });
  $('#pane-topics').addEventListener('submit', async (e) => {
    if (e.target.id !== 'topicForm') return;
    e.preventDefault();
    v3.topicQuery = $('#topicInput').value.trim();
    v3.topicResults = v3.topicQuery ? await tsk.naveSearch(v3.topicQuery) : [];
    if (v3.topicResults.length === 1) return openTopic(v3.topicResults[0].id);
    renderTopicList();
  });
  $('#pane-topics').addEventListener('click', (e) => {
    const t = e.target.closest('[data-topic]');
    if (t) return openTopic(Number(t.dataset.topic));
    if (e.target.closest('[data-act="topicBack"]')) return renderTopicList();
    const r = e.target.closest('.ref');
    if (r) {
      hidePreview();
      go({ id: Number(r.dataset.s), endId: Number(r.dataset.e) }).then(() => switchTab('topics'));
    }
  });

  // notes manager extras
  $('#pane-marks').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tag]');
    if (t) {
      v3.markTag = v3.markTag === t.dataset.tag ? null : t.dataset.tag;
      renderMarks();
    }
  });
  let mq;
  $('#pane-marks').addEventListener('input', (e) => {
    if (e.target.id !== 'markSearch') return;
    clearTimeout(mq);
    mq = setTimeout(() => {
      v3.markQuery = e.target.value;
      renderMarks();
    }, 200);
  });

  // study sheet + menu
  $('#btnSheet').addEventListener('click', () => exportSheet(false));
  tsk.onMenu((cmd) => {
    if (cmd === 'exportSheet') exportSheet(false);
    else if (cmd === 'printSheet') exportSheet(true);
    else if (cmd === 'clearTrail') $('#trailClear').click();
    else if (cmd.startsWith('tab:')) switchTab(cmd.slice(4));
  });

  // re-apply highlights when the reader re-renders selection
  renderTrail();
}

wireV3();
