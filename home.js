'use strict';
/* Later additions: swiping between chapters, What's New, the start screen and your name, Settings and the book introductions.
   Merged in 3.15 from the per-release layers (v40.js, v41.js, v42.js, v43.js, v44.js), kept in their original order: later
   sections still extend earlier ones by wrapping window.X. */

// =====================================================================================================
// from v40.js
// =====================================================================================================
/* v3.10: swipe left or right to change chapters, and What's New shown
   inside the app (with a close button) on desktop and phone alike. Loaded after v39.js. */
/* global tsk, $, openModal, stepChapter, COMMANDS */

// ===================================================================== swipe to change chapters
{
  let x0 = null, y0 = 0, t0 = 0;
  const reader = $('#reader');
  reader.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return (x0 = null);
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
    t0 = Date.now();
  }, { passive: true });
  reader.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    const sel = window.getSelection && String(window.getSelection());
    // a quick, mostly sideways swipe; not a scroll, and not while selecting text
    if (sel || Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6 || Date.now() - t0 > 800) return;
    swipeChapter(dx < 0 ? 1 : -1);
  }, { passive: true });
}
async function swipeChapter(d) {
  const inner = $('#readerInner');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce) inner.classList.add(d > 0 ? 'swipe-out-left' : 'swipe-out-right');
  await new Promise((r) => setTimeout(r, reduce ? 0 : 140));
  await stepChapter(d);
  inner.classList.remove('swipe-out-left', 'swipe-out-right');
  if (!reduce) {
    inner.classList.add(d > 0 ? 'swipe-in-right' : 'swipe-in-left');
    setTimeout(() => inner.classList.remove('swipe-in-right', 'swipe-in-left'), 260);
  }
  $('#reader').scrollTop = 0;
}

// ===================================================================== What's New, inside the app
function openWhatsNew() {
  const theme = document.documentElement.dataset.theme || 'light';
  const src = `${tsk.web ? '' : '../'}CHANGELOG.html?theme=${encodeURIComponent(theme)}`;
  openModal(`<div class="kicker">Rightly Dividing</div><h2 class="m-title">What's new</h2>
    <iframe class="wn-frame" src="${src}" title="What's new"></iframe>`, 'm-whatsnew');
}
window.openWhatsNew = openWhatsNew;
// after an update, show it once, when the app has finished starting
{
  const prevInit = window.v3Init;
  window.v3Init = (u) => {
    if (prevInit) prevInit(u);
    setTimeout(() => tsk.whatsNewPending().then((p) => p && $('#modal').hidden && openWhatsNew()).catch(() => {}), 1200);
  };
}
COMMANDS.push(["What's new", 'changes updates version changelog', () => openWhatsNew()]);
tsk.onMenu((cmd) => {
  if (cmd === 'whatsNew') openWhatsNew();
});

// =====================================================================================================
// from v42.js
// =====================================================================================================
/* v3.13: Morning and Evening moved off the toolbar (it stays on Today, in the Go menu
   and in the phone's Menu). Switches for the Today screen and the prayer list (FEATURES.today, FEATURES.prayer).
   Loaded after v41.js. */
/* global tsk, state, $, $$, FEATURES, COMMANDS, TOUR, switchTab, v32, renderMarks */

const dropCommand = (label) => {
  for (let i = COMMANDS.length - 1; i >= 0; i--) if (COMMANDS[i][0] === label) COMMANDS.splice(i, 1);
};

// (Morning and Evening has no toolbar button: index.html; it is on Today and in the Go menu)


// ---------------------------------------------------------------- prayer list switch
if (FEATURES.prayer === false) {
  dropCommand('Prayer list');
  tsk.onMenu((cmd) => {
    if (cmd === 'prayers') switchTab('marks');
  });
}

// ---------------------------------------------------------------- the prayer list switch (FEATURES.prayer)

// =====================================================================================================
// from v43.js
// =====================================================================================================
/* v3.13: a start screen. Today greets you the first time you open the app each day (it can be switched off in
   Reading options), with an "Open your Bible" button that takes you straight to where you left off. The very
   first time the app is opened it asks your name, once, for the greeting. Loaded after v42.js. */
/* global tsk, state, $, esc, openModal, closeModal, saveUser, todayStr, FEATURES */

// ---------------------------------------------------------------- your name, asked once on the very first open
function askName(then) {
  openModal(`<h2 class="m-title nm-title">Welcome to Rightly Dividing, Friend!</h2>
    <blockquote class="nm-verse">“Study to shew thyself approved unto God, a workman that needeth not to be ashamed, rightly dividing the word of truth.” <span>2 Timothy 2:15</span></blockquote>
    <p class="nm-about">Rightly Dividing is for reading the Bible and studying it to understand the hidden treasures of God's Word.</p>
    <p class="nm-q">What is your name?</p>
    <p class="hint">So we can greet you each day. It stays on this device.</p>
    <form class="nm-form"><input id="nmInput" type="text" autocomplete="given-name" maxlength="40" placeholder="Your first name" />
      <p class="nm-q nm-q2">How big should the words be?</p>
      <div class="nm-sizes">${[[19, 'Normal'], [22, 'Larger'], [26, 'Largest']].map(([fs, t]) => `<button type="button" data-nm-fs="${fs}" class="${state.settings.fs === fs ? 'on' : ''}"><span style="font-size:${fs}px">Aa</span>${t}</button>`).join('')}</div>
      <p class="nm-sample" style="font-size:${state.settings.fs}px">The LORD is my shepherd; I shall not want.</p>
      <p class="hint">You can change this any time in Settings (Aa).</p>
      <div class="nm-btns"><button type="submit" class="primary-btn">Continue</button><button type="button" class="linkish" data-nm="skip">Skip</button></div></form>`, 'm-name');
  let pending = true;
  const done = (name) => {
    if (!pending) return;
    pending = false;
    state.settings.name = (name || '').trim().slice(0, 40);
    state.settings.nameAsked = true;
    saveUser(['settings']);
    closeModal();
    then();
  };
  $('#modal .nm-form').addEventListener('submit', (e) => {
    e.preventDefault();
    done($('#nmInput').value);
  });
  $('#modal [data-nm="skip"]').addEventListener('click', () => done(''));
  // the size of the words, seen at once
  $('#modal .nm-sizes').addEventListener('click', (e) => {
    const b = e.target.closest('[data-nm-fs]');
    if (!b) return;
    state.settings.fs = Number(b.dataset.nmFs);
    applySettings();
    saveUser(['settings']);
    $$('#modal .nm-sizes button').forEach((x) => x.classList.toggle('on', x === b));
    $('#modal .nm-sample').style.fontSize = `${state.settings.fs}px`;
  });
  setTimeout(() => $('#nmInput') && $('#nmInput').focus(), 100);
  // closing it with × or Esc counts as Skip
  const ob = new MutationObserver(() => {
    if ($('#modal').hidden || !$('#modal .nm-form')) {
      ob.disconnect();
      if (pending) done('');
    }
  });
  ob.observe($('#modal'), { attributes: true, childList: true, subtree: true });
}
{
  const prevTour = window.startTour;
  window.startTour = function () {
    // only on the very first open (the tour runs by itself then); replaying the tutorial never asks
    if (!state.settings.tourDone && !state.settings.nameAsked) return askName(() => window.startTour());
    prevTour();
  };
}

// ---------------------------------------------------------------- Today: "Open your Bible" (the button is built in walk.js)
{
  $('#modal').addEventListener('click', (e) => {
    if (!e.target.closest('[data-td4="open"]')) return;
    closeModal();
    if (typeof setView === 'function') setView('read'); // eslint-disable-line no-undef
  });
}

// ---------------------------------------------------------------- the start screen: first open each day
function maybeStartWithToday() {
  const s = state.settings;
  if (s.startToday === false || !s.tourDone || FEATURES.today === false) return;
  const today = todayStr();
  if (s.todayShown === today) return;
  if (!$('#modal').hidden || !$('#tour').hidden) return; // What's New (after an update) comes first; Today waits for the next open
  s.todayShown = today;
  saveUser(['settings']);
  window.openToday();
}
{
  const prevInit = window.v3Init;
  window.v3Init = (u) => {
    if (prevInit) prevInit(u);
    let tries = 0;
    const wait = setInterval(() => {
      tries++;
      if (state.books.length && state.chapter) {
        clearInterval(wait);
        setTimeout(maybeStartWithToday, 1600); // after What's New has had its turn
      } else if (tries > 80) clearInterval(wait);
    }, 250);
  };
}

// ---------------------------------------------------------------- Settings: the start screen switch (built in study.js)
{
  $('#modal').addEventListener('change', (e) => {
    const c = e.target.closest('[data-ro4="startToday"]');
    if (!c) return;
    state.settings.startToday = c.checked;
    saveUser(['settings']);
  });
}

// =====================================================================================================
// from v44.js
// =====================================================================================================
/* v3.14: an introduction to every book of the Bible; one Settings page
   (the text, your name, the start screen and your notes). Loaded after v43.js. */
/* global tsk, state, $, $$, esc, openModal, closeModal, saveUser, toast, go, hideWordCard, COMMANDS, TOUR, isPhone, setView */

const onPhone = () => typeof isPhone === 'function' && isPhone();
const toReading = () => typeof setView === 'function' && onPhone() && setView('read');


// ---------------------------------------------------------------- About this book
// J. B. Tidwell, The Bible Book by Book (1916), word for word, under the five questions of observation; where he is
// silent, C. I. Scofield's line (1917); where neither says, "Not stated." (data: tools/build_tidwell.py)
const BK_Q = [['author', 'Author'], ['audience', 'Audience'], ['relationship', 'Relationship'], ['occasion', 'Occasion'], ['purpose', 'Purpose']];
const bkJoin = (xs) => (xs.length < 2 ? xs[0] : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const bkSec = (s) => `<p>${s.h ? `<b class="bk-h">${esc(s.h)}${esc(s.sep || '.')}</b> ` : ''}${s.html}</p>`;
async function openBookIntro(bookId) {
  const bk = state.books[bookId - 1];
  if (!bk) return;
  const d = await tsk.tidwell(bookId).catch(() => null);
  if (!d) return openModal(`<div class="kicker">About this book</div><h2 class="m-title">${esc(bk.name)}</h2><p class="hint">Not found.</p>`, 'm-bookintro');
  const secs = d.secs || [];
  const done = new Set();
  const qs = [];
  for (const [k, label] of BK_Q) {
    if (done.has(k)) continue;
    const mine = secs.filter((s) => s.kind === 'sec' && (s.fields || [])[0] === k);
    // a section that answers several questions at once is shown once, under all of them
    const also = secs.filter((s) => s.kind === 'sec' && (s.fields || []).indexOf(k) > 0 && !(s.fields || []).some((f) => done.has(f)));
    if (mine.length) {
      for (const s of mine) {
        const labels = s.fields.map((f) => BK_Q.find((q) => q[0] === f)[1]);
        s.fields.forEach((f) => done.add(f));
        qs.push(`<section class="bk-q"><h3>${esc(bkJoin(labels))}</h3>${bkSec(s)}</section>`);
      }
    } else if (also.length) {
      continue; // shown with the question it is listed under first
    } else if (d.sco && d.sco[k]) {
      done.add(k);
      qs.push(`<section class="bk-q"><h3>${label}</h3><p>${d.sco[k]}</p><div class="bk-src">C. I. Scofield</div></section>`);
    } else {
      done.add(k);
      qs.push(`<section class="bk-q none"><h3>${label}</h3><p>Not stated.</p></section>`);
    }
  }
  const more = secs.filter((s) => s.kind === 'sec' && !(s.fields || []).length);
  const rest = secs.filter((s) => s.kind !== 'sec').map((s) => (s.kind === 'analysis'
    ? `<div class="section-title">${esc(s.h || 'Analysis')}</div><div class="bk-outline">${s.items.map((it) => `<div class="${it.lvl < 0 ? 'bk-onote' : `bk-o${it.lvl > 2 ? 2 : it.lvl > 0 ? 1 : 0}`}">${it.html}</div>`).join('')}</div>`
    : `<div class="bk-study">${s.html.replace(/^(For Study (and|mid) +[Dd]iscussion[.,]?)/, '<b class="bk-h">$1</b>').replace(/^/, '<p>')}</p></div>`)).join('');
  openModal(`<div class="kicker">About this book</div><h2 class="m-title">${esc(bk.name)}</h2>
    <div class="bk">
      <div class="bk-qs">${qs.join('')}</div>
      ${more.length ? `<div class="section-title">More from Tidwell</div><div class="bk-more">${more.map(bkSec).join('')}</div>` : ''}
      ${rest}
    </div>
    <p class="hint bi-note">From J. B. Tidwell, <i>The Bible Book by Book</i> (Baylor University Press, 1916), word for word. Where he does not say, the line marked Scofield is from C. I. Scofield's introduction (1917). Tap a reference to read it.</p>`, 'm-bookintro');
  $('#modal').dataset.book = bookId;
}
$('#modal').addEventListener('click', (e) => {
  if (!$('#modal').classList.contains('m-bookintro')) return;
  const r = e.target.closest('.bk .ref');
  if (!r) return;
  closeModal();
  toReading();
  go({ id: Number(r.dataset.s), endId: Number(r.dataset.e) });
});
// a quiet link under each chapter heading
new MutationObserver(() => {
  if (!ABOUT_ON) return;
  const head = $('#readerInner .chapter-head');
  if (!head || head.nextElementSibling && head.nextElementSibling.classList.contains('bi-link')) return;
  const bk = state.books[(state.cur.book || 1) - 1];
  if (!bk) return;
  head.insertAdjacentHTML('afterend', `<button class="bi-link" data-bi-open="${bk.id}">About ${esc(bk.name)} ›</button>`);
}).observe($('#readerInner'), { childList: true });
$('#readerInner').addEventListener('click', (e) => {
  const b = e.target.closest('[data-bi-open]');
  if (b) openBookIntro(Number(b.dataset.biOpen));
});
if (ABOUT_ON) COMMANDS.push(['About this book', 'introduction writer author audience occasion purpose date outline book tidwell', () => openBookIntro(state.cur.book)]);
window.openBookIntro = openBookIntro;

// ---------------------------------------------------------------- Settings (the page is built in study.js): your name and backups
async function paintNotesSection() {
  const box = $('#stNotes');
  if (!box) return;
  if (tsk.web) {
    box.innerHTML = `<p class="hint">Your notes are kept on this device. Save a backup file now and then, somewhere safe.</p>
      <div class="st-btns"><button data-st="backup">Back up my notes</button><button data-st="restore">Restore from a backup…</button></div>`;
    return;
  }
  const b = await tsk.backupInfo().catch(() => ({}));
  box.innerHTML = `<p class="hint">${b.dir ? `Backed up automatically to <b>${esc(b.dir)}</b>${b.last ? ` · last ${esc(new Date(b.last).toLocaleString())}` : ''}.` : 'No backup folder is set. Choose one (for example inside OneDrive) and your notes are copied there automatically.'}</p>
    <div class="st-btns"><button data-st="choose">${b.dir ? 'Change backup folder…' : 'Choose a backup folder…'}</button>${b.dir ? '<button data-st="now">Back up now</button>' : ''}</div>`;
}
{
  const saveName = (v) => {
    state.settings.name = String(v || '').trim().slice(0, 40);
    state.settings.nameAsked = true;
    saveUser(['settings']);
  };
  $('#modal').addEventListener('change', (e) => {
    if (e.target.id === 'stName') {
      saveName(e.target.value);
      toast(state.settings.name ? `Thank you, ${state.settings.name}` : 'Name cleared');
    }
  });
  $('#modal').addEventListener('keydown', (e) => {
    if (e.target.id === 'stName' && e.key === 'Enter') e.target.blur();
  });
  $('#modal').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-st]');
    if (!b) return;
    const k = b.dataset.st;
    if (k === 'backup') tsk.backup().then(() => toast('Saved. Keep the file somewhere safe.'));
    else if (k === 'restore') $('#restoreFile') && $('#restoreFile').click();
    else if (k === 'choose') {
      await tsk.backupChoose();
      paintNotesSection();
    } else if (k === 'now') {
      await tsk.backupNow();
      paintNotesSection();
    }
  });
  window.openSettings = () => window.openReadingOptions();
  for (const c of COMMANDS) if (c[0] === 'Reading options') c[0] = 'Settings';
  COMMANDS.push(['Your name', 'name greeting settings', () => window.openReadingOptions()]);
}

// =====================================================================================================
// 3.15: right-click a verse (Windows, and browsers on a computer) for the same actions as the phone's verse bar
// =====================================================================================================
{
  document.body.insertAdjacentHTML('beforeend', '<div id="verseMenu" class="verse-menu" role="menu" hidden></div>');
  const vm = $('#verseMenu');
  const hideVm = () => (vm.hidden = true);
  const ready = async (id) => {
    for (let i = 0; i < 40 && !(state.xref && state.xref.verse.id === id); i++) await new Promise((r) => setTimeout(r, 50));
    return state.xref && state.xref.verse.id === id;
  };
  $('#readerInner').addEventListener('contextmenu', async (e) => {
    if (onPhone()) return;
    const v = e.target.closest('.verse');
    if (!v) return;
    e.preventDefault();
    const id = Number(v.dataset.id);
    if (state.cur.sel !== id || !state.xref || state.xref.verse.id !== id) v.click(); // select it, as a click does
    if (!(await ready(id))) return;
    const hl = state.highlights[id];
    vm.innerHTML = `<div class="vm-head">${esc(state.xref.verse.label)}</div>
      <div class="vm-hl" role="group" aria-label="Highlight">${HL_COLORS.map((c) => `<button class="dot hl-${c}${hl === c ? ' on' : ''}" data-vm="hl" data-c="${c}" title="Highlight ${c}" aria-label="Highlight ${c}"></button>`).join('')}<button class="dot none${hl ? '' : ' on'}" data-vm="hl" data-c="" title="No highlight" aria-label="No highlight">&times;</button></div>
      <button role="menuitem" data-vm="guide" class="vm-guide">Study it step by step</button>
      <button role="menuitem" data-vm="note">Write a note</button>
      <button role="menuitem" data-vm="copy">Copy verse</button>
      <button role="menuitem" data-vm="memory">${state.memory[id] ? 'Remove from memory verses' : 'Memorize'}</button>
      <div class="vm-sep"></div>
      <button role="menuitem" data-vm="lesson" data-act="lessonAdd">Add to a lesson…</button>
      <button role="menuitem" data-vm="pin">Pin above the text</button>
      <div class="vm-sep"></div>
      <button role="menuitem" data-vm="blb" title="Opens in your web browser (needs the internet)">Commentary at Blue Letter Bible ↗</button>`;
    vm.hidden = false;
    const w = vm.offsetWidth, h = vm.offsetHeight;
    vm.style.left = `${Math.min(e.clientX, window.innerWidth - w - 8)}px`;
    vm.style.top = `${Math.min(e.clientY, window.innerHeight - h - 8)}px`;
  });
  vm.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-vm]');
    if (!b || !state.xref) return;
    const v = state.xref.verse;
    const k = b.dataset.vm;
    if (k === 'lesson') {
      showLessonMenu(b);
      return setTimeout(hideVm, 0);
    }
    hideVm();
    if (k === 'hl') setHighlight(v.id, b.dataset.c);
    else if (k === 'copy') {
      navigator.clipboard.writeText(`${v.label} (KJV) ${v.text}`);
      toast('Verse copied');
    } else if (k === 'memory') toggleMemory(v.id);
    else if (k === 'pin') pinCurrent();
    else if (k === 'guide') startGuide(v.id);
    else if (k === 'blb') window.open(blbUrl(v.label), '_blank');
    else if (k === 'note') {
      switchTab('refs');
      setTimeout(() => {
        const n = $('#pane-refs textarea.note');
        if (n) {
          n.scrollIntoView({ block: 'center' });
          n.focus();
        }
      }, 150);
    }
  });
  document.addEventListener('mousedown', (e) => {
    if (!vm.hidden && !e.target.closest('#verseMenu')) hideVm();
  });
  document.addEventListener('keydown', (e) => e.key === 'Escape' && hideVm());
  $('#reader').addEventListener('scroll', hideVm, { passive: true });
  window.addEventListener('blur', hideVm);
}

// =====================================================================================================
// 3.16: Study this verse, step by step — the study tools, one plain step at a time, for anyone new to them
// =====================================================================================================
const GUIDE_STEPS = [
  { key: 'read', title: 'Read it slowly', what: 'Start with the verse itself. Read it twice, slowly. Notice who is speaking, to whom, and what is happening just before and after.' },
  { key: 'related', title: 'Other verses that say something similar', what: 'The Bible explains the Bible. These are cross-references: other places that speak about the same thing (from the Treasury of Scripture Knowledge).' },
  { key: 'word', title: 'Look closer at one word', what: 'The Bible was first written in Hebrew and Greek. Pick a word to see the word behind the English and what it means.' },
  { key: 'apply', title: 'What is God saying to you?', what: 'Write a sentence or two in your own words: what you learned, and what you will do. It is saved as your note on this verse.' },
];
const FUNCTION_WORDS = /^(Function=(Conjunction|Article|Preposition|Particle|Pronoun|Adverb)|.*(Article|Conjunction|Preposition))/;
const guide = { id: null, step: 0, data: null, word: null };

async function startGuide(id) {
  id = id || state.cur.sel || (state.xref && state.xref.verse.id);
  if (!id) return toast('Tap a verse first');
  guide.id = id;
  guide.step = 0;
  guide.word = null;
  const [x, words] = await Promise.all([tsk.xrefs(id, 'kjv'), tsk.words(id).catch(() => [])]);
  const v = x.verse;
  const around = await tsk.versesByIds([id - 1, id + 1]).catch(() => []);
  // a few related verses, with their text
  const picks = [];
  for (const g of x.groups.slice(0, 4)) for (const r of g.refs.slice(0, 2)) if (picks.length < 6) picks.push({ ...r, anchor: g.anchor });
  const texts = new Map((await tsk.versesByIds(picks.map((p) => p.start))).map((t) => [t.id, t.text]));
  // the words worth a closer look
  // naming, describing and action words, each once, the most distinctive first, shown in the verse's order
  const seen = new Set();
  const content = (words || [])
    .map((w, i) => ({ ...w, i, gloss: String(w.gloss || '').replace(/\[[^\]]*\]\s*/g, '').replace(/[;,.:!?“”"]+/g, '').replace(/^(of|and)\s+/i, '').trim() }))
    .filter((w) => w.gloss && /[a-z]{3}/i.test(w.gloss) && /^Function=(Verb|Noun|Adjective)/.test((w.grammar || '').replace(/\s+;/, ';')) && !FUNCTION_WORDS.test(w.grammar || ''))
    .filter((w) => !seen.has(w.strongs) && seen.add(w.strongs));
  const keyWords = content.sort((a, b) => (a.uses || 0) - (b.uses || 0)).slice(0, 8).sort((a, b) => a.i - b.i);
  guide.data = { v, around, picks: picks.map((p) => ({ ...p, text: texts.get(p.start) || '' })), keyWords };
  renderGuide();
}

function renderGuide() {
  const { v, around, picks, keyWords } = guide.data;
  const s = GUIDE_STEPS[guide.step];
  let body = '';
  if (s.key === 'read') {
    const before = around.find((a) => a.id === v.id - 1);
    const after = around.find((a) => a.id === v.id + 1);
    body = `${before ? `<p class="gd-ctx"><span>${esc(before.label)}</span> ${esc(before.text)}</p>` : ''}
      <blockquote class="gd-verse">${esc(v.text)} <span>${esc(v.label)}</span></blockquote>
      ${after ? `<p class="gd-ctx"><span>${esc(after.label)}</span> ${esc(after.text)}</p>` : ''}
      <p class="gd-ask">Ask yourself: Who is speaking? To whom? What does it say about God?</p>`;
  } else if (s.key === 'related') {
    body = picks.length
      ? `<div class="gd-refs">${picks.map((p) => `<div class="gd-ref"><div class="gd-ref-h"><b>${esc(p.label)}</b>${p.anchor ? `<span>on “${esc(p.anchor)}”</span>` : ''}</div><div class="gd-ref-t">${esc(p.text)}${p.end > p.start ? ' …' : ''}</div></div>`).join('')}</div>
        <p class="gd-ask">Which of these helps you understand the verse? Later, the Related verses tab has them all.</p>`
      : '<p class="hint">This verse has no cross-references. Go on to the next step.</p>';
  } else if (s.key === 'word') {
    const w = guide.word != null ? keyWords[guide.word] : null;
    body = keyWords.length
      ? `<div class="gd-words">${keyWords.map((k, i) => `<button class="${guide.word === i ? 'on' : ''}" data-gd-word="${i}">${esc(k.gloss)}</button>`).join('')}</div>
        ${w ? `<div class="gd-word">
          <div class="gd-word-h"><span class="og">${esc(w.word)}</span> <i>${esc(w.translit)}</i> <span class="hint">${w.lang === 'H' ? 'Hebrew' : 'Greek'} · ${esc(w.strongs)}</span></div>
          <p><b>${esc(w.gloss)}</b> — ${esc(w.def || '')}</p>
          ${w.grammar ? `<p class="hint">${esc(grammarLine(w.grammar))}</p>` : ''}
          ${w.kjv_def ? `<p class="hint">In the KJV it is also translated: ${esc(w.kjv_def)}</p>` : ''}
          <p class="hint">Used ${Number(w.uses || 0).toLocaleString()} time${w.uses === 1 ? '' : 's'} in the Bible.</p>
          <button class="linkish" data-gd-strong="${esc(w.strongs)}">See every verse that uses it</button></div>` : '<p class="hint">Tap a word above.</p>'}`
      : '<p class="hint">No original-language words for this verse. Go on to the next step.</p>';
  } else {
    body = `<textarea class="gd-note" placeholder="In my own words…">${esc(guide.apply || '')}</textarea>
      <p class="hint">Saved with this verse in Notes. You can change it any time.</p>`;
  }
  const last = guide.step === GUIDE_STEPS.length - 1;
  openModal(`<div class="kicker">Study this verse · step ${guide.step + 1} of ${GUIDE_STEPS.length} · ${esc(v.label)}</div>
    <h2 class="m-title">${esc(s.title)}</h2>
    <div class="gd-dots">${GUIDE_STEPS.map((_, i) => `<span class="${i === guide.step ? 'on' : i < guide.step ? 'done' : ''}"></span>`).join('')}</div>
    <p class="gd-what">${esc(s.what)}</p>
    <div class="gd-body">${body}</div>
    <div class="gd-foot">${guide.step ? '<button data-gd="back">‹ Back</button>' : '<span></span>'}
      <button class="primary-btn" data-gd="${last ? 'done' : 'next'}">${last ? 'Save and finish' : 'Next ›'}</button></div>`, 'm-guide');
  const n = $('#modal .gd-note');
  if (n) n.addEventListener('input', () => (guide.apply = n.value));
}

function finishGuide() {
  const v = guide.data.v;
  const text = (guide.apply || '').trim();
  if (text) {
    const prev = state.notes[v.id] ? `${state.notes[v.id].trim()}\n\n` : '';
    state.notes[v.id] = `${prev}${text}`;
    saveUser(['notes']);
    if (typeof refreshMarkIcons === 'function') refreshMarkIcons(v.id);
    if (state.xref && state.xref.verse.id === v.id) {
      const n = $('#pane-refs textarea.note');
      if (n) n.value = state.notes[v.id];
    }
  }
  guide.apply = '';
  closeModal();
  toast(text ? 'Saved in your notes. Well done!' : 'Well done!');
}

$('#modal').addEventListener('click', (e) => {
  if (!$('#modal').classList.contains('m-guide')) return;
  const b = e.target.closest('[data-gd]');
  if (b) {
    if (b.dataset.gd === 'next') guide.step += 1;
    else if (b.dataset.gd === 'back') guide.step -= 1;
    else return finishGuide();
    return renderGuide();
  }
  const w = e.target.closest('[data-gd-word]');
  if (w) {
    guide.word = Number(w.dataset.gdWord);
    return renderGuide();
  }
  const st = e.target.closest('[data-gd-strong]');
  if (st) {
    closeModal();
    if (typeof setView === 'function' && onPhone()) setView('study');
    return openStrong(st.dataset.gdStrong);
  }
});
// where to start it: under the verse (Related verses), the right-click menu, the phone's verse bar, and Today
{
  const prevOnVerse = window.v3OnVerse;
  window.v3OnVerse = (id, x) => {
    prevOnVerse(id, x);
    const head = $('#pane-refs .xhead');
    if (head && !$('.gd-start', head)) head.insertAdjacentHTML('afterbegin', '<button class="gd-start" data-gd-start="1">Study this verse, step by step ›</button>');
  };
  $('#pane-refs').addEventListener('click', (e) => {
    if (e.target.closest('[data-gd-start]')) startGuide(state.xref && state.xref.verse.id);
  });
  COMMANDS.push(['Study this verse, step by step', 'guide help learn beginner how to study', () => startGuide()]);
  window.startGuide = startGuide;
}

// =====================================================================================================
// 3.16: what each Study tab is for — a plain line under the tabs, and a short tip the first time a tab is opened
// (the ⓘ shows it again)
// =====================================================================================================
const TAB_HELP = {
  refs: { line: 'Other verses that speak about the same thing.', tip: 'The Bible explains the Bible. Under the verse you selected are other verses on the same words and ideas, grouped by key word. Point to one (or tap it) to read it; click to go there.', eg: 'Try it: select John 3:16 and look under “loved”.' },
  words: { line: 'The Hebrew or Greek behind each English word.', tip: 'The Old Testament was written in Hebrew and the New Testament in Greek. Choose a word to see what it means, and every other verse that uses the same word — the KJV sometimes translates it differently.', eg: 'In John 3:16, “loved” is agapaō, the love of God.' },
  topics: { line: 'Bible subjects this verse is listed under.', tip: 'Nave’s Topical Bible gathers verses by subject — prayer, faith, forgiveness, marriage, money. Open a topic to read every verse on it, in order.', eg: '' },
  places: { line: 'Where it happened, on a map.', tip: 'Every place named in the chapter is on the map, and places in the selected verse are marked. Tap a place to see every verse that names it, or follow one of the journeys.', eg: '' },
  people: { line: 'Who is named in this verse, and their family.', tip: 'Everyone named in the verse, with parents, husband or wife, children, brothers and sisters — each with the verse that says so. Follow a line back to Adam.', eg: '' },
  search: { line: 'Find words anywhere in the Bible.', tip: 'Type words in the box at the top and press Enter. Put words in quotes, like “living water”, for that exact phrase. The chart shows which books use it most.', eg: '' },
  marks: { line: 'Your notes, highlights, memory verses, prayer list and journal.', tip: 'Everything you write or mark is kept here, on this device. Back it up now and then from Settings.', eg: '' },
};
{
  const tabs = $('#study .tabs') || $('.tabs');
  tabs.insertAdjacentHTML('afterend', '<div id="tabHelp" class="tab-help"><span class="th-line"></span><button class="th-i" title="What is this?" aria-label="What is this?" aria-expanded="false">i</button><div class="th-tip" hidden></div></div>');
  const box = $('#tabHelp');
  const showTip = (name, on) => {
    const h = TAB_HELP[name];
    const tip = $('.th-tip', box);
    if (!h) return;
    tip.innerHTML = `<p>${esc(h.tip)}</p>${h.eg ? `<p class="th-eg">${esc(h.eg)}</p>` : ''}<button class="th-ok">Got it</button>`;
    tip.hidden = !on;
    $('.th-i', box).setAttribute('aria-expanded', String(on));
  };
  const paint = (name) => {
    const h = TAB_HELP[name];
    box.hidden = !h;
    if (!h) return;
    $('.th-line', box).textContent = h.line;
    box.dataset.tab = name;
    const seen = (state.settings.tipsSeen = state.settings.tipsSeen || {});
    // the first time each tab is opened (after the guided tour), its tip opens by itself
    const changed = box.dataset.shown !== name;
    box.dataset.shown = name;
    if (!seen[name] && state.settings.tourDone && !(typeof v32 !== 'undefined' && v32.tour != null)) {
      seen[name] = true;
      saveUser(['settings']);
      showTip(name, true);
    } else if (changed) showTip(name, false); // a tip stays open while you stay on its tab
  };
  const prev = window.switchTab;
  window.switchTab = function (name) {
    prev(name);
    paint(name);
  };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.th-ok')) return showTip(box.dataset.tab, false);
    if (e.target.closest('.th-i')) showTip(box.dataset.tab, $('.th-tip', box).hidden);
  });
  window.TAB_HELP = TAB_HELP;
}
// Settings › Grammar: plain words (the default) or the grammar terms (Aorist, Qal, Nominative …)
$('#modal').addEventListener('click', (e) => {
  const b = e.target.closest('[data-gt]');
  if (!b) return;
  state.settings.grammarTerms = b.dataset.gt === '1';
  saveUser(['settings']);
  $$('#modal [data-gt]').forEach((x) => x.classList.toggle('on', x === b));
  if (typeof renderWordsPane === 'function') renderWordsPane();
  toast(state.settings.grammarTerms ? 'Grammar terms shown' : 'Grammar in plain words');
});

// =====================================================================================================
// 3.16: suggestions as you type in the search box — a book (with its chapters, the ones you have read marked),
// phrases from the KJV itself (with how often they occur), topics and people
// =====================================================================================================
{
  const form = $('#searchForm');
  const input = $('#searchInput');
  form.insertAdjacentHTML('beforeend', '<div id="searchSuggest" class="sg" role="listbox" hidden></div>');
  const box = $('#searchSuggest');
  let phrases = null;
  let timer = null;
  let seq = 0;
  const norm = (s) => s.toLowerCase().replace(/^(first|i)\s+/, '1 ').replace(/^(second|ii)\s+/, '2 ').replace(/^(third|iii)\s+/, '3 ').replace(/[^a-z0-9]/g, '');
  const findBooks = (q) => {
    const n = norm(q);
    if (n.replace(/\d/g, '').length < 2) return [];
    const alias = { psalm: 19, song: 22, songs: 22, canticles: 22, revelations: 66 };
    const hits = state.books.filter((b) => norm(b.name).startsWith(n) || norm(b.abbr || '').startsWith(n) || (/^\d/.test(b.name) && !/^\d/.test(n) && norm(b.name).slice(1).startsWith(n)));
    for (const [k, id] of Object.entries(alias)) if (k.startsWith(n) && !hits.some((b) => b.id === id)) hits.push(state.books[id - 1]);
    const exact = hits.find((b) => norm(b.name) === n || norm(b.name) === `${n}s`);
    if (exact) return [exact];
    return hits.slice(0, 6);
  };
  const hide = () => {
    box.hidden = true;
    box.innerHTML = '';
  };
  const mark = (text, words) => {
    let h = esc(text);
    for (const w of words) h = h.replace(new RegExp(`\\b(${w.replace(/[^a-z']/gi, '')})`, 'gi'), '<b>$1</b>');
    return h;
  };
  async function bookCard(b, ch) {
    const read = state.readlog && state.readlog.chapters ? state.readlog.chapters : {};
    const nRead = Array.from({ length: b.chapters }, (_, i) => read[`${b.id}:${i + 1}`]).filter(Boolean).length;
    const label = b.id === 19 ? 'Psalm' : 'Chapter';
    return `<div class="sg-book">
      <div class="sg-book-h"><span class="sg-book-n">${esc(b.name)}</span><span class="sg-book-c">${b.chapters} chapter${b.chapters === 1 ? '' : 's'}${nRead ? ` · ${nRead} read` : ''}</span>
        ${ABOUT_ON ? `<button type="button" class="sg-about" data-sg-about="${b.id}" tabindex="-1">About ${esc(b.name)} ›</button>` : ''}</div>
      <div class="sg-chs" role="group" aria-label="${esc(b.name)} chapters">${Array.from({ length: b.chapters }, (_, i) => i + 1).map((c) => `<button type="button" class="sg-ch${read[`${b.id}:${c}`] ? ' read' : ''}${c === ch ? ' on' : ''}" data-sg-go="${b.id}:${c}" title="${label} ${c}${read[`${b.id}:${c}`] ? ' — read' : ''}">${c}</button>`).join('')}</div></div>`;
  }
  async function suggest() {
    const my = ++seq;
    const raw = input.value;
    const q = raw.trim();
    if (q.length < 2 || /^["'G H]\d/.test(q)) return hide();
    const m = q.match(/^(.*?[a-z].*?)\s*(\d+)?(?::\d+.*)?$/i);
    const bookPart = m ? m[1] : q;
    const chapter = m && m[2] ? Number(m[2]) : null;
    const books = findBooks(bookPart);
    const html = [];
    if (books.length === 1 || (books.length > 1 && chapter)) {
      const b = books[0];
      html.push(await bookCard(b, chapter && chapter <= b.chapters ? chapter : null));
    } else if (books.length > 1) {
      html.push(`<div class="sg-sec">Books</div><div class="sg-books">${books.map((b) => `<button type="button" class="sg-item sg-bk" data-sg-book="${b.id}">${esc(b.name)}<span>${b.chapters} ch.</span></button>`).join('')}</div>`);
    }
    // phrases, topics and people for words (not for "John 3")
    if (!chapter && /[a-z]{2}/i.test(q)) {
      phrases = phrases || (await tsk.phrases());
      const words = q.toLowerCase().split(/\s+/).filter(Boolean);
      const hits = [];
      for (const [p, n] of phrases) {
        const pw = p.toLowerCase().split(' ');
        let k = 0;
        for (const w of pw) if (k < words.length && w.startsWith(words[k])) k++;
        if (k === words.length && p.toLowerCase() !== q.toLowerCase()) hits.push([p, n]);
        if (hits.length >= (books.length ? 3 : 6)) break;
      }
      if (hits.length) html.push(`<div class="sg-sec">In the KJV</div>${hits.map(([p, n]) => `<button type="button" class="sg-item sg-ph" data-sg-phrase="${esc(p)}"><span class="sg-q">${mark(p, words)}</span><span class="sg-n">${n} time${n === 1 ? '' : 's'}</span></button>`).join('')}`);
      if (q.length >= 3 && !books.length) {
        const [topics, people] = await Promise.all([tsk.naveSearch(q).catch(() => []), tsk.personSearch(q).catch(() => [])]);
        if (my !== seq) return;
        const ts = (topics || []).filter((t) => t.subject.toLowerCase().startsWith(words[0])).slice(0, 2);
        const ps = (people || []).slice(0, 2);
        if (ts.length || ps.length) {
          html.push(`<div class="sg-sec">Topics and people</div>${ts.map((t) => `<button type="button" class="sg-item sg-tp" data-sg-topic="${t.id}"><span class="sg-kind">Topic</span><span class="sg-q">${esc(t.subject.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()))}</span></button>`).join('')}
            ${ps.map((p) => `<button type="button" class="sg-item sg-pp" data-sg-person="${p.pid}"><span class="sg-kind">Person</span><span class="sg-q">${esc(p.name)}</span><span class="sg-n">${esc(String(p.note || '').split(/[.;]/)[0].slice(0, 50))}</span></button>`).join('')}`);
        }
      }
    }
    if (my !== seq || input.value !== raw || document.activeElement !== input) return; // only while typing
    if (!html.length) return hide();
    html.push(`<div class="sg-foot">Enter searches the whole Bible for “${esc(q)}”</div>`);
    box.innerHTML = html.join('');
    box.hidden = false;
    if (onPhone()) {
      // under the search box, above the keyboard
      const top = form.getBoundingClientRect().bottom + 6;
      box.style.top = `${top}px`;
      box.style.maxHeight = `${Math.max(180, (window.visualViewport ? window.visualViewport.height : window.innerHeight) - top - 10)}px`;
    }
  }
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('aria-controls', 'searchSuggest');
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(suggest, 120);
  });
  input.addEventListener('focus', () => input.value.trim().length >= 2 && suggest());
  const act = async (el) => {
    hide();
    if (el.dataset.sgGo) {
      const [b, c] = el.dataset.sgGo.split(':').map(Number);
      input.value = '';
      input.blur();
      if (typeof setView === 'function' && onPhone()) setView('read');
      return go({ book: b, ch: c });
    }
    if (el.dataset.sgBook) {
      input.value = `${state.books[Number(el.dataset.sgBook) - 1].name} `;
      input.focus();
      return suggest();
    }
    if (el.dataset.sgAbout) return openBookIntro(Number(el.dataset.sgAbout));
    if (el.dataset.sgPhrase) {
      input.value = `"${el.dataset.sgPhrase}"`;
      input.blur();
      return form.requestSubmit();
    }
    if (el.dataset.sgTopic) {
      input.blur();
      if (typeof setView === 'function' && onPhone()) setView('study');
      switchTab('topics');
      return openTopic(Number(el.dataset.sgTopic));
    }
    if (el.dataset.sgPerson) {
      input.blur();
      if (typeof setView === 'function' && onPhone()) setView('study');
      switchTab('people');
      return showPerson(Number(el.dataset.sgPerson) || el.dataset.sgPerson);
    }
  };
  box.addEventListener('mousedown', (e) => e.preventDefault()); // keep the box open while choosing
  box.addEventListener('click', (e) => {
    const el = e.target.closest('[data-sg-go],[data-sg-book],[data-sg-about],[data-sg-phrase],[data-sg-topic],[data-sg-person]');
    if (el) act(el);
  });
  // keyboard: ↓/↑ through the suggestions, Enter to choose, Esc to close
  input.addEventListener('keydown', (e) => {
    if (box.hidden) return;
    const items = $$('.sg-item, .sg-ch', box);
    const cur = items.findIndex((x) => x.classList.contains('kb'));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = e.key === 'ArrowDown' ? Math.min(items.length - 1, cur + 1) : Math.max(-1, cur - 1);
      items.forEach((x, i) => x.classList.toggle('kb', i === next));
      if (items[next]) items[next].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && cur >= 0) {
      e.preventDefault();
      e.stopPropagation();
      act(items[cur]);
    } else if (e.key === 'Escape') hide();
  }, true);
  form.addEventListener('submit', () => {
    clearTimeout(timer);
    seq += 1; // a search or a reference cancels any suggestion still on its way
    hide();
  }, true);
  input.addEventListener('blur', () => setTimeout(() => document.activeElement !== input && hide(), 150));
  document.addEventListener('mousedown', (e) => {
    if (!box.hidden && !e.target.closest('#searchForm')) hide();
  });
}

// =====================================================================================================
// 3.17.1: help for new users — put the app on the iPhone Home Screen, and a monthly reminder to back up notes
// =====================================================================================================
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isInstalled = () => navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
const SHARE_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" style="vertical-align:-3px"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M6 11H5v10h14V11h-1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function homeScreenHelpHtml() {
  return isIOS() || !tsk.web
    ? `<ol class="nd-steps"><li>In Safari, tap the Share button ${SHARE_ICON} at the bottom of the screen.</li><li>Scroll down and choose <b>Add to Home Screen</b>.</li><li>Tap <b>Add</b>. The app opens from its own icon, full screen, and works without the internet.</li></ol>`
    : '<ol class="nd-steps"><li>Open your browser’s menu (⋮ or ☰).</li><li>Choose <b>Install app</b> or <b>Add to Home screen</b>.</li></ol>';
}
function openHomeScreenHelp() {
  openModal(`<div class="kicker">On your phone</div><h2 class="m-title">Put it on your Home Screen</h2>
    <p class="wk-lead">Then Rightly Dividing opens like any other app, with its own icon.</p>${homeScreenHelpHtml()}`, 'm-a2hs');
}
window.openHomeScreenHelp = openHomeScreenHelp;

function showNudge(html, buttons) {
  let el = $('#nudge');
  if (!el) {
    el = document.createElement('div');
    el.id = 'nudge';
    el.setAttribute('role', 'dialog');
    document.body.appendChild(el);
  }
  el.innerHTML = `<div class="nd-body">${html}</div><div class="nd-btns">${buttons.map((b, i) => `<button type="button" data-nd="${i}" class="${i === 0 ? 'primary-btn' : ''}">${esc(b[0])}</button>`).join('')}</div>`;
  el.hidden = false;
  el.onclick = (e) => {
    const b = e.target.closest('[data-nd]');
    if (!b) return;
    el.hidden = true;
    buttons[Number(b.dataset.nd)][1]();
  };
}

const marksCount = () => Object.keys(state.notes || {}).length + Object.keys(state.highlights || {}).length + Object.keys(state.memory || {}).length
  + (state.prayers || []).length + (state.journal || []).length;
const DAY = 864e5;
const since = (iso) => (iso ? Date.now() - Date.parse(iso) : Infinity);

async function nextNudge() {
  const s = state.settings;
  if (!s.tourDone) return;
  // iPhone in Safari: once, then only from the Menu
  if (tsk.web && isIOS() && !isInstalled() && !s.homeScreenHelped) {
    s.homeScreenHelped = new Date().toISOString();
    saveUser(['settings']);
    return showNudge(`<b>Put Rightly Dividing on your Home Screen</b>${homeScreenHelpHtml()}`, [['Got it', () => {}]]);
  }
  // notes worth keeping, and no backup in the last month: remind, at most once a month
  if (marksCount() < 3 || since(s.backupNudged) < 30 * DAY) return;
  if (tsk.web) {
    if (since(s.lastBackup) < 30 * DAY) return;
    s.backupNudged = new Date().toISOString();
    saveUser(['settings']);
    return showNudge('<b>Back up your notes?</b><p>Your notes, highlights and prayers are kept only on this phone. Save a copy now and then, somewhere safe (for example in Files or iCloud Drive).</p>', [
      ['Back up now', () => tsk.backup().then(() => { s.lastBackup = new Date().toISOString(); saveUser(['settings']); toast('Saved. Keep the file somewhere safe.'); })],
      ['Later', () => {}],
    ]);
  }
  const b = await tsk.backupInfo().catch(() => ({}));
  if (b.dir) return; // backed up automatically
  s.backupNudged = new Date().toISOString();
  saveUser(['settings']);
  showNudge('<b>Keep a copy of your notes?</b><p>Choose a backup folder (for example inside OneDrive) and your notes, highlights and prayers are copied there automatically.</p>', [
    ['Choose a folder…', () => tsk.backupChoose()],
    ['Later', () => {}],
  ]);
}
{
  // after the start screen and anything else has had its turn: wait until nothing is open
  const prevInit = window.v3Init;
  window.v3Init = (u) => {
    if (prevInit) prevInit(u);
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      if (tries > 300) return clearInterval(t);
      if (tries < 4 || !state.books.length || !$('#modal').hidden || !$('#tour').hidden) return;
      clearInterval(t);
      nextNudge();
    }, 2000);
  };
}
// a backup saved from Settings counts too
$('#modal').addEventListener('click', (e) => {
  if (e.target.closest('[data-st="backup"]')) {
    state.settings.lastBackup = new Date().toISOString();
    saveUser(['settings']);
  }
});
