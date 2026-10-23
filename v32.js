'use strict';
/* v3.2: margin markers, focus mode, lessons, reading plans, Quick Start guide, guided tour.
   Loaded after app.js and v3.js; shares their globals. Overrides use window.X = ... so the
   earlier scripts pick them up when they call X(). */
/* global tsk, state, $, $$, esc, go, toast, switchTab, showPreview, hidePreview, saveUser, refreshMarkIcons, v3 */

const v32 = { marksView: 'notes', lessonId: null, tour: null, plansCache: null };

// ===================================================================== init hooks
{
  const prevInit = window.v3Init;
  window.v3Init = (u) => {
    prevInit(u);
    state.lessons = Array.isArray(u.lessons) ? u.lessons : [];
    state.plan = u.plan || null;
  };
  const prevOnVerse = window.v3OnVerse;
  window.v3OnVerse = (id, x) => {
    prevOnVerse(id, x);
    injectLessonButton();
  };
  const prevSetTags = window.setTags;
  window.setTags = (id, text) => {
    prevSetTags(id, text);
    refreshMarkIcons(id);
  };
}
state.lessons = state.lessons || [];

// ===================================================================== margin markers
// Bookmarks, notes and tags show as small marks in the left margin, so a chapter shows at a
// glance where you've studied. (Highlights already show as the verse's color.)
window.markIcons = (id) => {
  const parts = [];
  const tips = [];
  if (state.bookmarks.some((b) => b.id === id)) {
    parts.push('<i class="m-star">&#9733;</i>');
    tips.push('bookmarked');
  }
  if (state.notes[id]) {
    parts.push('<i class="m-note">&#9998;</i>');
    tips.push('has a note');
  }
  if (state.tags && (state.tags[id] || []).length) {
    parts.push('<i class="m-tag">#</i>');
    tips.push(`tags: ${state.tags[id].join(', ')}`);
  }
  return parts.length ? `<span class="marks gut" title="${esc(tips.join(' · '))}">${parts.join('')}</span>` : '';
};

// ===================================================================== focus mode
function setFocus(on) {
  document.body.classList.toggle('focus', on);
  $('#btnFocus').classList.toggle('on', on);
  if (on) toast('Focus mode — press Ctrl+\\ or Esc to bring the study panes back');
  if (state.cur.sel) {
    const el = document.getElementById(`v${state.cur.sel}`);
    if (el) el.scrollIntoView({ block: 'center' });
  }
}
const toggleFocus = () => setFocus(!document.body.classList.contains('focus'));

// ===================================================================== modal
function openModal(html, cls = '') {
  $('#modalBody').innerHTML = html;
  const m = $('#modal');
  m.className = `modal ${cls}`;
  m.hidden = false;
  $('.modal-card', m).scrollTop = 0;
}
const closeModal = () => ($('#modal').hidden = true);

// ===================================================================== lessons
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const lessonById = (id) => state.lessons.find((l) => l.id === id);

function saveLessons() {
  saveUser(['lessons']);
}

function createLesson(name) {
  const l = { id: newId(), name: name.trim() || 'Untitled lesson', created: Date.now(), items: [] };
  state.lessons.unshift(l);
  saveLessons();
  return l;
}

function addToLesson(lesson) {
  const sel = state.cur.sel;
  if (!sel) return toast('Select a verse first');
  const r = state.cur.range && state.cur.range[0] <= sel && state.cur.range[1] >= sel ? state.cur.range : [sel, sel];
  if (lesson.items.some((it) => it.start === r[0] && it.end === r[1])) return toast(`Already in “${lesson.name}”`);
  lesson.items.push({ start: r[0], end: r[1], note: '' });
  saveLessons();
  toast(`Added to “${lesson.name}”`);
  if (v32.marksView === 'lessons') renderMarks();
}

function injectLessonButton() {
  const actions = $('#pane-refs .xhead .actions');
  if (!actions || $('[data-act="lessonAdd"]', actions)) return;
  actions.insertAdjacentHTML('beforeend', '<button data-act="lessonAdd" title="Add this verse to a lesson or study collection">+ Lesson</button>');
}

function showLessonMenu(btn) {
  closeLessonMenu();
  const r = btn.getBoundingClientRect();
  const pop = document.createElement('div');
  pop.className = 'lpop';
  pop.innerHTML = `
    <div class="lpop-title">Add to lesson</div>
    ${state.lessons.length ? state.lessons.map((l) => `<button class="lpop-item" data-add="${l.id}">${esc(l.name)}<span>${l.items.length}</span></button>`).join('') : '<div class="hint">No lessons yet — name your first one below.</div>'}
    <form class="lpop-new"><input placeholder="New lesson name…" maxlength="80" /><button>Create</button></form>`;
  document.body.appendChild(pop);
  pop.style.left = `${Math.min(r.left, window.innerWidth - pop.offsetWidth - 12)}px`;
  pop.style.top = `${r.bottom + 6}px`;
  pop.addEventListener('click', (e) => {
    const b = e.target.closest('[data-add]');
    if (b) {
      addToLesson(lessonById(b.dataset.add));
      closeLessonMenu();
    }
  });
  pop.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('input', pop).value;
    if (!name.trim()) return;
    addToLesson(createLesson(name));
    closeLessonMenu();
  });
  setTimeout(() => $('input', pop).focus(), 0);
}
const closeLessonMenu = () => $$('.lpop').forEach((p) => p.remove());

function marksSwitch() {
  return `<div class="mswitch"><button data-mv="notes" class="${v32.marksView === 'notes' ? 'on' : ''}">Notes</button><button data-mv="lessons" class="${v32.marksView === 'lessons' ? 'on' : ''}">Lessons <span>${state.lessons.length || ''}</span></button></div>`;
}

const renderNotesList = window.renderMarks;
window.renderMarks = async function () {
  if (v32.marksView === 'lessons') return renderLessons();
  await renderNotesList();
  $('#pane-marks').insertAdjacentHTML('afterbegin', marksSwitch());
};

async function renderLessons() {
  const pane = $('#pane-marks');
  if (v32.lessonId && lessonById(v32.lessonId)) return renderLesson(lessonById(v32.lessonId));
  v32.lessonId = null;
  pane.innerHTML = `${marksSwitch()}
    <form class="lookup" id="lessonNew"><input id="lessonName" placeholder="New lesson, e.g. Sunday lesson on grace" maxlength="80" /><button>Create</button></form>
    ${state.lessons.length
      ? state.lessons
          .map((l) => `<div class="lesson-card" data-lesson="${l.id}"><div class="lc-name">${esc(l.name)}</div>
            <div class="lc-meta">${l.items.length} passage${l.items.length === 1 ? '' : 's'} · ${new Date(l.created).toLocaleDateString()}</div></div>`)
          .join('')
      : '<div class="empty">A lesson collects verses in the order you want to teach or study them, each with its own note, and exports as one PDF.<br><br>Create one above, then use <b>+ Lesson</b> on the Refs tab to add verses.</div>'}`;
}

async function renderLesson(l) {
  const passages = await Promise.all(l.items.map((it) => tsk.passage(it.start, Math.min(it.end, it.start + 11))));
  const pane = $('#pane-marks');
  pane.innerHTML = `${marksSwitch()}
    <button class="backlink" data-act="lessonBack">&#8592; All lessons</button>
    <input class="lesson-title" data-act="lessonRename" value="${esc(l.name)}" maxlength="80" title="Click to rename" />
    <div class="lesson-tools">
      <button data-act="lessonPdf">Export PDF</button><button data-act="lessonPrint">Print</button>
      <button data-act="lessonDelete" class="danger">Delete lesson</button>
    </div>
    ${l.items.length ? '' : '<div class="empty">No verses yet. Select a verse, then use <b>+ Lesson</b> on the Refs tab.</div>'}
    <ol class="lesson-items">${l.items
      .map((it, i) => {
        const p = passages[i];
        const multi = p.verses.length > 1;
        const text = p.verses.map((v) => (multi ? `<sup>${v.vs}</sup>` : '') + esc(v.text)).join(' ') + (p.truncated || it.end > it.start + 11 ? ' …' : '');
        return `<li class="lesson-item" data-i="${i}">
          <div class="li-top"><span class="ref" data-s="${it.start}" data-e="${it.end}">${esc(p.label)}</span>
            <span class="li-btns"><button data-mv-item="-1" title="Move up" ${i ? '' : 'disabled'}>&#8593;</button><button data-mv-item="1" title="Move down" ${i < l.items.length - 1 ? '' : 'disabled'}>&#8595;</button><button data-rm-item title="Remove from lesson">&times;</button></span></div>
          <div class="li-text">${text}</div>
          <textarea class="li-note" data-i="${i}" placeholder="Note for this point in the lesson…">${esc(it.note || '')}</textarea>
        </li>`;
      })
      .join('')}</ol>`;
}

async function lessonHtml(l) {
  const passages = await Promise.all(l.items.map((it) => tsk.passage(it.start, Math.min(it.end, it.start + 29))));
  const date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(l.name)}</title><style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #1c2333; font-size: 11.5pt; line-height: 1.5; }
  h1 { font-size: 20pt; font-weight: normal; margin: 0 0 2pt; color: #1f3a6b; }
  .meta { color: #5b6476; font-size: 9pt; font-family: 'Segoe UI', Arial, sans-serif; margin-bottom: 14pt; }
  ol { padding-left: 18pt; } li { margin-bottom: 14pt; page-break-inside: avoid; }
  .ref { font-family: 'Segoe UI', Arial, sans-serif; font-weight: bold; color: #1f3a6b; font-size: 10.5pt; }
  .text { margin: 3pt 0; } sup { font-size: 7pt; color: #8a6414; margin-right: 1pt; }
  .note { white-space: pre-wrap; border-left: 3pt solid #b8892b; padding: 3pt 0 3pt 8pt; color: #333; font-size: 10.5pt; }
  .credits { margin-top: 20pt; font-size: 7.5pt; color: #8a8f99; font-family: 'Segoe UI', Arial, sans-serif; }
</style></head><body>
<h1>${esc(l.name)}</h1><div class="meta">King James Version · ${l.items.length} passages · ${esc(date)}</div>
<ol>${l.items
    .map((it, i) => {
      const p = passages[i];
      const multi = p.verses.length > 1;
      return `<li><div class="ref">${esc(p.label)}</div><div class="text">${p.verses.map((v) => (multi ? `<sup>${v.vs}</sup>` : '') + esc(v.text)).join(' ')}${p.truncated ? ' …' : ''}</div>${it.note ? `<div class="note">${esc(it.note)}</div>` : ''}</li>`;
    })
    .join('')}</ol>
<div class="credits">Scripture: King James Version (public domain). Made with Search the Scriptures.</div></body></html>`;
}

// ===================================================================== reading plans
const PLANS = [
  { id: 'year', name: 'Whole Bible in a year', days: 365, books: [1, 66], blurb: 'Genesis to Revelation, about 3–4 chapters a day.' },
  { id: 'nt90', name: 'New Testament in 90 days', days: 90, books: [40, 66], blurb: 'Matthew to Revelation, about 3 chapters a day.' },
  { id: 'gospels40', name: 'Gospels and Acts in 40 days', days: 40, books: [40, 44], blurb: 'The life of Christ and the early church, about 3 chapters a day.' },
  { id: 'pspr60', name: 'Psalms and Proverbs in 60 days', days: 60, books: [19, 20], blurb: 'Worship and wisdom, about 3 chapters a day.' },
];

function planSchedule(plan) {
  const chapters = [];
  for (const b of state.books) if (b.id >= plan.books[0] && b.id <= plan.books[1]) for (let c = 1; c <= b.chapters; c++) chapters.push([b.id, c]);
  const days = [];
  for (let d = 0; d < plan.days; d++) days.push(chapters.slice(Math.round((d * chapters.length) / plan.days), Math.round(((d + 1) * chapters.length) / plan.days)));
  return days;
}

function readingLabel(chs) {
  const parts = [];
  let i = 0;
  while (i < chs.length) {
    const [b, c] = chs[i];
    let j = i;
    while (j + 1 < chs.length && chs[j + 1][0] === b && chs[j + 1][1] === chs[j][1] + 1) j++;
    const ab = state.books[b - 1].abbr;
    parts.push(j > i ? `${ab} ${c}–${chs[j][1]}` : `${ab} ${c}`);
    i = j + 1;
  }
  return parts.join('; ');
}

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dayIndex = (start) => Math.floor((new Date(`${todayStr()}T00:00:00`) - new Date(`${start}T00:00:00`)) / 86400000);

function planStatus() {
  const p = state.plan;
  if (!p) return null;
  const def = PLANS.find((x) => x.id === p.id);
  if (!def) return null;
  const days = planSchedule(def);
  const today = Math.min(Math.max(dayIndex(p.start), 0), def.days - 1);
  const done = new Set(p.done || []);
  const missed = [];
  for (let d = 0; d < today; d++) if (!done.has(d)) missed.push(d);
  return { def, days, today, done, missed, finished: done.size >= def.days };
}

function updatePlanBadge() {
  const s = planStatus();
  $('#btnPlan').classList.toggle('due', !!s && !s.finished && !s.done.has(s.today));
}

function dayRow(s, d, label) {
  const chs = s.days[d];
  return `<div class="pday${s.done.has(d) ? ' done' : ''}">
    <label class="pcheck"><input type="checkbox" data-day="${d}" ${s.done.has(d) ? 'checked' : ''}/><span>${label}</span></label>
    <div class="pchaps">${chs.map(([b, c]) => `<button class="pch" data-b="${b}" data-c="${c}">${esc(state.books[b - 1].abbr)} ${c}</button>`).join('')}</div>
  </div>`;
}

function openPlan() {
  const s = planStatus();
  if (!s) {
    openModal(`<div class="kicker">Reading plan</div><h2 class="m-title">Choose a plan</h2>
      <p class="hint">Each day's reading opens right in the app. Tick it off when you're done; you can catch up on missed days any time.</p>
      <div class="plan-list">${PLANS.map((p) => `<button class="plan-opt" data-plan="${p.id}"><b>${esc(p.name)}</b><span>${esc(p.blurb)}</span></button>`).join('')}</div>`, 'm-plan');
    return;
  }
  const pct = Math.round((s.done.size / s.def.days) * 100);
  const date = (d) => {
    const x = new Date(`${state.plan.start}T00:00:00`);
    x.setDate(x.getDate() + d);
    return x.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  };
  const upcoming = [];
  for (let d = s.today + 1; d < Math.min(s.def.days, s.today + 4); d++) upcoming.push(dayRow(s, d, `Day ${d + 1} · ${date(d)}`));
  openModal(`<div class="kicker">Reading plan</div><h2 class="m-title">${esc(s.def.name)}</h2>
    <div class="pbar"><div style="width:${pct}%"></div></div>
    <div class="hint">${s.done.size} of ${s.def.days} days read (${pct}%) · started ${new Date(`${state.plan.start}T00:00:00`).toLocaleDateString()}${s.missed.length ? ` · <b class="behind">${s.missed.length} day${s.missed.length === 1 ? '' : 's'} to catch up</b>` : ''}</div>
    ${s.finished ? '<div class="pdone">Plan complete — well done!</div>' : ''}
    <div class="section-title">Today — Day ${s.today + 1}</div>${dayRow(s, s.today, readingLabel(s.days[s.today]))}
    ${s.missed.length ? `<div class="section-title">Catch up</div>${s.missed.slice(0, 5).map((d) => dayRow(s, d, `Day ${d + 1} · ${date(d)} — ${readingLabel(s.days[d])}`)).join('')}${s.missed.length > 5 ? `<div class="hint">…and ${s.missed.length - 5} more</div>` : ''}` : ''}
    ${upcoming.length ? `<div class="section-title">Coming up</div>${upcoming.join('')}` : ''}
    <div class="plan-foot"><button data-act="planReset" class="danger">Change or restart plan</button></div>`, 'm-plan');
}

// ===================================================================== Quick Start guide
function openQuickStart() {
  openModal(`<div class="kicker">Search the Scriptures</div><h2 class="m-title">Quick start</h2>
  <div class="qs">
    <section><h3>Getting around</h3><ul>
      <li>Type a reference in the top box and press Enter: <code>John 3:16</code>, <code>jn 3 16</code>, <code>1 cor 13:4-7</code>, <code>Ps 23</code>.</li>
      <li>Click any verse to select it; <kbd>↑</kbd>/<kbd>↓</kbd> move verse by verse, <kbd>Ctrl</kbd>+<kbd>←</kbd>/<kbd>→</kbd> change chapter.</li>
      <li><kbd>Alt</kbd>+<kbd>←</kbd>/<kbd>→</kbd> go back and forward. The <b>trail</b> under the toolbar lists every verse you've studied — click one to return.</li>
      <li>Marks in the left margin show verses you've bookmarked (★), noted (✎) or tagged (#).</li></ul></section>
    <section><h3>Studying a verse</h3><ul>
      <li><b>Refs</b> — Treasury of Scripture Knowledge cross-references, grouped by key word. Hover to preview, click to go.</li>
      <li><b>Words</b> — every Hebrew/Greek word with Strong's number and grammar. Click a number for its full entry and every verse that uses it.</li>
      <li><b>Commentary</b> — Matthew Henry's Concise Commentary on the passage. <b>Topics</b> — Nave's topics that cite the verse.</li>
      <li>Double-click any word in the text for its Webster's 1828 definition and original word.</li></ul></section>
    <section><h3>Searching</h3><ul>
      <li><code>faith hope</code> all words · <code>"living water"</code> exact phrase · <code>shepherd OR sheep</code> either</li>
      <li><code>grace -law</code> leave a word out · <code>redeem*</code> word beginnings</li>
      <li><code>G25</code> every verse using Greek <i>agapaō</i> · <code>H2617 mercy</code> Hebrew <i>hesed</i> where the KJV says “mercy”</li></ul></section>
    <section><h3>Your notes</h3><ul>
      <li>On the Refs tab: bookmark, write a note, pick a highlight color, add tags, or <b>+ Lesson</b>.</li>
      <li><b>Notes</b> tab: everything you've marked, filterable by tag; switch to <b>Lessons</b> to build ordered collections you can export as PDF.</li>
      <li><b>Study sheet</b> (<kbd>Ctrl</kbd>+<kbd>P</kbd>) saves one verse with all its study material as a PDF.</li>
      <li>File › Set backup folder… keeps automatic copies of your notes (e.g. in OneDrive).</li></ul></section>
    <section><h3>Shortcuts</h3><ul class="keys">
      <li><kbd>Ctrl</kbd>+<kbd>F</kbd> / <kbd>Ctrl</kbd>+<kbd>G</kbd> top box</li><li><kbd>Ctrl</kbd>+<kbd>1</kbd>…<kbd>6</kbd> study tabs</li>
      <li><kbd>Ctrl</kbd>+<kbd>\\</kbd> focus mode</li><li><kbd>Ctrl</kbd>+<kbd>D</kbd> dark mode</li>
      <li><kbd>Ctrl</kbd>+<kbd>=</kbd>/<kbd>-</kbd> text size</li><li><kbd>F1</kbd> this guide</li></ul></section>
  </div>
  <div class="plan-foot"><button data-act="startTour">Take the guided tour</button></div>`, 'm-qs');
}

// ===================================================================== guided tour
const TOUR = [
  { title: 'Welcome to Search the Scriptures', text: 'A quick tour of the main features — about a minute. Use Next, the arrow keys, or press Esc to skip. You can replay it any time from Help › Take the tour.' },
  { el: '#reader', title: 'Read and select', text: 'Click any verse to study it. Verse numbers in navy have cross-references. Use ↑/↓ to move verse by verse. Small marks in the left margin show your bookmarks (★), notes (✎) and tags (#).' },
  { el: '#searchForm', title: 'One box for everything', text: 'Type a reference like John 3:16 to go there, or words to search: faith hope, "living water", grace -law. Strong\'s numbers work too — G25 finds every verse with Greek agapaō.' },
  { el: '#pane-refs', tab: 'refs', title: 'Cross-references', text: 'The Treasury of Scripture Knowledge, grouped by key word. Hover a reference to preview it, click to go. Below the verse: bookmark, note, highlight colors, tags, and + Lesson.' },
  { el: '#pane-words', tab: 'words', title: 'Word study', text: 'Every Hebrew or Greek word with its Strong\'s number and grammar. Click an English word to find the original behind it, or a Strong\'s number for every verse that uses it. Tip: double-click any word in the text for Webster\'s 1828 definition.' },
  { el: '#pane-comm', tab: 'comm', title: 'Commentary and topics', text: 'Matthew Henry\'s Concise Commentary on the passage, with clickable scripture references. The Topics tab lists Nave\'s topics that cite the verse, and lets you browse any topic.' },
  { el: '#trail', title: 'Your trail', text: 'Every verse you study is added here in order, so you can retrace a chain of cross-references. Click any one to go back to it.' },
  { el: '[data-tab="marks"]', tab: 'marks', title: 'Notes and lessons', text: 'All your bookmarks, notes, highlights and tags in one place, filterable by tag. Switch to Lessons to collect verses in teaching order and export them as a PDF.' },
  { el: '#btnPlan', title: 'Reading plans', text: 'Choose a plan — the whole Bible in a year, the New Testament in 90 days, and more. A gold dot means today\'s reading is waiting.' },
  { el: '#btnSheet', title: 'Study sheets', text: 'Save the selected verse with its cross-references, word study, commentary, topics and your notes as a PDF (Ctrl+P).' },
  { el: '#btnFocus', title: 'Focus mode', text: 'Hide everything but the text for plain reading (Ctrl+\\). Press it again or Esc to come back. That\'s the tour — F1 opens the Quick Start guide any time.' },
];

function startTour() {
  closeModal();
  setFocus(false);
  v32.tour = 0;
  $('#tour').hidden = false;
  showTourStep();
}

function endTour() {
  $('#tour').hidden = true;
  v32.tour = null;
  state.settings.tourDone = true;
  saveUser(['settings']);
  switchTab('refs');
}

function showTourStep() {
  const i = v32.tour;
  const step = TOUR[i];
  if (step.tab) switchTab(step.tab);
  const spot = $('#tour .tour-spot');
  const card = $('#tour .tour-card');
  card.innerHTML = `<div class="tc-step">${i + 1} / ${TOUR.length}</div><h3>${esc(step.title)}</h3><p>${esc(step.text)}</p>
    <div class="tc-btns"><button data-t="skip" class="ghost">${i === TOUR.length - 1 ? 'Close' : 'Skip tour'}</button>
    <span>${i ? '<button data-t="back">Back</button>' : ''}<button data-t="next" class="primary">${i === TOUR.length - 1 ? 'Done' : 'Next'}</button></span></div>`;
  const target = step.el && $(step.el);
  if (!target) {
    spot.style.cssText = `left:${window.innerWidth / 2}px;top:${window.innerHeight / 2}px;width:0;height:0;`;
    card.style.left = `${(window.innerWidth - card.offsetWidth) / 2}px`;
    card.style.top = `${(window.innerHeight - card.offsetHeight) / 2}px`;
    return;
  }
  const r = target.getBoundingClientRect();
  const pad = 6;
  const x = Math.max(4, r.left - pad), y = Math.max(4, r.top - pad);
  const w = Math.min(window.innerWidth - x - 4, r.width + pad * 2), h = Math.min(window.innerHeight - y - 4, r.height + pad * 2);
  spot.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;`;
  const cw = card.offsetWidth, ch = card.offsetHeight;
  // Prefer below, then above, then beside (left/right), else inside bottom
  let cx = Math.min(Math.max(12, x), window.innerWidth - cw - 12);
  let cy;
  if (y + h + 12 + ch < window.innerHeight) cy = y + h + 12;
  else if (y - 12 - ch > 0) cy = y - 12 - ch;
  else {
    cy = Math.min(Math.max(12, y + 40), window.innerHeight - ch - 12);
    if (x - 12 - cw > 0) cx = x - 12 - cw;
    else if (x + w + 12 + cw < window.innerWidth) cx = x + w + 12;
    else cy = window.innerHeight - ch - 24;
  }
  card.style.left = `${cx}px`;
  card.style.top = `${cy}px`;
}

function tourMove(d) {
  const n = v32.tour + d;
  if (n < 0) return;
  if (n >= TOUR.length) return endTour();
  v32.tour = n;
  showTourStep();
}

// ===================================================================== events
function wireV32() {
  $('#btnFocus').addEventListener('click', toggleFocus);
  $('#btnPlan').addEventListener('click', openPlan);

  // modal
  $('#modal').addEventListener('click', async (e) => {
    if (e.target.id === 'modal' || e.target.closest('.modal-x')) return closeModal();
    const p = e.target.closest('[data-plan]');
    if (p) {
      state.plan = { id: p.dataset.plan, start: todayStr(), done: [] };
      saveUser(['plan']);
      updatePlanBadge();
      return openPlan();
    }
    const ch = e.target.closest('.pch');
    if (ch) {
      closeModal();
      return go({ book: Number(ch.dataset.b), ch: Number(ch.dataset.c), vs: 1 });
    }
    const a = e.target.closest('[data-act]');
    if (a && a.dataset.act === 'planReset') {
      if (confirm('Stop this plan and choose a new one? Your progress on it will be cleared.')) {
        state.plan = null;
        saveUser(['plan']);
        updatePlanBadge();
        openPlan();
      }
    }
    if (a && a.dataset.act === 'startTour') startTour();
  });
  $('#modal').addEventListener('change', (e) => {
    const cb = e.target.closest('[data-day]');
    if (!cb || !state.plan) return;
    const d = Number(cb.dataset.day);
    const done = new Set(state.plan.done || []);
    if (cb.checked) done.add(d);
    else done.delete(d);
    state.plan.done = [...done].sort((a, b) => a - b);
    saveUser(['plan']);
    updatePlanBadge();
    const y = $('.modal-card').scrollTop;
    openPlan();
    $('.modal-card').scrollTop = y;
    if (cb.checked) toast('Reading marked complete');
  });

  // + Lesson button on the Refs tab
  $('#pane-refs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act="lessonAdd"]');
    if (b) {
      e.stopPropagation();
      showLessonMenu(b);
    }
  });
  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.lpop') && !e.target.closest('[data-act="lessonAdd"]')) closeLessonMenu();
  });

  // Notes / Lessons pane
  const pane = $('#pane-marks');
  pane.addEventListener('click', async (e) => {
    const mv = e.target.closest('[data-mv]');
    if (mv) {
      v32.marksView = mv.dataset.mv;
      return renderMarks();
    }
    const card = e.target.closest('[data-lesson]');
    if (card) {
      v32.lessonId = card.dataset.lesson;
      return renderMarks();
    }
    const l = v32.lessonId && lessonById(v32.lessonId);
    const a = e.target.closest('[data-act]');
    if (a && a.dataset.act === 'lessonBack') {
      v32.lessonId = null;
      return renderMarks();
    }
    if (!l) return;
    if (a && a.dataset.act === 'lessonDelete') {
      if (!confirm(`Delete the lesson “${l.name}”? This can't be undone.`)) return;
      state.lessons = state.lessons.filter((x) => x.id !== l.id);
      v32.lessonId = null;
      saveLessons();
      return renderMarks();
    }
    if (a && (a.dataset.act === 'lessonPdf' || a.dataset.act === 'lessonPrint')) {
      if (!l.items.length) return toast('Add some verses first');
      const html = await lessonHtml(l);
      if (a.dataset.act === 'lessonPrint') await tsk.printSheet(html);
      else if (await tsk.exportSheet(html, l.name)) toast('Lesson saved as PDF');
      return;
    }
    const item = e.target.closest('.lesson-item');
    if (!item) return;
    const i = Number(item.dataset.i);
    const m = e.target.closest('[data-mv-item]');
    if (m) {
      const j = i + Number(m.dataset.mvItem);
      if (j < 0 || j >= l.items.length) return;
      [l.items[i], l.items[j]] = [l.items[j], l.items[i]];
      saveLessons();
      return renderMarks();
    }
    if (e.target.closest('[data-rm-item]')) {
      l.items.splice(i, 1);
      saveLessons();
      return renderMarks();
    }
    const ref = e.target.closest('.ref');
    if (ref) {
      hidePreview();
      await go({ id: Number(ref.dataset.s), endId: Number(ref.dataset.e) });
      switchTab('marks');
    }
  });
  pane.addEventListener('mouseover', (e) => {
    const r = e.target.closest('.lesson-item .ref');
    if (r) showPreview(r);
  });
  pane.addEventListener('submit', (e) => {
    if (e.target.id !== 'lessonNew') return;
    e.preventDefault();
    const name = $('#lessonName').value;
    if (!name.trim()) return;
    const l = createLesson(name);
    v32.lessonId = l.id;
    renderMarks();
  });
  let lt;
  pane.addEventListener('input', (e) => {
    const l = v32.lessonId && lessonById(v32.lessonId);
    if (!l) return;
    if (e.target.classList.contains('li-note')) {
      l.items[Number(e.target.dataset.i)].note = e.target.value;
    } else if (e.target.dataset.act === 'lessonRename') {
      l.name = e.target.value.trim() || 'Untitled lesson';
    } else return;
    clearTimeout(lt);
    lt = setTimeout(saveLessons, 400);
  });

  // tour
  $('#tour').addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]');
    if (!b) return;
    if (b.dataset.t === 'next') tourMove(1);
    if (b.dataset.t === 'back') tourMove(-1);
    if (b.dataset.t === 'skip') endTour();
  });
  window.addEventListener('resize', () => v32.tour !== null && showTourStep());

  // keys: Esc closes tour/modal/focus; arrows drive the tour
  document.addEventListener(
    'keydown',
    (e) => {
      if (v32.tour !== null) {
        if (e.key === 'Escape') endTour();
        else if (e.key === 'ArrowRight' || e.key === 'Enter') tourMove(1);
        else if (e.key === 'ArrowLeft') tourMove(-1);
        else return;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.key === 'Escape') {
        if (!$('#modal').hidden) closeModal();
        else if ($$('.lpop').length) closeLessonMenu();
        else if (document.body.classList.contains('focus') && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) setFocus(false);
      }
    },
    true
  );

  tsk.onMenu((cmd) => {
    if (cmd === 'focus') toggleFocus();
    else if (cmd === 'plan') openPlan();
    else if (cmd === 'lessons') {
      v32.marksView = 'lessons';
      switchTab('marks');
      renderMarks();
    } else if (cmd === 'tour') startTour();
    else if (cmd === 'quickstart') openQuickStart();
  });

  // First launch: start the tour once the first verse has loaded
  let tries = 0;
  const waitReady = setInterval(() => {
    tries++;
    if (state.xref && state.books.length) {
      clearInterval(waitReady);
      updatePlanBadge();
      renderMarks();
      if (!state.settings.tourDone) setTimeout(startTour, 600);
    } else if (tries > 60) clearInterval(waitReady);
  }, 250);
}

wireV32();
