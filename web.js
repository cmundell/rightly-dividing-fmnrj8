'use strict';
/* Web edition front end: a phone layout (one screen at a time, a bar of five buttons at the bottom),
   a Menu for the things the Windows menu bar does, and backing up notes. Loaded after every other script. */
/* global tsk, state, go, dataTr, multi, clearMulti, highlightSelected, markSelection, hlName, $, $$, esc, openModal, closeModal, switchTab, toast, openToday, openDaily, openTimeline, openPlan,
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
    <div class="vb-share" hidden><button data-va="shareText">Share the words</button><button data-va="shareImage">Share as a picture</button><button data-va="copy">Copy</button></div>
    <div class="vb-hl" hidden>${HL_COLORS.map((c) => `<button class="dot hl-${c}" data-va="hl" data-c="${c}" aria-label="${c}"><span class="dot-n"></span></button>`).join('')}<button class="dot none" data-va="hl" data-c="" aria-label="No highlight">&times;</button></div>
    <div class="vb-row">
      <button data-va="highlight"><svg class="vi" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4l5 5-9 9H6v-5z"/><path d="M4 21h16"/></svg>Highlight</button>
      <button data-va="note"><svg class="vi" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h10l4 4v12H5z"/><path d="M14 4v5h5M8 13h8M8 17h6"/></svg>Note</button>
      <button data-va="share"><svg class="vi" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M8 7l4-4 4 4"/><path d="M6 11H5v10h14V11h-1"/></svg>Share</button>
      <button data-va="memory"><svg class="vi" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>Memorize</button>
      <button data-va="study" class="vb-study"><svg class="vi" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5"/></svg>Study</button>
    </div></div>`);
// ---------------------------------------------------------------- one-row header on a phone
// "John 3 ▾" opens a book-and-chapter picker; the magnifier shows the search box. Swiping changes chapters.
$('.toolbar .group.nav').insertAdjacentHTML('afterbegin', '<button id="mRef" class="m-ref" aria-haspopup="dialog"><span class="m-ref-t">Bible</span> <span class="m-ref-car">&#9662;</span></button>');
$('.toolbar .group.nav').insertAdjacentHTML('beforeend', '<button id="mSearchBtn" class="m-search-btn" aria-label="Search, or go to a verse" title="Search, or go to a verse"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>');
function paintRef() {
  const b = state.books && state.books[(state.cur.book || 1) - 1];
  if (b) $('#mRef .m-ref-t').textContent = `${b.id === 19 ? 'Psalm' : b.name}${b.chapters > 1 ? ` ${state.cur.ch}` : ''}`;
}
{
  const prevFill = window.fillChapters;
  window.fillChapters = function () {
    prevFill();
    paintRef();
  };
  setTimeout(paintRef, 1200);
}
let pickBook = null;
function openPicker(book) {
  pickBook = book || null;
  if (!pickBook) {
    const grid = (t) => `<div class="pk-grid">${state.books.filter((b) => b.testament === t).map((b) => `<button data-pk-book="${b.id}" class="${b.id === state.cur.book ? 'on' : ''}" title="${esc(b.name)}">${esc(b.abbr)}</button>`).join('')}</div>`;
    openModal(`<div class="kicker">Choose a book</div>
      <div class="section-title st-first">Old Testament</div>${grid('OT')}
      <div class="section-title">New Testament</div>${grid('NT')}`, 'm-pick');
    const on = $('#modal .pk-grid .on');
    if (on) on.scrollIntoView({ block: 'center' });
    return;
  }
  const b = state.books[pickBook - 1];
  openModal(`<button class="backlink" data-pk-books="1">&#8592; All books</button><div class="kicker">Choose a chapter</div><h2 class="m-title">${esc(b.name)}</h2>
    <div class="pk-grid pk-ch">${Array.from({ length: b.chapters }, (_, i) => `<button data-pk-ch="${i + 1}" class="${pickBook === state.cur.book && i + 1 === state.cur.ch ? 'on' : ''}">${i + 1}</button>`).join('')}</div>`, 'm-pick');
}
$('#mRef').addEventListener('click', () => openPicker(null));
$('#modal').addEventListener('click', (e) => {
  const bk = e.target.closest('[data-pk-book]');
  if (bk) {
    const b = state.books[Number(bk.dataset.pkBook) - 1];
    if (b.chapters === 1) { closeModal(); setView('read'); return go({ book: b.id, ch: 1 }); }
    return openPicker(b.id);
  }
  if (e.target.closest('[data-pk-books]')) return openPicker(null);
  const ch = e.target.closest('[data-pk-ch]');
  if (ch) {
    closeModal();
    setView('read');
    go({ book: pickBook, ch: Number(ch.dataset.pkCh) });
  }
});
$('#mSearchBtn').addEventListener('click', () => {
  const on = document.body.classList.toggle('m-search');
  if (on) { $('#searchInput').focus(); } else $('#searchInput').blur();
});
// the box closes itself once a search or reference has been entered, or when it loses focus while empty
$('#searchForm').addEventListener('submit', () => isPhone() && setTimeout(() => { $('#searchInput').blur(); document.body.classList.remove('m-search'); }, 300));
$('#searchInput').addEventListener('blur', () => { if (isPhone() && !$('#searchInput').value.trim()) setTimeout(() => document.body.classList.remove('m-search'), 150); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isPhone()) document.body.classList.remove('m-search'); });

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
  document.body.classList.toggle('m-notes', v === 'notes');
  $$('#mNav button').forEach((b) => b.classList.toggle('on', b.dataset.mn === v));
  hideVerseBar();
  navSchedule();
}
let studyTab = 'refs';

// ---------------------------------------------------------------- Back: one step back to where you were
// Every change of screen (Read, Study, Notes), tab or window is remembered; Back returns to the last one, scroll
// position and all. The phone's own back swipe does the same. Windows has Alt+← for the trail instead.
const nav = { stack: [], cur: null, restoring: false, timer: null };
const navSnapshot = () => {
  const m = $('#modal');
  const study = document.body.classList.contains('m-study');
  return {
    view: !study ? 'read' : state.tab === 'marks' ? 'notes' : 'study',
    tab: state.tab,
    modal: m.hidden ? null : { html: $('#modalBody').innerHTML, cls: m.className, title: ($('.m-title', m) || {}).textContent || '' },
    reader: $('#reader').scrollTop,
    pane: (document.querySelector('#study .pane:not([hidden])') || {}).scrollTop || 0,
  };
};
const navSame = (a, b) => a && b && a.view === b.view && (a.view === 'read' || a.tab === b.tab) && !!a.modal === !!b.modal
  && (!a.modal || (a.modal.cls === b.modal.cls && a.modal.title === b.modal.title));
const navWhere = (s) => (s.modal ? s.modal.title || 'back' : s.view === 'read' ? 'Reading' : s.view === 'notes' ? 'Notes' : 'Study');
function navPaint() {
  const bar = $('#mBack');
  const top = nav.stack[nav.stack.length - 1];
  const modalOpen = !$('#modal').hidden;
  bar.hidden = !isPhone() || !top || modalOpen || !$('#mStudyPill').hidden;
  if (top) $('span', bar).textContent = `Back to ${navWhere(top)}`;
  const mb = $('#modal .modal-back');
  if (mb) mb.hidden = !isPhone() || !top;
}
function navSchedule() {
  if (nav.restoring || !isPhone()) return;
  clearTimeout(nav.timer);
  // a short wait, so that closing one window and opening the next counts as one step
  nav.timer = setTimeout(() => {
    if (v32.tour != null || !state.settings.tourDone) { nav.cur = null; return; } // the tour moves about on its own
    if (!$('#modal').hidden && $('#modal').classList.contains('m-pick')) return; // choosing a chapter is not a place to go back to
    const now = navSnapshot();
    if (nav.cur && !navSame(nav.cur, now)) {
      nav.stack.push(nav.cur);
      if (nav.stack.length > 30) nav.stack.shift();
      try { history.pushState({ rd: nav.stack.length }, ''); } catch { /* not allowed here */ }
    }
    nav.cur = now;
    navPaint();
  }, 220);
}
function navBack() {
  const s = nav.stack.pop();
  if (!s) return;
  nav.restoring = true;
  const m = $('#modal');
  if (s.modal) {
    $('#modalBody').innerHTML = s.modal.html;
    m.className = s.modal.cls;
    m.hidden = false;
  } else m.hidden = true;
  setView(s.view);
  if (s.view !== 'read' && state.tab !== s.tab) switchTab(s.tab);
  $('#reader').scrollTop = s.reader;
  const pane = document.querySelector('#study .pane:not([hidden])');
  if (pane) pane.scrollTop = s.pane;
  setTimeout(() => {
    nav.restoring = false;
    nav.cur = navSnapshot();
    navPaint();
  }, 30);
}
document.body.insertAdjacentHTML('beforeend', '<button id="mBack" class="m-back" hidden>&#8249; <span>Back</span></button>');
$('#modal .modal-card').insertAdjacentHTML('afterbegin', '<button class="modal-back" hidden aria-label="Back">&#8249; Back</button>');
$('#mBack').addEventListener('click', () => (history.state && history.state.rd ? history.back() : navBack()));
$('#modal .modal-back').addEventListener('click', () => (history.state && history.state.rd ? history.back() : navBack()));
window.addEventListener('popstate', () => { if (nav.stack.length) navBack(); });
new MutationObserver(navSchedule).observe($('#modal'), { attributes: true, attributeFilter: ['hidden', 'class'] });
new MutationObserver(navSchedule).observe($('#modalBody'), { childList: true });
new MutationObserver(() => navPaint()).observe($('#mStudyPill'), { attributes: true, attributeFilter: ['hidden'] });
$('#reader').addEventListener('scroll', () => { if (nav.cur && !nav.restoring) nav.cur.reader = $('#reader').scrollTop; }, { passive: true });
$('#study').addEventListener('scroll', (e) => { if (nav.cur && !nav.restoring && e.target.classList && e.target.classList.contains('pane')) nav.cur.pane = e.target.scrollTop; }, { capture: true, passive: true });
setTimeout(() => { nav.cur = navSnapshot(); }, 1500);
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
    navSchedule();
    if (name !== 'marks') studyTab = name;
    if (isPhone() && document.body.classList.contains('m-study')) $$('#mNav button').forEach((b) => b.classList.toggle('on', b.dataset.mn === (name === 'marks' ? 'notes' : 'study')));
  };
  // a word search, or opening the prayer list or journal, shows its results on the study screen
  const prevSearch = window.runSearch;
  window.runSearch = function (...a) {
    const r = prevSearch.apply(this, a);
    $('#study .tabs').classList.add('has-search'); // the Search tab appears once there is a search
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
  // several verses tapped: "Psalm 23:1–3" when they run together, otherwise how many
  const n = multi.ids.size;
  let label = x.verse.label;
  if (n > 1 && state.chapter) {
    const vs = state.chapter.verses.filter((v) => multi.ids.has(v.id)).map((v) => v.vs);
    const runs = vs[vs.length - 1] - vs[0] === vs.length - 1;
    label = runs ? `${state.chapter.name} ${state.chapter.ch}:${vs[0]}–${vs[vs.length - 1]}` : `${n} verses`;
  }
  vbar.classList.toggle('vb-multi', n > 1);
  $('.vb-ref', vbar).textContent = label;
  const hl = state.highlights[id];
  $$('.vb-hl .dot', vbar).forEach((d) => d.classList.toggle('on', d.dataset.c === (hl || '')));
  $('[data-va="memory"]', vbar).classList.toggle('on', memItemFor(id) !== null);
  $('[data-va="memory"]', vbar).lastChild.textContent = memItemFor(id) !== null ? 'Memorizing' : 'Memorize';
  $('[data-va="highlight"]', vbar).classList.toggle('on', !!hl);
  $$('.vb-hl .dot[data-c]:not([data-c=""])', vbar).forEach((d) => { const nm = hlName(d.dataset.c); d.setAttribute('aria-label', nm); $('.dot-n', d).textContent = nm === d.dataset.c ? '' : nm; });
  $('[data-va="note"]', vbar).classList.toggle('on', !!state.notes[id]);
}
const hideVerseBar = () => {
  if (multi.mode) clearMulti();
  vbar.hidden = true;
  $('.vb-hl', vbar).hidden = true;
  $('.vb-share', vbar).hidden = true;
};
// the verse, or every verse tapped, as one passage: {label, text}
function selectedPassage(v) {
  if (multi.ids.size > 1 && state.chapter) {
    const vs = state.chapter.verses.filter((x) => multi.ids.has(x.id));
    const run = vs[vs.length - 1].vs - vs[0].vs === vs.length - 1;
    const label = run ? `${state.chapter.name} ${state.chapter.ch}:${vs[0].vs}-${vs[vs.length - 1].vs}` : vs.map((x) => `${state.chapter.name} ${state.chapter.ch}:${x.vs}`).join('; ');
    return { label, text: vs.map((x) => x.text).join(' ') };
  }
  return { label: v.label, text: v.text };
}
// a verse card to share as a picture: the words on navy, the reference in gold
async function shareVerseImage({ label, text }) {
  const W = 1080, H = 1080, PAD = 96;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  // the same softened photo as the icon and the opening screen; plain navy if it cannot be loaded
  const bg = await new Promise((resolve) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = () => resolve(null); im.src = 'data/brand-bg.jpg'; });
  if (bg) g.drawImage(bg, 0, 0, W, H);
  else { g.fillStyle = '#1f3a6b'; g.fillRect(0, 0, W, H); }
  g.fillStyle = '#e0be6e'; g.fillRect(PAD, PAD, 120, 6);
  g.shadowColor = 'rgba(20,16,10,.6)'; g.shadowBlur = 8; g.shadowOffsetY = 3;
  const words = text.split(/\s+/);
  let size = text.length > 520 ? 38 : text.length > 360 ? 44 : text.length > 220 ? 52 : text.length > 120 ? 60 : 72;
  let lines;
  for (;;) { // shrink until the words fit the card
    g.font = `${size}px Georgia, 'Times New Roman', serif`;
    lines = [];
    let line = '';
    for (const w of words) {
      const t = line ? `${line} ${w}` : w;
      if (g.measureText(t).width > W - PAD * 2 && line) { lines.push(line); line = w; } else line = t;
    }
    lines.push(line);
    if (lines.length * size * 1.4 <= H - PAD * 2 - 200 || size <= 24) break;
    size -= 2;
  }
  const lh = size * 1.4;
  let y = (H - lines.length * lh) / 2 + size * 0.35;
  g.fillStyle = '#faf4e6'; g.textBaseline = 'alphabetic';
  for (const ln of lines) { g.fillText(ln, PAD, y); y += lh; }
  g.fillStyle = '#e0be6e'; g.font = `600 ${Math.max(30, size * 0.55)}px -apple-system, 'Segoe UI', Arial, sans-serif`;
  g.fillText(`${label} (KJV)`, PAD, Math.min(H - PAD - 60, y + 10));
  g.fillStyle = 'rgba(250,244,230,.7)'; g.font = `28px -apple-system, 'Segoe UI', Arial, sans-serif`;
  g.fillText('RIGHTLY DIVIDING', PAD, H - PAD + 10);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const file = new File([blob], `${label.replace(/[^A-Za-z0-9]+/g, '-')}.png`, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); } catch { /* cancelled */ }
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = file.name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  toast('Picture saved');
}
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
    // while the bar is up, every tap adds a verse (tap one again to drop it); closing the bar starts afresh
    multi.mode = true;
    if (!multi.ids.size) multi.ids.add(id);
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
    if (vbar.hidden || multi.ids.size > 1 || Date.now() - shownAt < 900) return;
    const y = $('#reader').scrollTop;
    if (y0 === null) y0 = y;
    else if (Math.abs(y - y0) > 160) hideVerseBar();
  }, { passive: true });
}
vbar.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-va]');
  if (!b || !state.xref) return;
  const v = state.xref.verse;
  const sel = selectedPassage(v);
  const text = `${sel.label} (KJV) ${sel.text}`;
  switch (b.dataset.va) {
    case 'close':
      if (multi.ids.size) clearMulti();
      return hideVerseBar();
    case 'guide':
      hideVerseBar();
      return startGuide(v.id);
    case 'highlight': $('.vb-hl', vbar).hidden = !$('.vb-hl', vbar).hidden; return;
    case 'hl': {
      const n = highlightSelected(v.id, b.dataset.c);
      paintVerseBar();
      $('.vb-hl', vbar).hidden = true;
      return toast(b.dataset.c ? (n > 1 ? `${n} verses highlighted` : 'Highlighted') : (n > 1 ? `Highlight removed from ${n} verses` : 'Highlight removed'));
    }
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
      $('.vb-share', vbar).hidden = true;
      try {
        await navigator.clipboard.writeText(text);
        toast('Verse copied');
      } catch {
        toast('Could not copy on this device');
      }
      return;
    case 'share': $('.vb-share', vbar).hidden = !$('.vb-share', vbar).hidden; return;
    case 'shareImage':
      $('.vb-share', vbar).hidden = true;
      return shareVerseImage(sel);
    case 'shareText':
      $('.vb-share', vbar).hidden = true;
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
      if (vbar.hidden) return;
      return paintVerseBar();
    case 'study':
      hideVerseBar();
      setView('study');
      switchTab(studyTab === 'marks' ? 'refs' : studyTab);
  }
});
document.addEventListener('multisel', () => !vbar.hidden && paintVerseBar());
document.addEventListener('deselect', () => hideVerseBar());
// a passage chosen in Compare opens on the reading screen
document.addEventListener('click', (e) => {
  if (isPhone() && e.target.closest('#modal.m-cmp [data-dvgo]')) setTimeout(() => setView('read'), 50);
}, true);
// following a reference from the study screen goes back to the text
document.addEventListener('click', (e) => {
  if (!isPhone() || !document.body.classList.contains('m-study')) return;
  const r = e.target.closest('#study .hit, #study [data-go], #study .mark .lab, #study .mem-go');
  if (r) setTimeout(() => setView('read'), 50);
}, true);

// ---------------------------------------------------------------- following references on the study screen (Topics)
// Topics: tapping a reference opens its words right there, with a way to read it in the Bible
document.addEventListener('click', async (e) => {
  if (!isPhone()) return;
  const go1 = e.target.closest('#pane-topics .t-go');
  const r = e.target.closest('#pane-topics .ref');
  if (!go1 && !r) return;
  e.stopPropagation();
  if (go1 || r.closest('.refrow')) {
    const el = go1 || r;
    await go({ id: Number(el.dataset.s), endId: Number(el.dataset.e) });
    switchTab('topics');
    return setView('read');
  }
  const line = r.closest('.tline');
  const open = line.querySelector('.t-open');
  const same = open && open.dataset.s === r.dataset.s;
  if (open) open.remove();
  $$('#pane-topics .ref.on').forEach((x) => x.classList.remove('on'));
  if (same) return;
  r.classList.add('on');
  const p = await tsk.passage(Number(r.dataset.s), Number(r.dataset.e), dataTr());
  const multi = p.verses.length > 1;
  line.insertAdjacentHTML('beforeend', `<div class="refrow t-open" data-s="${r.dataset.s}"><b>${esc(p.label)}</b> ${p.verses.map((v) => (multi ? `<sup>${v.vs}</sup>` : '') + esc(v.text)).join(' ')}${p.truncated ? ' …' : ''}
    <button class="t-go" data-s="${r.dataset.s}" data-e="${r.dataset.e}">Read it in the Bible &#8250;</button></div>`);
}, true);

// ---------------------------------------------------------------- Menu
const MENU = [
  // kept short on purpose: everything here is one tap deep, and the rest lives on Today
  ['Study', [
    ...(FEATURES.today === false ? [['Memory verses', () => showMarksView('memory')]] : []),
    ['The Gospel', () => openGospel()],
    ['Compare passages', () => openCompare()],
    ...(ABOUT_ON ? [['About this book', () => openBookIntro(state.cur.book)]] : []),
    ['Study methods', () => openStudyChooser()],
    ['Journal', () => showMarksView('journal')],
    ['Timeline', () => openTimeline()],
  ]],
  ['Settings and help', [
    ['Settings', () => openReadingOptions()],
    ...(navigator.standalone === true || matchMedia('(display-mode: standalone)').matches ? [] : [['Add to Home Screen', () => openHomeScreenHelp()]]),
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
      <li>Icon, opening screen and shared-verse background: photo by Yulia Gapeenko on Vecteezy (Free License).</li>
      <li>Bible places: OpenBible.info Bible Geocoding Data, CC BY 4.0. Base map: Natural Earth; terrain: NASA Blue Marble shaded relief (public domain).</li>
      <li>Journeys: each stop drawn from the KJV text; order of the Gospel events after A. T. Robertson's Harmony of the Gospels (1922, public domain).</li>
    </ul>`, 'm-about');
}

// ---------------------------------------------------------------- phone tweaks
// the guided tour: on a phone, the same tour with steps for the phone's own buttons
const PHONE_TOUR = [
  { title: 'Welcome to Rightly Dividing', text: 'A quick tour of the app — about a minute. Tap Next, or Skip. You can take it again any time from Menu › Tutorial.', before: () => setView('read') },
  { el: '#readerInner .verse', title: 'Read', text: 'Tap any verse to select it. Double-tap any word to see what it means, with the original Hebrew or Greek. Swipe left or right on the text to go to the next or previous chapter.', before: () => setView('read') },
  { el: '#mStudyPill', title: 'This verse', text: 'After you tap a verse, this bar appears: highlight it, write a note, share or copy it, add it to your memory verses, or Study it in depth. Keep tapping to choose several verses: one colour highlights them all, and Memorize keeps them together as one passage. Tap a verse again to let it go. New to Bible study? “Study it step by step” walks you through.', before: () => {
    paintVerseBar();
    vbar.hidden = false;
  } },
  { el: '.toolbar .group.nav', title: 'Choose a chapter', text: 'Pick a book and chapter here. The ‹ and › buttons also change chapters.', before: () => (hideVerseBar()) },
  { el: '#searchForm', title: 'Go to a verse, or search', text: 'Type a reference like John 3:16 to go straight there, or words to search the whole Bible.' },
  { el: '#study .tabs', title: 'Study', text: 'Related verses for the one you selected, Words (Hebrew and Greek), Topics, Places and People — swipe the row to see them all. Wherever you go, a “‹ Back” button at the bottom left brings you back to where you were; the phone\'s back swipe does the same.', before: () => { setView('study'); switchTab('refs'); } },
  FEATURES.today === false
    ? { el: '#mNav [data-mn="search"]', title: 'Search', text: 'Search the whole Bible for words or phrases, and see the results with a chart of where they occur.', before: () => setView('read') }
    : { el: '#mNav [data-mn="today"]', title: 'Today', text: `Open your Bible where you left off, the devotional, study methods, memory verses${FEATURES.prayer === false ? '' : ', your prayer list'}, the reading plan and your journal.`, before: () => setView('read') },
  { el: '#mNav [data-mn="notes"]', title: 'Notes', text: 'Everything you have marked, in one list: notes, highlights and memory verses, with a filter for each. They are kept on this phone — back them up from Menu › Settings now and then.' },
  { el: '#mNav [data-mn="menu"]', title: 'Menu', text: `${FEATURES.today === false ? 'Memory verses, ' : ''}The Gospel, Compare passages (any two to four side by side), About this book, the Timeline, and Settings — text size, theme, your name and backing up your notes. This tutorial is here too.` },
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
    nav.stack.length = 0; // the tour's wanderings are not places to go back to
    setTimeout(() => { nav.cur = navSnapshot(); navPaint(); }, 400);
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

// ---------------------------------------------------------------- Study tabs on a phone: one row you can swipe sideways (no More menu)
{
  const prev = window.switchTab;
  window.switchTab = function (name) {
    prev(name);
    const b = $(`#study .tabs [data-tab="${name}"]`);
    if (b && isPhone()) b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  };
  // the tip cards under the tabs are left to the tour on a phone; the one-line description stays
  if (isPhone()) {
    const th = $('#tabHelp');
    if (th) {
      $('.th-i', th).hidden = true;
      new MutationObserver(() => { const t = $('.th-tip', th); if (t && !t.hidden) t.hidden = true; }).observe(th, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
    }
  }
}

// ---------------------------------------------------------------- the name of the app, under the bottom buttons
$('#mNav').insertAdjacentHTML('beforeend', '<div class="m-brand" aria-hidden="true">Rightly Dividing</div>');
