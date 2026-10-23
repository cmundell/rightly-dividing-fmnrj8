'use strict';
/* Web edition front end: a phone layout (one screen at a time, a bar of five buttons at the bottom),
   a Menu for the things the Windows menu bar does, and backing up notes. Loaded after every other script. */
/* global tsk, state, $, $$, esc, openModal, closeModal, switchTab, toast, openToday, openDaily, openTimeline, openPlan,
   openProgress, openPaths, openStudyChooser, openFamily, openGospel, showMarksView, openReadingOptions, toggleTheme,
   openQuickStart, openCmdk, setFocus, startTour, saveUser, openWhatsNew, TOUR, v32 */

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
    </ul>`, 'm-about');
}

// ---------------------------------------------------------------- phone tweaks
// the guided tour: on a phone, the same tour with steps for the phone's own buttons
const PHONE_TOUR = [
  { title: 'Welcome to Search the Scriptures', text: 'A quick tour of the app — about a minute. Tap Next, or Skip. You can take it again any time from Menu › Tutorial.', before: () => setView('read') },
  { el: '#readerInner .verse', title: 'Read', text: 'Tap any verse to select it. Swipe left or right on the text to go to the next or previous chapter.', before: () => setView('read') },
  { el: '#mStudyPill', title: 'Study a verse', text: 'After you tap a verse, this button appears. Tap it to study that verse.', before: () => {
    const v = $('#readerInner .verse.sel') || $('#readerInner .verse');
    const pill = $('#mStudyPill');
    pill.textContent = `Study ${v ? $('.vn', v).textContent && `${$('#bookSel').selectedOptions[0].text} ${$('#chapSel').value}:${$('.vn', v).textContent}` : 'this verse'} ›`;
    pill.hidden = false;
  } },
  { el: '.toolbar .group.nav', title: 'Choose a chapter', text: 'Pick a book and chapter here. The ‹ and › buttons also change chapters.', before: () => ($('#mStudyPill').hidden = true) },
  { el: '#searchForm', title: 'Go to a verse, or search', text: 'Type a reference like John 3:16 to go straight there, or words to search the whole Bible.' },
  { el: '#study .tabs', title: 'Study', text: 'Cross-references for the verse you selected. Slide the tabs along for Words (Hebrew and Greek), Commentary, Topics, Places and People.', before: () => { setView('study'); switchTab('refs'); } },
  { el: '#mNav [data-mn="today"]', title: 'Today', text: 'Time with God, the devotional, family devotions, discipleship paths, study methods, your prayer list and badges.', before: () => setView('read') },
  { el: '#mNav [data-mn="notes"]', title: 'Notes', text: 'Your notes, highlights, prayer list, journal and memory verses. They are kept on this phone — back them up from the Menu now and then.' },
  { el: '#mNav [data-mn="menu"]', title: 'Menu', text: 'Everything else: reading plan, timeline, text size, dark mode, backing up your notes, and this tutorial.' },
  { el: '#mNav [data-mn="read"]', title: 'Back to reading', text: 'Read always brings you back to the text. That is the tour — may the Lord bless your time in His Word.' },
];
if (isPhone()) {
  TOUR.splice(0, TOUR.length, ...PHONE_TOUR);
  const prevShow = window.showTourStep;
  window.showTourStep = function () {
    const step = TOUR[v32.tour];
    if (step && step.before) step.before();
    setTimeout(prevShow, step && step.before ? 120 : 0);
  };
  const prevEnd = window.endTour;
  window.endTour = function () {
    prevEnd();
    $('#mStudyPill').hidden = true;
    setView('read');
  };
}
MENU[4][1].unshift(['Tutorial', () => startTour()]);
// on a phone the Listen button and the reader's toolbar buttons live in the Menu
window.addEventListener('resize', () => {
  if (!isPhone()) {
    document.body.classList.remove('m-study');
    $('#mStudyPill').hidden = true;
  }
});
