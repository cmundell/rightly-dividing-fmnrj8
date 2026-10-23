'use strict';
/* Web edition front end: a phone layout (one screen at a time, a bar of five buttons at the bottom),
   a Menu for the things the Windows menu bar does, and backing up notes. Loaded after every other script. */
/* global tsk, state, $, $$, esc, openModal, closeModal, switchTab, toast, openToday, openDaily, openTimeline, openPlan,
   openProgress, openPaths, openStudyChooser, openFamily, openGospel, showMarksView, openReadingOptions, toggleTheme,
   openQuickStart, openCmdk, setFocus, startTour, saveUser, openWhatsNew */

const isPhone = () => window.matchMedia('(max-width: 760px)').matches;
document.documentElement.classList.add('web');

// ---------------------------------------------------------------- bottom bar (phones)
document.body.insertAdjacentHTML('beforeend', `<nav id="mNav" class="m-nav" aria-label="Main">
  <button data-mn="read" class="on"><span class="mi">&#128214;</span>Read</button>
  <button data-mn="study"><span class="mi">&#128269;</span>Study</button>
  <button data-mn="today"><span class="mi">&#9728;</span>Today</button>
  <button data-mn="notes"><span class="mi">&#9998;</span>Notes</button>
  <button data-mn="menu"><span class="mi">&#9776;</span>Menu</button></nav>
  <button id="mStudyPill" class="m-pill" hidden></button>`);
// a Menu button in the toolbar too (desktop browsers have no menu bar)
if (isPhone()) $('#searchInput').placeholder = 'Go to John 3:16, or search words';
$('.group.right').insertAdjacentHTML('afterbegin', '<button id="btnMenu" class="icon text" title="Menu">Menu</button>');

function setView(v) {
  document.body.classList.toggle('m-study', v === 'study' || v === 'notes');
  $$('#mNav button').forEach((b) => b.classList.toggle('on', b.dataset.mn === v));
  $('#mStudyPill').hidden = true;
}
let studyTab = 'refs';
$('#mNav').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mn]');
  if (!b) return;
  const k = b.dataset.mn;
  if (k === 'read') return setView('read');
  if (k === 'study') {
    setView('study');
    return switchTab(studyTab === 'marks' ? 'refs' : studyTab);
  }
  if (k === 'notes') {
    setView('notes');
    return switchTab('marks');
  }
  if (k === 'today') return openToday();
  if (k === 'menu') return openMenu();
});
$('#btnMenu').addEventListener('click', () => openMenu());
{
  const prev = window.switchTab;
  window.switchTab = function (name) {
    prev(name);
    if (name !== 'marks') studyTab = name;
    if (isPhone() && document.body.classList.contains('m-study')) $$('#mNav button').forEach((b) => b.classList.toggle('on', b.dataset.mn === (name === 'marks' ? 'notes' : 'study')));
  };
  // a word search, or opening the prayer list or journal, shows its results on the study screen
  const prevSearch = window.runSearch;
  window.runSearch = function (...a) {
    const r = prevSearch.apply(this, a);
    if (isPhone()) setView('study');
    return r;
  };
  const prevMarks = window.showMarksView;
  window.showMarksView = function (v) {
    prevMarks(v);
    if (isPhone()) setView('notes');
  };
}
// tapping a verse while reading offers to study it, without leaving the text
{
  const prev = window.v3OnVerse;
  let t;
  let tapped = false; // the first verse is selected by itself on opening; only offer Study after a tap
  document.addEventListener('pointerdown', () => (tapped = true), { capture: true, once: true });
  window.v3OnVerse = (id, x) => {
    if (prev) prev(id, x);
    if (!isPhone() || !tapped || document.body.classList.contains('m-study')) return;
    const pill = $('#mStudyPill');
    tsk.label(id).then((l) => {
      pill.textContent = `Study ${l} ›`;
      pill.hidden = false;
      clearTimeout(t);
      t = setTimeout(() => (pill.hidden = true), 5000);
    });
  };
}
$('#mStudyPill').addEventListener('click', () => {
  setView('study');
  switchTab(studyTab === 'marks' ? 'refs' : studyTab);
});
// following a reference from the study screen goes back to the text
document.addEventListener('click', (e) => {
  if (!isPhone() || !document.body.classList.contains('m-study')) return;
  const r = e.target.closest('#study .hit, #study [data-go], #study .mark .lab, #study .mem-go');
  if (r) setTimeout(() => setView('read'), 50);
}, true);

// ---------------------------------------------------------------- Menu
const MENU = [
  ['Your walk', [
    ['Today', () => openToday()],
    ['Devotional', () => openDaily(0, null)],
    ['Family devotions', () => openFamily()],
    ['Discipleship paths', () => openPaths()],
    ['Study methods', () => openStudyChooser()],
    ['The gospel', () => openGospel()],
  ]],
  ['Reading', [
    ['Reading plan', () => openPlan()],
    ['Reading progress', () => openProgress()],
    ['Timeline', () => openTimeline()],
    ['Prayer list', () => showMarksView('prayer')],
    ['Journal', () => showMarksView('journal')],
  ]],
  ['Settings', [
    ['Reading options (text size, font)', () => openReadingOptions()],
    ['Light / sepia / dark', () => toggleTheme()],
    ['Search everything…', () => openCmdk()],
  ]],
  ['Your notes', [
    ['Back up my notes', () => tsk.backup().then(() => toast('Saved. Keep the file somewhere safe.'))],
    ['Restore notes from a backup…', () => $('#restoreFile').click()],
  ]],
  ['Help', [
    ['Quick start', () => openQuickStart()],
    ["What's new", () => openWhatsNew()],
    ['About', () => openAbout()],
  ]],
];
document.body.insertAdjacentHTML('beforeend', '<input id="restoreFile" type="file" accept=".json,application/json" hidden />');
function openMenu() {
  openModal(`<div class="kicker">Search the Scriptures</div><h2 class="m-title">Menu</h2>
    ${MENU.map(([h, items], gi) => `<div class="section-title">${esc(h)}</div><div class="wm-list">${items.map(([t], i) => `<button data-wm="${gi}.${i}">${esc(t)}</button>`).join('')}</div>`).join('')}`, 'm-menu');
}
$('#modal').addEventListener('click', (e) => {
  const b = e.target.closest('[data-wm]');
  if (!b) return;
  const [g, i] = b.dataset.wm.split('.').map(Number);
  closeModal();
  if (isPhone() && g === 1 && i >= 3) setView('notes');
  MENU[g][1][i][1]();
});
$('#restoreFile').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const n = await tsk.restore(await f.text());
    toast(`Restored ${n} kinds of notes. Reloading…`);
    setTimeout(() => location.reload(), 1200);
  } catch (err) {
    toast(`Could not restore: ${err.message}`);
  }
});
function openAbout() {
  openModal(`<div class="kicker">About</div><h2 class="m-title">Search the Scriptures</h2>
    <p>Version ${esc(tsk.version)} for the web. The King James Bible with the Treasury of Scripture Knowledge and study tools, kept on this device and usable offline after the first visit.</p>
    <p class="hint">Your notes are kept only on this device. Use Menu › Back up my notes now and then, and keep the file somewhere safe. A backup from the Windows app (study-data.json) can be restored here too.</p>
    <p class="hint">Reading aloud and reminders are in the Windows app only.</p>
    <div class="section-title">Sources and credits</div>
    <ul class="hint">
      <li>King James Version; Treasury of Scripture Knowledge; Strong's; Webster's 1828; Nave's Topical Bible; Matthew Henry's Concise Commentary; Hitchcock's Bible Names; C. H. Spurgeon, Morning and Evening — public domain.</li>
      <li>Hebrew and Greek words: STEPBible (Tyndale House, Cambridge), CC BY 4.0.</li>
      <li>Bible places: OpenBible.info, CC BY 4.0. Base map: Natural Earth; terrain: NASA Blue Marble — public domain.</li>
      <li>People and family links: BibleData by Brady Stephenson, CC BY 4.0.</li>
      <li>Parallel passages and quotations: UBS Parallel Passage Database, © 2023 United Bible Societies, CC BY-SA 4.0.</li>
      <li>Timeline: Theographic Bible Metadata by Robert Rouse, CC BY-SA 4.0.</li>
      <li>Section headings: Berean Standard Bible, public domain (not part of the KJV text).</li>
    </ul>`, 'm-about');
}

// ---------------------------------------------------------------- phone tweaks
// the guided tour points at desktop buttons; on a phone show the quick start instead
if (isPhone()) {
  window.startTour = () => {
    state.settings.tourDone = true;
    saveUser(['settings']);
    openModal(`<div class="kicker">Welcome</div><h2 class="m-title">Search the Scriptures</h2>
      <p class="wk-lead">The King James Bible with the Treasury of Scripture Knowledge and study tools — on your phone, and working offline.</p>
      <ul class="wl-list">
        <li><b>Read</b> — the Bible. Choose a book and chapter at the top, or type a reference or words in the search box.</li>
        <li>Tap a verse, then <b>Study</b> — cross-references, Hebrew and Greek words, commentary, topics, places and people.</li>
        <li><b>Today</b> — time with God, the devotional, family devotions, discipleship paths, prayer and more.</li>
        <li><b>Notes</b> — your notes, prayer list, journal and memory verses. They stay on this phone; back them up from the Menu now and then.</li>
        <li><b>Menu</b> — everything else, including text size and dark mode.</li>
      </ul>
      <div class="plan-foot"><button class="primary-btn" data-wm-close="1">Start reading</button></div>`, 'm-welcome');
  };
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-wm-close]')) closeModal();
  });
}
// on a phone the Listen button and the reader's toolbar buttons live in the Menu
window.addEventListener('resize', () => {
  if (!isPhone()) {
    document.body.classList.remove('m-study');
    $('#mStudyPill').hidden = true;
  }
});
