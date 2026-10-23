'use strict';
/* v3.3: KJV italics / words of Christ / paragraph marks, reading options (font, spacing, sepia),
   pin & compare, search-by-book chart, memory verses, Bible names, export all notes.
   Loaded after app.js, v3.js and v32.js; overrides use window.X so earlier code picks them up. */
/* global tsk, state, $, $$, esc, go, toast, switchTab, showPreview, hidePreview, saveUser, refreshMarkIcons,
   openModal, closeModal, todayStr, ws, STOP, markSelection */

const v33 = { searchBook: null, byBook: null, pinsCollapsed: false, practice: null };
const WORD_RE = /[A-Za-z]+(?:'[A-Za-z]+)*/g;
const FONTS = {
  cambria: { name: 'Cambria', stack: "'Cambria', 'Georgia', serif" },
  georgia: { name: 'Georgia', stack: "'Georgia', 'Cambria', serif" },
  palatino: { name: 'Palatino', stack: "'Palatino Linotype', 'Book Antiqua', Palatino, serif" },
  garamond: { name: 'Garamond', stack: "'Garamond', 'EB Garamond', 'Georgia', serif" },
  segoe: { name: 'Segoe UI (sans-serif)', stack: "'Segoe UI', system-ui, sans-serif" },
};
const SPACING = { compact: 1.55, normal: 1.7, relaxed: 1.95 };
const MEMO_DAYS = [1, 2, 4, 7, 14, 30, 60];
const MAX_PINS = 4;

// ===================================================================== init hooks
{
  const prevInit = window.v3Init;
  window.v3Init = (u) => {
    prevInit(u);
    state.memory = u.memory && typeof u.memory === 'object' ? u.memory : {};
    state.pins = Array.isArray(u.pins) ? u.pins : [];
    const s = state.settings;
    if (s.italics === undefined) s.italics = true;
    if (s.red === undefined) s.red = true;
    if (s.paras === undefined) s.paras = true;
    if (!FONTS[s.font]) s.font = 'cambria';
    if (!SPACING[s.spacing]) s.spacing = 'normal';
    setTimeout(renderPins, 0);
  };
  const prevOnVerse = window.v3OnVerse;
  window.v3OnVerse = (id, x) => {
    prevOnVerse(id, x);
    injectV33Buttons(id);
  };
}
state.memory = state.memory || {};
state.pins = state.pins || [];

// ===================================================================== KJV text markup
// Italic words (translators' additions), words of Christ in red, and paragraph starts. Display of
// each is controlled by body classes, so toggling an option never re-renders the text.
window.v33Text = (v) => {
  const t = v.text;
  const it = new Set(String(v.ital || '').split(',').filter(Boolean).map(Number));
  const rd = new Set(String(v.red || '').split(',').filter(Boolean).map(Number));
  if (!it.size && !rd.size) return esc(t);
  let out = '';
  let last = 0;
  let k = 0;
  let red = false;
  for (const m of t.matchAll(WORD_RE)) {
    const gap = t.slice(last, m.index);
    const isRed = rd.has(k);
    if (red && !isRed) {
      const p = gap.match(/^\S*/)[0]; // punctuation right after a red word stays red
      out += `${esc(p)}</span>${esc(gap.slice(p.length))}`;
      red = false;
    } else if (!red && isRed) {
      const lead = gap.match(/\S*$/)[0];
      out += `${esc(gap.slice(0, gap.length - lead.length))}<span class="wj">${esc(lead)}`;
      red = true;
    } else out += esc(gap);
    out += it.has(k) ? `<i class="kit">${esc(m[0])}</i>` : esc(m[0]);
    last = m.index + m[0].length;
    k++;
  }
  const tail = t.slice(last);
  if (red) {
    const p = tail.match(/^\S*/)[0];
    out += `${esc(p)}</span>${esc(tail.slice(p.length))}`;
  } else out += esc(tail);
  return out;
};

// ===================================================================== reading options
{
  const prevApply = window.applySettings;
  window.applySettings = () => {
    prevApply();
    const s = state.settings;
    const root = document.documentElement.style;
    root.setProperty('--scripture', (FONTS[s.font] || FONTS.cambria).stack);
    root.setProperty('--lh', SPACING[s.spacing] || 1.7);
    document.body.classList.toggle('no-ital', s.italics === false);
    document.body.classList.toggle('no-red', s.red === false);
    document.body.classList.toggle('show-paras', s.paras !== false);
  };
}

window.toggleTheme = () => {
  const order = ['light', 'sepia', 'dark'];
  state.settings.theme = order[(order.indexOf(state.settings.theme) + 1) % order.length];
  applySettings();
  saveUser(['settings']);
  toast(`${state.settings.theme[0].toUpperCase()}${state.settings.theme.slice(1)} theme`);
};

function openReadingOptions() {
  const s = state.settings;
  const seg = (name, opts, cur) =>
    `<div class="ro-seg">${opts.map(([v, t]) => `<button data-ro="${name}" data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${t}</button>`).join('')}</div>`;
  openModal(`<div class="kicker">Reading options</div><h2 class="m-title">How the text looks</h2>
    <div class="ro-grid">
      <label>Font</label>
      <div class="ro-fonts">${Object.entries(FONTS).map(([k, f]) => `<button data-ro="font" data-v="${k}" class="${s.font === k ? 'on' : ''}" style="font-family:${f.stack.replace(/"/g, "'")}">${esc(f.name)}</button>`).join('')}</div>
      <label>Text size</label>
      <div class="ro-size"><button data-ro="size" data-v="-1">A&#8722;</button><span>${s.fs}px</span><button data-ro="size" data-v="1">A+</button></div>
      <label>Line spacing</label>${seg('spacing', [['compact', 'Compact'], ['normal', 'Normal'], ['relaxed', 'Relaxed']], s.spacing)}
      <label>Theme</label>${seg('theme', [['light', 'Light'], ['sepia', 'Sepia'], ['dark', 'Dark']], s.theme)}
      <label>KJV features</label>
      <div class="ro-checks">
        <label><input type="checkbox" data-ro="italics" ${s.italics !== false ? 'checked' : ''}/> <span><i>Italic</i> words — added by the translators for sense</span></label>
        <label><input type="checkbox" data-ro="red" ${s.red !== false ? 'checked' : ''}/> <span>Words of Christ in <span class="wj-sample">red</span></span></label>
        <label><input type="checkbox" data-ro="paras" ${s.paras !== false ? 'checked' : ''}/> <span>¶ Paragraph marks</span></label>
      </div>
    </div>
    <div class="ro-sample"><span class="vn-s">16</span> For God so loved the world, that he gave his only begotten Son…<br><span class="vn-s">1</span> The LORD <i class="kit">is</i> my shepherd; I shall not want.</div>`, 'm-ro');
}

function applyReadingOption(el) {
  const s = state.settings;
  const k = el.dataset.ro;
  if (k === 'size') {
    s.fs = Math.min(30, Math.max(14, s.fs + Number(el.dataset.v)));
  } else if (k === 'italics' || k === 'red' || k === 'paras') s[k] = el.checked;
  else s[k] = el.dataset.v;
  applySettings();
  saveUser(['settings']);
  const y = $('.modal-card').scrollTop;
  openReadingOptions();
  $('.modal-card').scrollTop = y;
}

// ===================================================================== pin & compare
function pinRange(start, end) {
  if (state.pins.some((p) => p.start === start && p.end === end)) return toast('Already pinned');
  state.pins.push({ start, end });
  if (state.pins.length > MAX_PINS) state.pins.shift();
  v33.pinsCollapsed = false;
  saveUser(['pins']);
  renderPins();
  toast('Pinned above the text — click × to unpin');
}

function pinCurrent() {
  const sel = state.cur.sel;
  if (!sel) return toast('Select a verse first');
  const r = state.cur.range && state.cur.range[0] <= sel && state.cur.range[1] >= sel ? state.cur.range : [sel, sel];
  pinRange(r[0], r[1]);
}

async function renderPins() {
  const box = $('#pins');
  if (!state.pins.length) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  const ps = await Promise.all(state.pins.map((p) => tsk.passage(p.start, Math.min(p.end, p.start + 29))));
  box.hidden = false;
  box.classList.toggle('collapsed', v33.pinsCollapsed);
  box.innerHTML = `<div class="pins-head"><span class="pins-title">Pinned <b>${state.pins.length}</b></span>
      <span class="hint">Shift-click any reference to pin it</span>
      <span class="pins-btns"><button data-pin-act="toggle">${v33.pinsCollapsed ? 'Show' : 'Hide'}</button><button data-pin-act="clear">Clear all</button></span></div>
    <div class="pins-grid" style="--n:${state.pins.length}">${state.pins
      .map((p, i) => {
        const x = ps[i];
        const multi = x.verses.length > 1;
        return `<div class="pin"><div class="pin-top"><span class="ref" data-s="${p.start}" data-e="${p.end}">${esc(x.label)}</span><button data-unpin="${i}" title="Unpin">&times;</button></div>
          <div class="pin-text">${x.verses.map((v) => (multi ? `<sup>${v.vs}</sup>` : '') + esc(v.text)).join(' ')}${x.truncated ? ' …' : ''}</div></div>`;
      })
      .join('')}</div>`;
}

// ===================================================================== memory verses
const addDays = (n) => {
  const d = new Date(`${todayStr()}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dueIds = () => Object.entries(state.memory).filter(([, m]) => m.due <= todayStr()).map(([id]) => Number(id)).sort((a, b) => a - b);

function toggleMemory(id) {
  if (state.memory[id]) delete state.memory[id];
  else state.memory[id] = { box: 0, due: todayStr(), added: Date.now() };
  saveUser(['memory']);
  refreshMarkIcons(id);
  const b = $('[data-act="memToggle"]');
  if (b) setMemButton(b, id);
  toast(state.memory[id] ? 'Added to memory verses — practice from Notes › Memory' : 'Removed from memory verses');
  if (state.markFilter !== undefined) renderMarks();
}

function setMemButton(b, id) {
  const on = !!state.memory[id];
  b.classList.toggle('on', on);
  b.innerHTML = on ? '&#9670; Memorizing' : '&#9671; Memorize';
}

function injectV33Buttons(id) {
  const actions = $('#pane-refs .xhead .actions');
  if (!actions) return;
  if (!$('[data-act="pin"]', actions)) actions.insertAdjacentHTML('beforeend', '<button data-act="pin" title="Pin this passage above the text to compare (or Shift-click any reference)">Pin</button>');
  if (!$('[data-act="memToggle"]', actions)) {
    actions.insertAdjacentHTML('beforeend', '<button data-act="memToggle" title="Add to your memory verses for spaced practice"></button>');
  }
  setMemButton($('[data-act="memToggle"]', actions), id);
}

{
  const prevMarks = window.markIcons;
  window.markIcons = (id) => {
    let h = prevMarks(id);
    if (state.memory && state.memory[id]) {
      const i = '<i class="m-mem">&#9670;</i>';
      h = h ? h.replace(/<\/span>$/, `${i}</span>`).replace(/title="([^"]*)"/, 'title="$1 · memory verse"') : `<span class="marks gut" title="memory verse">${i}</span>`;
    }
    return h;
  };
}

window.marksSwitch = () => {
  const due = dueIds().length;
  const n = Object.keys(state.memory).length;
  const v = window.v32 ? window.v32.marksView : v32.marksView;
  return `<div class="mswitch-row"><div class="mswitch">
    <button data-mv="notes" class="${v === 'notes' ? 'on' : ''}">Notes</button>
    <button data-mv="lessons" class="${v === 'lessons' ? 'on' : ''}">Lessons <span>${state.lessons.length || ''}</span></button>
    <button data-mv="memory" class="${v === 'memory' ? 'on' : ''}">Memory <span>${due ? `${due} due` : n || ''}</span></button>
  </div><button class="linkbtn" data-act="exportNotes" title="Export all notes, highlights and tags to Word or PDF">Export…</button></div>`;
};

{
  const prevRender = window.renderMarks;
  window.renderMarks = async function () {
    if (v32.marksView === 'memory') return renderMemory();
    return prevRender();
  };
}

async function renderMemory() {
  const ids = Object.keys(state.memory).map(Number);
  const verses = await tsk.versesByIds(ids.sort((a, b) => state.memory[a].due.localeCompare(state.memory[b].due) || a - b));
  const due = dueIds();
  const fmt = (d) => (d <= todayStr() ? '<b class="due">due today</b>' : `next ${new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`);
  $('#pane-marks').innerHTML = `${marksSwitch()}
    ${ids.length ? `<div class="mem-hero"><div><b>${due.length}</b> verse${due.length === 1 ? '' : 's'} to practice today · ${ids.length} in all</div>
      <button class="primary-btn" data-act="memPractice">${due.length ? 'Practice now' : 'Practice anyway'}</button></div>` : ''}
    ${verses.length
      ? verses
          .map((v) => {
            const m = state.memory[v.id];
            return `<div class="mem-card" data-id="${v.id}"><div class="top"><span class="lab mem-go">${esc(v.label)}</span>
            <span class="mem-meta"><span class="boxes" title="Learning stage">${MEMO_DAYS.map((_, i) => `<i class="${i < m.box ? 'f' : ''}"></i>`).join('')}</span>${fmt(m.due)}</span>
            <button class="del" data-mem-rm="${v.id}" title="Remove from memory verses">&times;</button></div>
            <div class="t">${esc(v.text)}</div></div>`;
          })
          .join('')
      : '<div class="empty">No memory verses yet. Select a verse and click <b>Memorize</b> on the Refs tab.<br><br>Each verse comes back for practice at growing intervals — 1, 2, 4, 7, 14, 30 and 60 days — as you get it right.</div>'}`;
}

function startPractice(all) {
  const queue = all ? Object.keys(state.memory).map(Number) : dueIds();
  if (!queue.length) return toast('Nothing to practice');
  v33.practice = { queue, i: 0, right: 0, stage: 'ref' };
  showPracticeCard();
}

async function showPracticeCard() {
  const p = v33.practice;
  if (p.i >= p.queue.length) {
    openModal(`<div class="kicker">Memory verses</div><h2 class="m-title">Practice complete</h2>
      <p>You knew <b>${p.right}</b> of ${p.queue.length}. Verses you missed will come back tomorrow; the rest come back later as you learn them.</p>
      <div class="plan-foot"><button data-act="memDone">Done</button></div>`, 'm-mem');
    v33.practice = null;
    renderMarks();
    return;
  }
  const id = p.queue[p.i];
  const [v] = await tsk.versesByIds([id]);
  const letters = v.text.replace(WORD_RE, (w) => w[0]);
  openModal(`<div class="kicker">Memory verse ${p.i + 1} of ${p.queue.length}</div>
    <h2 class="m-title">${esc(v.label)}</h2>
    <div class="mem-body">${p.stage === 'ref' ? '<div class="hint">Say the verse from memory, then check yourself.</div>' : ''}
      ${p.stage === 'hint' ? `<div class="mem-letters">${esc(letters)}</div>` : ''}
      ${p.stage === 'reveal' ? `<div class="mem-text">${esc(v.text)}</div>` : ''}</div>
    <div class="mem-btns">${p.stage !== 'reveal'
      ? `${p.stage === 'ref' ? '<button data-act="memHint">Show first letters</button>' : ''}<button class="primary-btn" data-act="memReveal">Show the verse</button>`
      : '<button data-act="memMiss">Not yet</button><button class="primary-btn" data-act="memGot">I knew it</button>'}</div>`, 'm-mem');
}

function gradePractice(got) {
  const p = v33.practice;
  const id = p.queue[p.i];
  const m = state.memory[id];
  if (m) {
    m.box = got ? Math.min(m.box + 1, MEMO_DAYS.length) : 0;
    m.due = addDays(got ? MEMO_DAYS[Math.min(m.box, MEMO_DAYS.length) - 1] : 1);
  }
  if (got) p.right++;
  saveUser(['memory']);
  p.i++;
  p.stage = 'ref';
  showPracticeCard();
}

// ===================================================================== Bible names
const NAME_SKIP = new Set(['god', 'lord', 'on', 'so', 'amen']);
{
  const prevWords = window.renderWordsPane;
  window.renderWordsPane = function () {
    prevWords();
    appendNames();
  };
}

async function appendNames() {
  if (ws.view !== 'verse' || !state.xref || state.xref.verse.id !== ws.verseId) return;
  const id = ws.verseId;
  const toks = state.xref.verse.text.match(WORD_RE) || [];
  const caps = toks.filter((w, i) => /^[A-Z][a-z]/.test(w) && !(i === 0 && STOP.has(w.toLowerCase())) && !NAME_SKIP.has(w.toLowerCase()));
  if (!caps.length) return;
  const found = await tsk.names(caps);
  if (!found.length || ws.verseId !== id || ws.view !== 'verse') return;
  const order = caps.map((w) => w.toLowerCase().replace(/[^a-z]/g, ''));
  found.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  const at = $$('#pane-words .section-title').pop();
  if (!at || $('#pane-words .names-box')) return;
  at.insertAdjacentHTML('beforebegin', `<div class="section-title">Names in this verse</div><div class="names-box">${found
    .map((n) => `<div class="name-row"><b>${esc(n.display)}</b><span>${esc(n.meaning)}</span></div>`)
    .join('')}<div class="hint">Meanings from Hitchcock's Bible Names Dictionary.</div></div>`);
}

{
  const prevCard = window.showWordCard;
  window.showWordCard = async (word, rect, verseId, ti, tc) => {
    await prevCard(word, rect, verseId, ti, tc);
    if (!/^[A-Z][a-z]/.test(word) || NAME_SKIP.has(word.toLowerCase())) return;
    const [n] = await tsk.names([word]);
    const card = $('#wordcard');
    if (!n || card.hidden || $('.wc-name', card)) return;
    $('.wc-head', card).insertAdjacentHTML('afterend', `<div class="wc-label">Name meaning</div><div class="wc-name"><b>${esc(n.display)}</b> — ${esc(n.meaning)}</div>`);
    const r = card.getBoundingClientRect();
    if (r.bottom > window.innerHeight - 12) card.style.top = `${Math.max(12, window.innerHeight - r.height - 12)}px`;
  };
}

// ===================================================================== search by book
window.runSearch = async function (q, append = false) {
  q = (q || '').trim();
  if (!q) return;
  if (!append && q !== (state.search && state.search.q)) v33.searchBook = null;
  const scope = v33.searchBook || $('#scopeSel').value;
  const offset = append ? state.search.results.length : 0;
  const res = await tsk.search(q, 'kjv', scope, 200, offset);
  if (!append && !v33.searchBook) v33.byBook = res.byBook;
  state.search = {
    q,
    total: res.total,
    strongs: res.strongs,
    results: append ? state.search.results.concat(res.results) : res.results,
    error: res.error,
  };
  renderSearch();
  switchTab('search');
};

{
  const prevSearch = window.renderSearch;
  window.renderSearch = function () {
    prevSearch();
    const s = state.search;
    if (!s.q || s.error || !v33.byBook || !v33.byBook.length) return;
    if (v33.searchBook) $('#searchStatus').textContent += ` · in ${state.books[v33.searchBook - 1].name}`;
    const counts = new Map(v33.byBook.map((r) => [r.book, r.n]));
    const scope = $('#scopeSel').value;
    const books = state.books.filter((b) => (scope === 'OT' ? b.id <= 39 : scope === 'NT' ? b.id >= 40 : true));
    const max = Math.max(...v33.byBook.map((r) => r.n));
    const top = [...v33.byBook].sort((a, b) => b.n - a.n).slice(0, 4);
    const bars = books
      .map((b) => {
        const n = counts.get(b.id) || 0;
        const h = n ? Math.max(6, Math.round((n / max) * 100)) : 0;
        return `<button class="bc-bar${n ? '' : ' zero'}${v33.searchBook === b.id ? ' on' : ''}${b.id === 40 ? ' nt' : ''}" data-book="${b.id}" title="${esc(b.name)}: ${n} verse${n === 1 ? '' : 's'}" ${n ? '' : 'disabled'}><i style="height:${h}%"></i></button>`;
      })
      .join('');
    $('#searchResults').insertAdjacentHTML(
      'afterbegin',
      `<div class="bychart"><div class="bc-head"><span>Where it occurs · ${v33.byBook.length} book${v33.byBook.length === 1 ? '' : 's'}</span>
        ${v33.searchBook ? '<button class="linkbtn" data-bc-all>Show all books</button>' : '<span class="hint">click a bar to show one book</span>'}</div>
        <div class="bc-bars">${bars}</div>
        <div class="bc-axis"><span>${esc(books[0].abbr)}</span>${scope ? '' : '<span>Mal | Matt</span>'}<span>${esc(books[books.length - 1].abbr)}</span></div>
        <div class="bc-top">Most: ${top.map((r) => `<button class="linkbtn" data-book="${r.book}">${esc(state.books[r.book - 1].name)} ${r.n}</button>`).join(' · ')}</div></div>`
    );
  };
}

// ===================================================================== export all notes
function noteIds() {
  const ids = new Set(state.bookmarks.map((b) => b.id));
  for (const k of Object.keys(state.notes)) if (state.notes[k]) ids.add(Number(k));
  for (const k of Object.keys(state.highlights || {})) ids.add(Number(k));
  for (const k of Object.keys(state.tags || {})) ids.add(Number(k));
  return [...ids].sort((a, b) => a - b);
}

async function notesDoc() {
  const verses = await tsk.versesByIds(noteIds());
  const groups = [];
  for (const v of verses) {
    const book = v.label.replace(/ \d+:\d+$/, '');
    let g = groups[groups.length - 1];
    if (!g || g.heading !== book) groups.push((g = { heading: book, items: [] }));
    g.items.push({
      label: v.label,
      text: v.text,
      note: state.notes[v.id] || '',
      tags: state.tags[v.id] || [],
      highlight: state.highlights[v.id] || null,
      bookmark: state.bookmarks.some((b) => b.id === v.id),
    });
  }
  const date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  return {
    title: 'My Bible study notes',
    subtitle: `${verses.length} verses · exported ${date} · King James Version`,
    groups,
    footer: 'Scripture: King James Version (public domain). Made with Search the Scriptures.',
  };
}

function notesHtml(doc) {
  const HL = { yellow: '#fae79c', green: '#d2ebc2', blue: '#c4def8', pink: '#f6d0da', purple: '#e2d4f3' };
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(doc.title)}</title><style>
  body { font-family: Georgia, serif; color: #1c2333; font-size: 11pt; line-height: 1.5; }
  h1 { font-size: 21pt; font-weight: normal; color: #1f3a6b; margin: 0 0 2pt; }
  .meta, .lab, .tags, .credits { font-family: 'Segoe UI', Arial, sans-serif; }
  .meta { color: #5b6476; font-size: 9pt; margin-bottom: 12pt; }
  h2 { font-size: 13pt; color: #1f3a6b; border-bottom: 1px solid #e1dccf; padding-bottom: 2pt; margin: 16pt 0 6pt; page-break-after: avoid; }
  .item { margin: 0 0 10pt; page-break-inside: avoid; }
  .lab { font-weight: bold; color: #1f3a6b; font-size: 10pt; }
  .text { margin: 2pt 0; padding: 1pt 3pt; }
  .tags { color: #8a6414; font-size: 9pt; }
  .note { white-space: pre-wrap; border-left: 3pt solid #b8892b; padding-left: 8pt; font-family: 'Segoe UI', Arial, sans-serif; font-size: 10pt; color: #333; margin-top: 3pt; }
  .credits { margin-top: 20pt; font-size: 7.5pt; color: #8a8f99; }
</style></head><body><h1>${esc(doc.title)}</h1><div class="meta">${esc(doc.subtitle)}</div>
${doc.groups
    .map((g) => `<h2>${esc(g.heading)}</h2>${g.items
      .map((it) => `<div class="item"><div class="lab">${it.bookmark ? '★ ' : ''}${esc(it.label)}</div>
        <div class="text" style="${it.highlight ? `background:${HL[it.highlight]}` : ''}">${esc(it.text)}</div>
        ${it.tags.length ? `<div class="tags">${it.tags.map((t) => `#${esc(t)}`).join('  ')}</div>` : ''}
        ${it.note ? `<div class="note">${esc(it.note)}</div>` : ''}</div>`)
      .join('')}`)
    .join('')}
<div class="credits">${esc(doc.footer)}</div></body></html>`;
}

function openExportNotes() {
  const n = noteIds().length;
  if (!n) return toast('No notes, bookmarks, highlights or tags to export yet');
  openModal(`<div class="kicker">Export</div><h2 class="m-title">Export all notes</h2>
    <p>${n} verse${n === 1 ? '' : 's'} with your bookmarks, notes, highlights and tags, grouped by book in Bible order.</p>
    <div class="plan-list"><button class="plan-opt" data-exp="docx"><b>Word document (.docx)</b><span>Editable — opens in Word, Google Docs or LibreOffice.</span></button>
    <button class="plan-opt" data-exp="pdf"><b>PDF</b><span>Ready to print or share as-is.</span></button></div>`, 'm-exp');
}

async function exportNotes(kind) {
  closeModal();
  const doc = await notesDoc();
  if (kind === 'docx') {
    if (await tsk.exportNotesDocx(doc)) toast('Notes exported to Word');
  } else if (await tsk.exportSheet(notesHtml(doc), doc.title)) toast('Notes exported as PDF');
}

// ===================================================================== tour + quick start additions
TOUR.splice(2, 0, {
  el: '#btnRead',
  title: 'Reading options',
  text: 'Choose a font, line spacing, and a light, sepia or dark theme. The KJV’s italic words (added by the translators), words of Christ in red, and ¶ paragraph marks can each be turned on or off.',
});
{
  const refs = TOUR.find((t) => t.title === 'Cross-references');
  if (refs) refs.text = 'The Treasury of Scripture Knowledge, grouped by key word. Hover a reference to preview it, click to go, or Shift-click to pin it above the text for comparing. Below the verse: bookmark, note, highlight, tags, + Lesson, Pin and Memorize.';
  const notes = TOUR.find((t) => t.title === 'Notes and lessons');
  if (notes) {
    notes.title = 'Notes, lessons and memory';
    notes.text = 'Everything you’ve marked, filterable by tag and exportable to Word or PDF. Lessons collect verses in teaching order; Memory brings your memory verses back for practice at growing intervals.';
  }
}
{
  const prevQS = window.openQuickStart;
  window.openQuickStart = () => {
    prevQS();
    const qs = $('#modal .qs');
    if (!qs) return;
    qs.insertAdjacentHTML('afterbegin', `<section><h3>Reading</h3><ul>
      <li><b>Aa</b> (<kbd>Ctrl</kbd>+<kbd>,</kbd>) — font, spacing, light / sepia / dark, and the KJV’s <i>italic</i> words, red letters and ¶ marks.</li>
      <li><b>Pin</b> a passage (or <kbd>Shift</kbd>-click any reference) to keep it above the text while you read elsewhere — great for parallel accounts.</li>
      <li>Search results show a chart of where the word occurs; click a book’s bar to see just that book.</li>
      <li>Double-click a name for its meaning (Hitchcock’s Bible Names).</li></ul></section>`);
  };
}

// ===================================================================== events
function wireV33() {
  $('#btnRead').addEventListener('click', openReadingOptions);

  // reading options + memory practice + export (modal)
  $('#modal').addEventListener('click', (e) => {
    const ro = e.target.closest('[data-ro]');
    if (ro && ro.tagName === 'BUTTON') return applyReadingOption(ro);
    const ex = e.target.closest('[data-exp]');
    if (ex) return exportNotes(ex.dataset.exp);
    const a = e.target.closest('[data-act]');
    if (!a || !v33.practice) {
      if (a && a.dataset.act === 'memDone') closeModal();
      return;
    }
    if (a.dataset.act === 'memHint') v33.practice.stage = 'hint';
    else if (a.dataset.act === 'memReveal') v33.practice.stage = 'reveal';
    else if (a.dataset.act === 'memGot') return gradePractice(true);
    else if (a.dataset.act === 'memMiss') return gradePractice(false);
    else return;
    showPracticeCard();
  });
  $('#modal').addEventListener('change', (e) => {
    const ro = e.target.closest('input[data-ro]');
    if (ro) applyReadingOption(ro);
  });

  // Refs tab buttons
  $('#pane-refs').addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (!a || !state.xref) return;
    if (a.dataset.act === 'pin') pinCurrent();
    if (a.dataset.act === 'memToggle') toggleMemory(state.xref.verse.id);
  });

  // Shift-click any reference chip to pin it
  document.addEventListener(
    'click',
    (e) => {
      if (!e.shiftKey) return;
      const r = e.target.closest('.ref[data-s]');
      if (!r) return;
      e.preventDefault();
      e.stopPropagation();
      hidePreview();
      pinRange(Number(r.dataset.s), Number(r.dataset.e));
    },
    true
  );

  // pins panel
  $('#pins').addEventListener('click', (e) => {
    const u = e.target.closest('[data-unpin]');
    if (u) {
      state.pins.splice(Number(u.dataset.unpin), 1);
      saveUser(['pins']);
      return renderPins();
    }
    const a = e.target.closest('[data-pin-act]');
    if (a && a.dataset.pinAct === 'toggle') {
      v33.pinsCollapsed = !v33.pinsCollapsed;
      return renderPins();
    }
    if (a && a.dataset.pinAct === 'clear') {
      state.pins = [];
      saveUser(['pins']);
      return renderPins();
    }
    const r = e.target.closest('.ref');
    if (r) {
      hidePreview();
      go({ id: Number(r.dataset.s), endId: Number(r.dataset.e) });
    }
  });

  // Notes pane: memory view + export
  $('#pane-marks').addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (a && a.dataset.act === 'exportNotes') return openExportNotes();
    if (a && a.dataset.act === 'memPractice') return startPractice(!dueIds().length);
    const rm = e.target.closest('[data-mem-rm]');
    if (rm) {
      const id = Number(rm.dataset.memRm);
      delete state.memory[id];
      saveUser(['memory']);
      refreshMarkIcons(id);
      return renderMarks();
    }
    const g = e.target.closest('.mem-go');
    if (g) go({ id: Number(g.closest('.mem-card').dataset.id) }).then(() => switchTab('marks'));
  });

  // search chart: clear the book filter when the scope changes; bars filter to one book
  $('#scopeSel').addEventListener('change', () => (v33.searchBook = null));
  $('#searchResults').addEventListener('click', (e) => {
    const b = e.target.closest('[data-book]');
    if (b) {
      v33.searchBook = Number(b.dataset.book) === v33.searchBook ? null : Number(b.dataset.book);
      return runSearch(state.search.q);
    }
    if (e.target.closest('[data-bc-all]')) {
      v33.searchBook = null;
      runSearch(state.search.q);
    }
  });

  tsk.onMenu((cmd) => {
    if (cmd === 'readingOptions') openReadingOptions();
    else if (cmd === 'exportNotes') openExportNotes();
  });
}

wireV33();
