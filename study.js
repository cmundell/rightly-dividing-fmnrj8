'use strict';
/* Study tools: margin marks, focus mode, lessons, reading plans, the guided tour and Quick Start, reading options, pin and compare, search by book, memory verses, Bible names, exporting notes.
   Merged in 3.15 from the per-release layers (v32.js, v33.js), kept in their original order: later
   sections still extend earlier ones by wrapping window.X. */

// =====================================================================================================
// from v32.js
// =====================================================================================================
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
// Notes and tags show as small marks in the left margin, so a chapter shows at a glance where you've
// studied. (Highlights show as the verse's color; since 3.15 they also do the work of bookmarks.)
window.markIcons = (id) => {
  const parts = [];
  const tips = [];
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
  // in the verse's More menu
  const menu = $('#pane-refs .xhead .va-menu') || $('#pane-refs .xhead .actions');
  if (!menu || $('[data-act="lessonAdd"]', menu)) return;
  menu.insertAdjacentHTML('beforeend', '<button data-act="lessonAdd" title="Add this verse to a lesson or study collection">Add to a lesson…</button>');
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
      : '<div class="empty">A lesson collects verses in the order you want to teach or study them, each with its own note, and exports as one PDF.<br><br>Create one above, then select a verse and choose <b>More › Add to a lesson</b> below it.</div>'}`;
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
    ${l.items.length ? '' : '<div class="empty">No verses yet. Select a verse, then choose <b>More › Add to a lesson</b> below it.</div>'}
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
<div class="credits">Scripture: King James Version (public domain). Made with The Bible Study App.</div></body></html>`;
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
const dblClick = () => (typeof isPhone === 'function' && isPhone() ? 'Double-tap' : 'Double-click'); // a phone has no double-click
function openQuickStart() {
  openModal(`<div class="kicker">The Bible Study App</div><h2 class="m-title">Quick start</h2>
  <div class="qs">
    <section><h3>Getting around</h3><ul>
      <li>Type a reference in the top box and press Enter: <code>John 3:16</code>, <code>jn 3 16</code>, <code>1 cor 13:4-7</code>, <code>Ps 23</code>.</li>
      <li>Click any verse to select it; <kbd>↑</kbd>/<kbd>↓</kbd> move verse by verse, <kbd>Ctrl</kbd>+<kbd>←</kbd>/<kbd>→</kbd> change chapter.</li>
      <li><kbd>Alt</kbd>+<kbd>←</kbd>/<kbd>→</kbd> go back and forward. The <b>trail</b> under the toolbar lists every verse you've studied — click one to return.</li>
      <li>Highlighted verses keep their color; marks in the left margin show verses you've noted (✎) or tagged (#).</li></ul></section>
    <section><h3>Studying a verse</h3><ul>
      <li>New to Bible study? Select a verse and choose <b>Study this verse, step by step</b>: read it, related verses, one word up close${FEATURES.commentary ? ', what a trusted teacher said' : ''}, and what God is saying to you.</li>
      <li><b>Related verses</b> — the Treasury of Scripture Knowledge cross-references, grouped by key word. Hover to preview, click to go.</li>
      <li><b>Original words</b> — every Hebrew/Greek word with Strong's number and grammar. Click a number for its full entry and every verse that uses it.</li>
      <li>${FEATURES.commentary ? "<b>Commentary</b> — Matthew Henry's Concise Commentary on the passage." : '<b>Commentary</b> — opens the verse at Blue Letter Bible (online) if you want to read commentaries.'} <b>Topics</b> — Nave's topics that cite the verse.</li>
      <li>${dblClick()} any word in the text for its Webster's 1828 definition and the original word.</li>
${ABOUT_ON ? '      <li><b>About this book</b>, under each chapter heading: the writer, the date, the theme and the divisions of the book, from C. I. Scofield (1917).</li>' : ''}</ul></section>
    <section><h3>Searching</h3><ul>
      <li><code>faith hope</code> all words · <code>"living water"</code> exact phrase · <code>shepherd OR sheep</code> either</li>
      <li><code>grace -law</code> leave a word out · <code>redeem*</code> word beginnings</li>
      <li><code>G25</code> every verse using Greek <i>agapaō</i> · <code>H2617 mercy</code> Hebrew <i>hesed</i> where the KJV says “mercy”</li></ul></section>
    <section><h3>Your notes</h3><ul>
      <li>On the Related verses tab: write a note, pick a highlight color, <b>Memorize</b> it, or open <b>More</b> for tags, <b>Add to lesson</b>, <b>Pin</b> and copying the references.</li>
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
  { title: 'Welcome to The Bible Study App', text: 'A quick tour of the main features — about a minute. Use Next, the arrow keys, or press Esc to skip. You can replay it any time from Help › Take the tour.' },
  { el: '#reader', title: 'Read and select', text: 'Click any verse to study it. Verse numbers in navy have cross-references. Use ↑/↓ to move verse by verse. Highlighted verses keep their color; small marks in the left margin show your notes (✎) and tags (#).' },
  ABOUT_ON && { el: '#readerInner .bi-link', title: 'About this book', text: 'Under every chapter heading: the writer, the date, the theme and the divisions of the book, from C. I. Scofield\'s introductions (1917).' },
  { el: '#searchForm', title: 'One box for everything', text: 'Type a reference like John 3:16 to go there, or words to search: faith hope, "living water", grace -law. Strong\'s numbers work too — G25 finds every verse with Greek agapaō.' },
  { el: '#pane-refs', tab: 'refs', title: 'Related verses', text: 'New to Bible study? Choose “Study this verse, step by step” at the top. Related verses: other verses that speak about the same thing — the Treasury of Scripture Knowledge, grouped by key word. Hover a reference to preview it, click to go. Below the verse: copy it, memorize it, write a note and pick a highlight color; More has tags, lessons and pins.' },
  { el: '#pane-words', tab: 'words', title: 'Original words', text: 'Every Hebrew or Greek word with its Strong\'s number and grammar. Click an English word to find the original behind it, or a Strong\'s number for every verse that uses it. Tip: double-click any word in the text for Webster\'s 1828 definition.' },
  { el: '#pane-comm', tab: 'comm', title: 'Commentary and topics', text: (FEATURES.commentary ? 'Matthew Henry\'s Concise Commentary on the passage, with clickable scripture references.' : 'This app keeps to the Bible itself; the Commentary tab opens the verse at Blue Letter Bible (online) if you want to read commentaries.') + ' The Topics tab lists Nave\'s topics that cite the verse, and lets you browse any topic.' },
  { el: '#trail', title: 'Your trail', text: 'Every verse you study is added here in order, so you can retrace a chain of cross-references. Click any one to go back to it.' },
  { el: '[data-tab="marks"]', tab: 'marks', title: 'Notes and lessons', text: 'Your notes (filter by tag), highlights, memory verses, prayer list and journal. Lessons collect verses in teaching order and export them as a PDF.' },
  { el: '#btnPlan', title: 'Reading plans', text: 'Choose a plan — the whole Bible in a year, the New Testament in 90 days, and more. A gold dot means today\'s reading is waiting.' },
  { el: '#btnSheet', title: 'Study sheets', text: 'Save the selected verse with its cross-references, word study, topics and your notes as a PDF (Ctrl+P).' },
  { el: '#btnFocus', title: 'Focus mode', text: 'Hide everything but the text for plain reading (Ctrl+\\). Press it again or Esc to come back. That\'s the tour — F1 opens the Quick Start guide any time.' },
];
for (let i = TOUR.length - 1; i >= 0; i--) if (!TOUR[i]) TOUR.splice(i, 1); // steps for features that are switched off

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

// =====================================================================================================
// from v33.js
// =====================================================================================================
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
  const ui = Number(s.uiScale) || 1;
  // Settings: the text, you (your name and the start screen), and your notes (backups)
  openModal(`<div class="kicker">The Bible Study App</div><h2 class="m-title">Settings</h2>
    <div class="section-title st-first">The text</div>
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
      <label>Grammar</label><div class="ro-seg"><button data-gt="0" class="${s.grammarTerms ? '' : 'on'}">Plain words</button><button data-gt="1" class="${s.grammarTerms ? 'on' : ''}">Grammar terms</button></div>
      <label>Interface size</label><div class="ro-seg">${UI_STEPS.map((v) => `<button data-ui="${v}" class="${Math.abs(v - ui) < 0.01 ? 'on' : ''}">${Math.round(v * 100)}%</button>`).join('')}</div>
      <label>Contrast</label><div class="ro-seg"><button data-hc="off" class="${s.contrast === 'on' ? '' : 'on'}">Standard</button><button data-hc="on" class="${s.contrast === 'on' ? 'on' : ''}">High contrast</button></div>
    </div>
    <div class="ro-sample"><span class="vn-s">16</span> For God so loved the world, that he gave his only begotten Son…<br><span class="vn-s">1</span> The LORD <i class="kit">is</i> my shepherd; I shall not want.</div>
    <div class="section-title">You</div>
    <div class="ro-grid st-grid">
      <label for="stName">Your name</label>
      <div class="st-name"><input id="stName" type="text" maxlength="40" autocomplete="given-name" placeholder="For the daily greeting" value="${esc(s.name || '')}" /></div>
      ${FEATURES.today === false ? '' : `<label>Start screen</label>
      <div class="ro-checks"><label><input type="checkbox" data-ro4="startToday" ${s.startToday !== false ? 'checked' : ''}/> <span>Start with Today the first time you open the app each day</span></label></div>`}
    </div>
    <div class="section-title">Your notes</div><div class="st-notes" id="stNotes"></div>`, 'm-ro');
  if (typeof paintNotesSection === 'function') paintNotesSection();
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
  renderMarks();
}

function setMemButton(b, id) {
  const on = !!state.memory[id];
  b.classList.toggle('on', on);
  b.innerHTML = on ? '&#9670; Memorizing' : '&#9671; Memorize';
}

function injectV33Buttons(id) {
  const actions = $('#pane-refs .xhead .actions');
  if (!actions) return;
  const menu = $('.va-menu', actions) || actions;
  if (!$('[data-act="pin"]', actions)) menu.insertAdjacentHTML('beforeend', '<button data-act="pin" title="Pin this passage above the text to compare (or Shift-click any reference)">Pin above the text</button>');
  if (!$('[data-act="memToggle"]', actions)) {
    const more = $('[data-act="vaMore"]', actions);
    if (more) more.insertAdjacentHTML('beforebegin', '<button data-act="memToggle" title="Add to your memory verses for spaced practice"></button>');
    else actions.insertAdjacentHTML('beforeend', '<button data-act="memToggle" title="Add to your memory verses for spaced practice"></button>');
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
  const nNotes = Object.values(state.notes).filter(Boolean).length;
  const nHl = Object.keys(state.highlights || {}).length;
  const open = (state.prayers || []).filter((p) => !p.answered).length;
  const jn = (state.journal || []).length;
  const b = (k, t, c) => `<button data-mv="${k}" class="${v === k ? 'on' : ''}">${t}${c ? ` <span>${c}</span>` : ''}</button>`;
  // the groups of the Notes screen; Lessons and Export sit quietly at the side
  return `<div class="mswitch-row"><div class="mswitch">
    ${b('notes', 'Notes', nNotes)}${b('hl', 'Highlights', nHl)}${b('memory', 'Memory', due ? `${due} due` : n)}${FEATURES.prayer === false ? '' : b('prayer', 'Prayer', open)}${b('journal', 'Journal', jn)}
  </div><div class="mswitch-side"><button class="linkbtn${v === 'lessons' ? ' on' : ''}" data-mv="lessons" title="Lessons: verses collected in teaching order, exported as one PDF">Lessons${state.lessons.length ? ` (${state.lessons.length})` : ''}</button><button class="linkbtn" data-act="exportNotes" title="Export all notes, highlights and tags to Word or PDF">Export…</button></div></div>`;
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
      : '<div class="empty">No memory verses yet. Select a verse and choose <b>Memorize</b>.<br><br>Each verse comes back for practice at growing intervals — 1, 2, 4, 7, 14, 30 and 60 days — as you get it right.</div>'}`;
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
    footer: 'Scripture: King James Version (public domain). Made with The Bible Study App.',
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
  if (!n) return toast('No notes, highlights or tags to export yet');
  openModal(`<div class="kicker">Export</div><h2 class="m-title">Export all notes</h2>
    <p>${n} verse${n === 1 ? '' : 's'} with your notes, highlights and tags, grouped by book in Bible order.</p>
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
  title: 'Settings',
  text: 'Aa opens Settings: the font, text size, spacing and a light, sepia or dark theme; the KJV’s italic words, red letters and ¶ marks; your name; the start screen; and backing up your notes.',
});
{
  const refs = TOUR.find((t) => t.title === 'Related verses');
  if (refs) refs.text = 'New to Bible study? Choose “Study this verse, step by step” at the top. Related verses: other verses that speak about the same thing — the Treasury of Scripture Knowledge, grouped by key word. Hover a reference to preview it, click to go, or Shift-click to pin it above the text for comparing. Below the verse: copy it, memorize it, write a note and pick a highlight color; More has tags, lessons and pins.';
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
      <li><b>Aa</b> (<kbd>Ctrl</kbd>+<kbd>,</kbd>) — Settings: font, size, spacing, light / sepia / dark, the KJV’s <i>italic</i> words, red letters and ¶ marks, your name, the start screen and backups.</li>
      <li><b>Pin</b> a passage (or <kbd>Shift</kbd>-click any reference) to keep it above the text while you read elsewhere — great for parallel accounts.</li>
      <li>Search results show a chart of where the word occurs; click a book’s bar to see just that book.</li>
      <li>${dblClick()} a name for its meaning (Hitchcock’s Bible Names).</li></ul></section>`);
  };
}

// ===================================================================== events
function wireV33() {
  $('#btnRead').addEventListener('click', () => openReadingOptions());

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
