'use strict';
/* Web edition front end: a phone layout (one screen at a time, a bar of five buttons at the bottom),
   a Menu for the things the Windows menu bar does, and backing up notes. Loaded after every other script. */
/* global tsk, state, $, $$, esc, openModal, closeModal, switchTab, toast, openToday, openDaily, openTimeline, openPlan,
   openProgress, openStudyChooser, openGospel, showMarksView, openReadingOptions, toggleTheme,
   openQuickStart, openCmdk, setFocus, startTour, saveUser, openWhatsNew, TOUR, v32, FEATURES */

const isPhone = () => window.matchMedia('(max-width: 760px)').matches;
document.documentElement.classList.add('web');

// ---------------------------------------------------------------- bottom bar (phones)
document.body.insertAdjacentHTML('beforeend', `<nav id="mNav" class="m-nav" aria-label="Main">
  <button data-mn="read" class="on"><span class="mi">&#128214;</span>Read</button>
  <button data-mn="study"><span class="mi">&#128269;</span>Study</button>
  ${FEATURES.today === false ? '<button data-mn="search"><span class="mi">&#128270;</span>Search</button>' : '<button data-mn="today"><span class="mi">&#9728;</span>Today</button>'}
  <button data-mn="notes"><span class="mi">&#9998;</span>Notes</button>
  <button data-mn="menu"><span class="mi">&#9776;</span>Menu</button></nav>
  <div id="mStudyPill" class="m-vbar" hidden role="toolbar" aria-label="This verse">
    <div class="vb-head"><span class="vb-ref"></span><button class="vb-guide" data-va="guide">Study it step by step ›</button><button class="vb-x" data-va="close" aria-label="Close">&times;</button></div>
    <div class="vb-hl" hidden>${HL_COLORS.map((c) => `<button class="dot hl-${c}" data-va="hl" data-c="${c}" aria-label="${c}"></button>`).join('')}<button class="dot none" data-va="hl" data-c="" aria-label="No highlight">&times;</button></div>
    <div class="vb-row">
      <button data-va="highlight"><svg class="vi" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4l5 5-9 9H6v-5z"/><path d="M4 21h16"/></svg>Highlight</button>
      <button data-va="note"><svg class="vi" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h10l4 4v12H5z"/><path d="M14 4v5h5M8 13h8M8 17h6"/></svg>Note</button>
      <button data-va="copy"><svg class="vi" viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>Copy</button>
      <button data-va="share"><svg class="vi" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M8 7l4-4 4 4"/><path d="M6 11H5v10h14V11h-1"/></svg>Share</button>
      <button data-va="memory"><svg class="vi" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>Memorize</button>
      <button data-va="study" class="vb-study"><svg class="vi" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5"/></svg>Study</button>
    </div></div>`);
// a Menu button in the toolbar too (desktop browsers have no menu bar)
if (isPhone()) $('#searchInput').placeholder = 'Go to John 3:16, or search words';
// light / sepia / dark: one button on the reading screen; each tap moves to the next
$('.toolbar .group.nav').insertAdjacentHTML('beforeend', '<button id="mTheme" class="icon m-theme" title="Light, sepia or dark" aria-label="Change theme"></button>');
const THEME_ICON = { light: '&#9728;', sepia: '&#9681;', dark: '&#9790;' };
const paintThemeBtn = () => {
  const t = (state.settings && state.settings.theme) || 'light';
  $('#mTheme').innerHTML = THEME_ICON[t] || THEME_ICON.light;
  $('#mTheme').setAttribute('aria-label', `Theme: ${t}. Tap to change`);
};
$('#mTheme').addEventListener('click', () => {
  toggleTheme();
  paintThemeBtn();
});
{
  const prevApply = window.applySettings;
  window.applySettings = function () {
    prevApply();
    paintThemeBtn();
  };
}
$('.group.right').insertAdjacentHTML('afterbegin', '<button id="btnMenu" class="icon text" title="Menu">Menu</button>');

function setView(v) {
  document.body.classList.toggle('m-study', v === 'study' || v === 'notes');
  $$('#mNav button').forEach((b) => b.classList.toggle('on', b.dataset.mn === v));
  hideVerseBar();
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
  if (k === 'search') {
    setView('study');
    switchTab('search');
    $('#searchInput').focus();
    return;
  }
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
// tapping a verse while reading brings up what you can do with it: highlight, note, copy, share, memorize, study
const vbar = $('#mStudyPill');
function paintVerseBar() {
  const x = state.xref;
  if (!x) return;
  const id = x.verse.id;
  $('.vb-ref', vbar).textContent = x.verse.label;
  const hl = state.highlights[id];
  $$('.vb-hl .dot', vbar).forEach((d) => d.classList.toggle('on', d.dataset.c === (hl || '')));
  $('[data-va="memory"]', vbar).classList.toggle('on', !!state.memory[id]);
  $('[data-va="memory"]', vbar).lastChild.textContent = state.memory[id] ? 'Memorizing' : 'Memorize';
  $('[data-va="highlight"]', vbar).classList.toggle('on', !!hl);
  $('[data-va="note"]', vbar).classList.toggle('on', !!state.notes[id]);
}
const hideVerseBar = () => {
  vbar.hidden = true;
  $('.vb-hl', vbar).hidden = true;
};
{
  const prev = window.v3OnVerse;
  let tapped = false; // the first verse is selected by itself on opening; only offer the bar after a tap
  document.addEventListener('pointerdown', () => (tapped = true), { capture: true, once: true });
  window.v3OnVerse = (id, x) => {
    if (prev) prev(id, x);
    if (!isPhone() || !tapped || document.body.classList.contains('m-study')) return;
    $('.vb-hl', vbar).hidden = true;
    paintVerseBar();
    vbar.hidden = false;
  };
  // reading on (scrolling well past the verse) puts the bar away; the app's own scroll to the verse does not
  let y0 = null;
  let shownAt = 0;
  new MutationObserver(() => {
    if (!vbar.hidden) {
      shownAt = Date.now();
      y0 = null;
    }
  }).observe(vbar, { attributes: true, attributeFilter: ['hidden'] });
  $('#reader').addEventListener('scroll', () => {
    if (vbar.hidden || Date.now() - shownAt < 900) return;
    const y = $('#reader').scrollTop;
    if (y0 === null) y0 = y;
    else if (Math.abs(y - y0) > 160) hideVerseBar();
  }, { passive: true });
}
vbar.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-va]');
  if (!b || !state.xref) return;
  const v = state.xref.verse;
  const text = `${v.label} (KJV) ${v.text}`;
  switch (b.dataset.va) {
    case 'close': return hideVerseBar();
    case 'guide':
      hideVerseBar();
      return startGuide(v.id);
    case 'highlight': $('.vb-hl', vbar).hidden = !$('.vb-hl', vbar).hidden; return;
    case 'hl':
      setHighlight(v.id, b.dataset.c);
      paintVerseBar();
      $('.vb-hl', vbar).hidden = true;
      return toast(b.dataset.c ? 'Highlighted' : 'Highlight removed');
    case 'note':
      hideVerseBar();
      setView('study');
      switchTab('refs');
      setTimeout(() => {
        const n = $('#pane-refs textarea.note');
        if (n) {
          n.scrollIntoView({ block: 'center' });
          n.focus();
        }
      }, 250);
      return;
    case 'copy':
      try {
        await navigator.clipboard.writeText(text);
        toast('Verse copied');
      } catch {
        toast('Could not copy on this device');
      }
      return;
    case 'share':
      if (navigator.share) {
        try {
          await navigator.share({ text });
        } catch { /* cancelled */ }
      } else {
        try {
          await navigator.clipboard.writeText(text);
          toast('Copied — paste it to share');
        } catch {
          toast('Sharing is not available here');
        }
      }
      return;
    case 'memory':
      toggleMemory(v.id);
      return paintVerseBar();
    case 'study':
      hideVerseBar();
      setView('study');
      switchTab(studyTab === 'marks' ? 'refs' : studyTab);
  }
});
// following a reference from the study screen goes back to the text
document.addEventListener('click', (e) => {
  if (!isPhone() || !document.body.classList.contains('m-study')) return;
  const r = e.target.closest('#study .hit, #study [data-go], #study .mark .lab, #study .mem-go');
  if (r) setTimeout(() => setView('read'), 50);
}, true);

// ---------------------------------------------------------------- Menu
const MENU = [
  ['Study', [
    ...(FEATURES.today === false ? [['Memory verses', () => showMarksView('memory')]] : []),
    ['The Gospel', () => openGospel()],
    ['Study methods', () => openStudyChooser()],
    ...(ABOUT_ON ? [['About this book', () => openBookIntro(state.cur.book)]] : []),
    ['Timeline', () => openTimeline()],
    ['Reading progress', () => openProgress()],
    ['Search everything…', () => openCmdk()],
  ]],
  ['Settings and help', [
    ['Settings', () => openReadingOptions()],
    ...(navigator.standalone === true || matchMedia('(display-mode: standalone)').matches ? [] : [['Add to Home Screen', () => openHomeScreenHelp()]]),
    ['Quick start', () => openQuickStart()],
    ["What's new", () => openWhatsNew()],
    ['About', () => openAbout()],
  ]],
];
document.body.insertAdjacentHTML('beforeend', '<input id="restoreFile" type="file" accept=".json,application/json" hidden />');
function openMenu() {
  openModal(`<div class="kicker">Rightly Dividing</div><h2 class="m-title">Menu</h2>
    ${MENU.map(([h, items], gi) => `<div class="section-title">${esc(h)}</div><div class="wm-list">${items.map(([t], i) => `<button data-wm="${gi}.${i}">${esc(t)}</button>`).join('')}</div>`).join('')}`, 'm-menu');
}
$('#modal').addEventListener('click', (e) => {
  const b = e.target.closest('[data-wm]');
  if (!b) return;
  const [g, i] = b.dataset.wm.split('.').map(Number);
  closeModal();
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
  openModal(`<div class="kicker">About</div><h2 class="m-title">Rightly Dividing</h2>
    <p>Version ${esc(tsk.version)} for iPhone and the web. The King James Bible with the Treasury of Scripture Knowledge and study tools, kept on this device and usable offline after the first visit.</p>
    <p class="hint">Your notes are kept only on this device. Use Menu › Settings › Back up my notes now and then, and keep the file somewhere safe. A backup from the Windows app (study-data.json) can be restored here too.</p>
    <p class="hint"><b>Private:</b> nothing you write or read is collected or sent anywhere. The app only goes online for its first download and its own updates, and when you open a link to another website (Blue Letter Bible, The Gospel Film).</p>
    <div class="section-title">Sources and credits</div>
    <ul class="hint ab-credits">
      <li>Bible text: King James Version (public domain). Italics and paragraph marks: farskipper/kjv; words of Christ: open-bibles KJV (public domain).</li>
      <li>Cross-references: Treasury of Scripture Knowledge (public domain), as curated by CrossReferences.org, CC BY 4.0.</li>
      <li>Hebrew and Greek words and grammar: STEPBible.org (Tyndale House, Cambridge), CC BY 4.0.</li>
      <li>Strong's dictionaries: James Strong (1894, public domain); JSON edition by Open Scriptures, CC BY-SA.</li>
      <li>Webster's American Dictionary of the English Language (1828, public domain); transcription by akaitsurugi, CC BY-SA 4.0.</li>
      <li>About this book: J. B. Tidwell, <i>The Bible Book by Book</i> (Baylor University Press, 1916, public domain), from Project Gutenberg; where he is silent, C. I. Scofield, Scofield Reference Bible notes (1917, public domain), CrossWire SWORD module Scofield.</li>
      <li>Nave's Topical Bible (public domain), and Hitchcock's Bible Names: BibleData by Brady Stephenson, CC BY 4.0.</li>
      <li>Morning and Evening: C. H. Spurgeon (1866, public domain).</li>
      <li>Parallel passages and Old Testament quotations: UBS Parallel Passage Database, © 2023 United Bible Societies, CC BY-SA 4.0.</li>
      <li>People and family links: BibleData by Brady Stephenson, CC BY 4.0.</li>
      <li>Timeline: Theographic Bible Metadata by Robert Rouse, CC BY-SA 4.0 (chronology of Floyd Nolen Jones).</li>
      <li>Bible places: OpenBible.info Bible Geocoding Data, CC BY 4.0. Base map: Natural Earth; terrain: NASA Blue Marble shaded relief (public domain).</li>
      <li>Journeys: each stop drawn from the KJV text; order of the Gospel events after A. T. Robertson's Harmony of the Gospels (1922, public domain).</li>
    </ul>`, 'm-about');
}

// ---------------------------------------------------------------- phone tweaks
// the guided tour: on a phone, the same tour with steps for the phone's own buttons
const PHONE_TOUR = [
  { title: 'Welcome to Rightly Dividing', text: 'A quick tour of the app — about a minute. Tap Next, or Skip. You can take it again any time from Menu › Tutorial.', before: () => setView('read') },
  { el: '#readerInner .verse', title: 'Read', text: 'Tap any verse to select it. Double-tap any word to see what it means, with the original Hebrew or Greek. Swipe left or right on the text to go to the next or previous chapter.', before: () => setView('read') },
  { el: '#mStudyPill', title: 'This verse', text: 'After you tap a verse, this bar appears: highlight it, write a note, copy or share it, add it to your memory verses, or Study it in depth. New to Bible study? “Study it step by step” walks you through.', before: () => {
    paintVerseBar();
    vbar.hidden = false;
  } },
  { el: '.toolbar .group.nav', title: 'Choose a chapter', text: 'Pick a book and chapter here. The ‹ and › buttons also change chapters.', before: () => (hideVerseBar()) },
  { el: '#searchForm', title: 'Go to a verse, or search', text: 'Type a reference like John 3:16 to go straight there, or words to search the whole Bible.' },
  { el: '#study .tabs', title: 'Study', text: 'Cross-references for the verse you selected, then Words (Hebrew and Greek). More holds Topics, Places, People and your search results.', before: () => { setView('study'); switchTab('refs'); } },
  FEATURES.today === false
    ? { el: '#mNav [data-mn="search"]', title: 'Search', text: 'Search the whole Bible for words or phrases, and see the results with a chart of where they occur.', before: () => setView('read') }
    : { el: '#mNav [data-mn="today"]', title: 'Today', text: `Open your Bible where you left off, the devotional, study methods, memory verses${FEATURES.prayer === false ? '' : ', your prayer list'}, the reading plan and your journal.`, before: () => setView('read') },
  { el: '#mNav [data-mn="notes"]', title: 'Notes', text: 'Your notes, highlights, prayer list, journal and memory verses. They are kept on this phone — back them up from Menu › Settings now and then.' },
  { el: '#mNav [data-mn="menu"]', title: 'Menu', text: `${FEATURES.today === false ? 'Memory verses, ' : ''}The Gospel, study methods, an introduction to each book, the timeline, and Settings — text size, theme, your name and backing up your notes. This tutorial is here too.` },
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
    hideVerseBar();
    setView('read');
  };
}
MENU[1][1].splice(1, 0, ['Tutorial', () => startTour()]);
// on a phone the reader's toolbar buttons live in the Menu
window.addEventListener('resize', () => {
  if (!isPhone()) {
    document.body.classList.remove('m-study');
    hideVerseBar();
  }
});

// ---------------------------------------------------------------- double-tap a word for its meaning (the phone's double-click)
{
  let last = null;
  const wordAt = (x, y) => {
    const r = document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : null;
    if (!r || r.startContainer.nodeType !== 3) return null;
    const node = r.startContainer, t = node.textContent;
    let a = r.startOffset, b = r.startOffset;
    while (a > 0 && /[A-Za-z']/.test(t[a - 1])) a--;
    while (b < t.length && /[A-Za-z']/.test(t[b])) b++;
    const word = t.slice(a, b).replace(/^'+|'+$/g, '');
    if (!/^[A-Za-z]/.test(word)) return null;
    const range = document.createRange();
    range.setStart(node, a);
    range.setEnd(node, b);
    return { word, node, range };
  };
  const unmark = () => $$('#readerInner .wm-word').forEach((m) => {
    const p = m.parentNode;
    m.replaceWith(...m.childNodes);
    p.normalize();
  });
  $('#readerInner').addEventListener('touchend', (e) => {
    if (!isPhone() || e.changedTouches.length !== 1) return;
    const t = e.changedTouches[0];
    const now = Date.now();
    const again = last && now - last.t < 350 && Math.hypot(t.clientX - last.x, t.clientY - last.y) < 30;
    last = again ? null : { t: now, x: t.clientX, y: t.clientY };
    if (!again) return;
    const v = e.target.closest('.verse');
    const hit = v && wordAt(t.clientX, t.clientY);
    if (!hit) return;
    e.preventDefault(); // the second tap does not also act as a tap on the verse
    const col = hit.node.parentElement.closest('.kjvcol, .bsbcol') || v;
    // which occurrence of the word in the verse was tapped (so "the" in the middle finds the right original word)
    const before = document.createRange();
    before.setStart(col, 0);
    before.setEnd(hit.range.startContainer, hit.range.startOffset);
    const toks = (s) => s.match(/[A-Za-z][A-Za-z']*/g) || [];
    const index = toks(before.toString()).length;
    const count = toks(col.textContent).length;
    unmark();
    const rect = hit.range.getBoundingClientRect();
    const mark = document.createElement('span');
    mark.className = 'wm-word';
    hit.range.surroundContents(mark);
    showWordCard(hit.word, rect, Number(v.dataset.id), index, count);
  }, { passive: false });
  // "Open … word study" goes to the Study screen, where the word study opens
  $('#wordcard').addEventListener('click', (e) => {
    if (isPhone() && e.target.closest('[data-sn]')) setView('study');
  });
  // the highlight goes when the card closes
  new MutationObserver(() => $('#wordcard').hidden && unmark()).observe($('#wordcard'), { attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('touchstart', (e) => {
    if (!$('#wordcard').hidden && !e.target.closest('#wordcard')) hideWordCard();
  }, { passive: true });
}

// ---------------------------------------------------------------- Study tabs on a phone: Related, Words, and More
{
  const MORE = [['topics', 'Topics', '#topicCount'], ['places', 'Places', '#placeCount'], ['people', 'People', null], ['search', 'Search', '#searchCount']];
  $('#study .tabs').insertAdjacentHTML('beforeend', '<div class="m-more" role="button" tabindex="0" aria-haspopup="true">More <span class="mm-car">&#9662;</span></div>');
  $('#study').insertAdjacentHTML('beforeend', '<div id="mMoreList" class="m-more-list" hidden></div>');
  const btn = $('#study .tabs .m-more');
  const list = $('#mMoreList');
  const paintMore = (name) => {
    const hit = MORE.find((m) => m[0] === name);
    btn.classList.toggle('on', !!hit);
    btn.firstChild.textContent = hit ? `${hit[1]} ` : 'More ';
  };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!list.hidden) return (list.hidden = true);
    list.innerHTML = MORE.map(([k, t, c]) => {
      const n = c && $(c) ? $(c).textContent.trim() : '';
      return `<button data-mtab="${k}">${t}${n ? ` <span class="count">${esc(n)}</span>` : ''}</button>`;
    }).join('');
    const r = btn.getBoundingClientRect();
    list.style.top = `${r.bottom + 4}px`;
    list.hidden = false;
  });
  list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mtab]');
    if (!b) return;
    list.hidden = true;
    switchTab(b.dataset.mtab);
  });
  document.addEventListener('click', (e) => {
    if (!list.hidden && !e.target.closest('#mMoreList')) list.hidden = true;
  });
  const prev = window.switchTab;
  window.switchTab = function (name) {
    prev(name);
    paintMore(name);
    list.hidden = true;
  };
}

// ---------------------------------------------------------------- the name of the app, under the bottom buttons
$('#mNav').insertAdjacentHTML('beforeend', '<div class="m-brand" aria-hidden="true">Rightly Dividing</div>');
