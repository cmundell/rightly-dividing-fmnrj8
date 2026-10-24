'use strict';
/* Later additions: swiping between chapters, What's New, badges, the start screen and your name, Settings, Easton's Bible Dictionary and the book introductions.
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
  openModal(`<div class="kicker">Search the Scriptures</div><h2 class="m-title">What's new</h2>
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
// from v41.js
// =====================================================================================================
/* v3.11: badges — milestones in memorizing Scripture and reading the Bible, each with a verse. Nothing is ever
   taken away: there are no streaks to break and no leaderboards. Loaded after v40.js. */
/* global tsk, state, $, $$, esc, openModal, toast, saveUser, todayStr, COMMANDS */

// a memory verse counts as learned once you have said it correctly from memory three times, on separate days
const LEARNED_BOX = 3;

// every Scripture quotation here is checked word for word against the KJV by tools/check_v38_quotes.py
const BADGES = [
  { id: 'mem1', group: 'memory', n: 1, title: 'First verse hidden in your heart', verse: ['Psalm 119:11', 'Thy word have I hid in mine heart, that I might not sin against thee.'] },
  { id: 'mem5', group: 'memory', n: 5, title: 'Five verses learned', verse: ['Colossians 3:16', 'Let the word of Christ dwell in you richly in all wisdom'] },
  { id: 'mem10', group: 'memory', n: 10, title: 'Ten verses learned', verse: ['Deuteronomy 6:6', 'And these words, which I command thee this day, shall be in thine heart'] },
  { id: 'mem25', group: 'memory', n: 25, title: 'Twenty-five verses learned', verse: ['Psalm 119:97', 'O how love I thy law! it is my meditation all the day.'] },
  { id: 'mem50', group: 'memory', n: 50, title: 'Fifty verses learned', verse: ['Joshua 1:8', 'This book of the law shall not depart out of thy mouth; but thou shalt meditate therein day and night'] },
  { id: 'mem100', group: 'memory', n: 100, title: 'One hundred verses learned', verse: ['Psalm 1:2', 'But his delight is in the law of the LORD; and in his law doth he meditate day and night.'] },
  { id: 'day7', group: 'days', n: 7, title: 'Seven days in the Word', verse: ['Psalm 119:105', 'Thy word is a lamp unto my feet, and a light unto my path.'] },
  { id: 'day30', group: 'days', n: 30, title: 'Thirty days in the Word', verse: ['Lamentations 3:23', 'They are new every morning: great is thy faithfulness.'] },
  { id: 'day100', group: 'days', n: 100, title: 'One hundred days in the Word', verse: ['Acts 17:11', 'they received the word with all readiness of mind, and searched the scriptures daily'] },
  { id: 'day365', group: 'days', n: 365, title: 'A year of days in the Word', verse: ['Psalm 119:103', 'How sweet are thy words unto my taste! yea, sweeter than honey to my mouth!'] },
  { id: 'day1000', group: 'days', n: 1000, title: 'A thousand days in the Word', verse: ['Isaiah 40:8', 'The grass withereth, the flower fadeth: but the word of our God shall stand for ever.'] },
  { id: 'nt', group: 'whole', title: 'The New Testament, read through', verse: ['2 Timothy 3:16', 'All scripture is given by inspiration of God'] },
  { id: 'bible', group: 'whole', title: 'The whole Bible, read through', verse: ['Matthew 4:4', 'Man shall not live by bread alone, but by every word that proceedeth out of the mouth of God.'] },
];
const BOOK_VERSE = ['John 5:39', 'Search the scriptures; for in them ye think ye have eternal life: and they are they which testify of me.'];

function badgeProgress() {
  const mem = Object.values(state.memory || {}).filter((m) => (m.box || 0) >= LEARNED_BOX).length;
  const days = new Set([...Object.keys(state.readlog.days || {}), ...Object.keys(state.walk.days || {}), ...Object.values(state.walk.family.done || {})]);
  const chs = state.readlog.chapters || {};
  const books = state.books.filter((b) => {
    for (let c = 1; c <= b.chapters; c++) if (!chs[`${b.id}:${c}`]) return false;
    return true;
  });
  const has = (from, to) => books.filter((b) => b.id >= from && b.id <= to).length === to - from + 1;
  return { mem, days: days.size, books, nt: has(40, 66), bible: has(1, 66) };
}

function earnedNow(p) {
  const out = [];
  for (const b of BADGES) {
    const ok = b.group === 'memory' ? p.mem >= b.n : b.group === 'days' ? p.days >= b.n : p[b.id];
    if (ok) out.push(b.id);
  }
  for (const bk of p.books) out.push(`book${bk.id}`);
  return out;
}

const badgeTitle = (id) => {
  if (id.startsWith('book')) return `${(state.books[Number(id.slice(4)) - 1] || {}).name || ''}, read through`;
  return (BADGES.find((b) => b.id === id) || {}).title || '';
};

let badgeTimer = null;
let badgeFirst = true;
function checkBadges() {
  if (!state.walk || !state.readlog || !state.books.length) return;
  state.walk.badges = state.walk.badges || {};
  const got = state.walk.badges;
  const fresh = earnedNow(badgeProgress()).filter((id) => !got[id]);
  if (!fresh.length) {
    badgeFirst = false;
    return;
  }
  const quiet = badgeFirst && !Object.keys(got).length; // progress made before badges existed is recorded quietly
  for (const id of fresh) got[id] = todayStr();
  saveUser(['walk']);
  badgeFirst = false;
  if (!quiet) toast(`Badge: ${badgeTitle(fresh[fresh.length - 1])}. See Today › Badges.`);
}
// look again whenever reading, memory or your walk is saved
{
  const prevSave = window.saveUser;
  window.saveUser = function (keys) {
    prevSave(keys);
    if ((keys || []).some((k) => k === 'readlog' || k === 'memory' || k === 'walk')) {
      clearTimeout(badgeTimer);
      badgeTimer = setTimeout(checkBadges, 900);
    }
  };
  const prevInit = window.v3Init;
  window.v3Init = (u) => {
    if (prevInit) prevInit(u);
    setTimeout(checkBadges, 2500);
  };
}

const medal = (on, label) => `<svg class="bd-medal${on ? ' on' : ''}" viewBox="0 0 48 56" aria-hidden="true">
  <path d="M14 2h8l4 14h-8zM34 2h-8l-4 14h8z" class="rib"/><circle cx="24" cy="33" r="17" class="disc"/><circle cx="24" cy="33" r="12.5" class="ring"/>
  <text x="24" y="38" text-anchor="middle" class="lbl">${esc(label)}</text></svg>`;

function openBadges() {
  const p = badgeProgress();
  const got = (state.walk && state.walk.badges) || {};
  const card = (b, label, sub) => {
    const on = !!got[b.id];
    return `<div class="bd-card${on ? ' on' : ''}">${medal(on, label)}<div class="bd-t"><b>${esc(b.title)}</b>
      <span class="bd-sub">${on ? `Earned ${new Date(`${got[b.id]}T00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : esc(sub)}</span>
      ${on ? `<span class="bd-v">“${esc(b.verse[1])}” <i>${esc(b.verse[0])}</i></span>` : ''}</div></div>`;
  };
  const memNext = BADGES.find((b) => b.group === 'memory' && !got[b.id]);
  const dayNext = BADGES.find((b) => b.group === 'days' && !got[b.id]);
  const bookCells = state.books.map((b) => `<span class="bd-book${got[`book${b.id}`] ? ' on' : ''}" title="${esc(b.name)}${got[`book${b.id}`] ? ' — read through' : ''}">${esc(b.abbr)}</span>`).join('');
  openModal(`<div class="kicker">Badges</div><h2 class="m-title">Faithful in the Word</h2>
    <p class="hint">Milestones to give thanks for. Nothing is ever taken away — there are no streaks to break.</p>
    <div class="section-title">Memory verses <span class="hint">· ${p.mem} learned${memNext ? ` · next at ${memNext.n}` : ''}</span></div>
    <div class="bd-grid">${BADGES.filter((b) => b.group === 'memory').map((b) => card(b, String(b.n), `${Math.min(p.mem, b.n)} of ${b.n}`)).join('')}</div>
    <p class="hint">A verse counts as learned when you have said it correctly from memory three times, on separate days (Notes › Memory).</p>
    <div class="section-title">Days in the Word <span class="hint">· ${p.days} in all${dayNext ? ` · next at ${dayNext.n}` : ''}</span></div>
    <div class="bd-grid">${BADGES.filter((b) => b.group === 'days').map((b) => card(b, String(b.n), `${Math.min(p.days, b.n)} of ${b.n}`)).join('')}</div>
    <p class="hint">Any day you read a chapter or spend time with God. Days do not need to be in a row.</p>
    <div class="section-title">Reading the Bible through <span class="hint">· ${p.books.length} of 66 books</span></div>
    <div class="bd-grid">${BADGES.filter((b) => b.group === 'whole').map((b) => card(b, b.id === 'nt' ? 'NT' : '66', b.id === 'nt' ? `${p.books.filter((x) => x.id >= 40).length} of 27 books` : `${p.books.length} of 66 books`)).join('')}</div>
    <div class="bd-books">${bookCells}</div>
    <p class="bd-v">“${esc(BOOK_VERSE[1])}” <i>${esc(BOOK_VERSE[0])}</i></p>`, 'm-badges');
}

// the Badges tile on Today (built in walk.js); the command box knows it too
{
  COMMANDS.push(['Badges', 'rewards milestones awards memory reading', () => openBadges()]);
  $('#modal').addEventListener('click', (e) => {
    if (e.target.closest('[data-td3="badges"]')) openBadges();
  });
  window.openBadges = openBadges;
}

// =====================================================================================================
// from v42.js
// =====================================================================================================
/* v3.13: gentle reminders set aside; Morning and Evening moved off the toolbar (it stays on Today, in the Go menu
   and in the phone's Menu). Switches for the Today screen and the prayer list (FEATURES.today, FEATURES.prayer).
   Loaded after v41.js. */
/* global tsk, state, $, $$, FEATURES, COMMANDS, TOUR, beginWalk, switchTab, v32, renderMarks */

const dropCommand = (label) => {
  for (let i = COMMANDS.length - 1; i >= 0; i--) if (COMMANDS[i][0] === label) COMMANDS.splice(i, 1);
};

// (Morning and Evening has no toolbar button: index.html; it is on Today and in the Go menu)

// ---------------------------------------------------------------- gentle reminders set aside
if (!FEATURES.reminders) {
  dropCommand('Gentle reminders');
  // nothing left switched on from before: the app no longer opens itself at sign-in
  tsk.openAtLogin(false).catch(() => {});
}

// ---------------------------------------------------------------- prayer list switch
if (FEATURES.prayer === false) {
  dropCommand('Prayer list');
  tsk.onMenu((cmd) => {
    if (cmd === 'prayers') switchTab('marks');
  });
}

// ---------------------------------------------------------------- the prayer list switch (FEATURES.prayer)
{
  // Time with God: no prayer list in the Pray step when it is switched off
  const prevWalk = window.renderWalk;
  window.renderWalk = async function () {
    await prevWalk();
    if (FEATURES.prayer === false) {
      $$('#modal .wk-plist, #modal [data-wk-form="prayer"]').forEach((e) => e.remove());
      $$('#modal .section-title').forEach((e) => /prayer list/i.test(e.textContent) && e.remove());
      $$('#modal .hint').forEach((e) => /prayer list is empty/i.test(e.textContent) && e.remove());
    }
  };
}

// ---------------------------------------------------------------- Today screen switch: Time with God opens directly
if (FEATURES.today === false) {
  const t = $('#btnToday');
  if (t) t.hidden = true;
  window.openToday = () => beginWalk();
  dropCommand('Today — time with God');
  for (let i = TOUR.length - 1; i >= 0; i--) if (TOUR[i].el === '#btnToday') TOUR.splice(i, 1);
}

// =====================================================================================================
// from v43.js
// =====================================================================================================
/* v3.13: a start screen. Today greets you the first time you open the app each day (it can be switched off in
   Reading options), with an "Open your Bible" button that takes you straight to where you left off. The very
   first time the app is opened it asks your name, once, for the greeting. Loaded after v42.js. */
/* global tsk, state, $, esc, openModal, closeModal, saveUser, todayStr, FEATURES */

// ---------------------------------------------------------------- your name, asked once on the very first open
function askName(then) {
  openModal(`<h2 class="m-title nm-title">Welcome to Search the Scriptures, friend!</h2>
    <p class="nm-q">What is your name?</p>
    <p class="hint">So we can greet you each day. It stays on this device.</p>
    <form class="nm-form"><input id="nmInput" type="text" autocomplete="given-name" maxlength="40" placeholder="Your first name" />
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
/* v3.14: Easton's Bible Dictionary in the word card; an introduction to every book of the Bible; one Settings page
   (the text, your name, the start screen and your notes). Loaded after v43.js. */
/* global tsk, state, $, $$, esc, openModal, closeModal, saveUser, toast, go, hideWordCard, COMMANDS, TOUR, isPhone, setView */

const onPhone = () => typeof isPhone === 'function' && isPhone();
const toReading = () => typeof setView === 'function' && onPhone() && setView('read');

// ---------------------------------------------------------------- Easton's Bible Dictionary, in the word card
const eastonHtml = (entry, all) => {
  const paras = all ? entry.p : entry.p.slice(0, 1);
  return paras.map((p) => `<p>${p}</p>`).join(''); // Easton's own text; references are links (built by tools/build_easton.py)
};
{
  const prevCard = window.showWordCard;
  window.showWordCard = async (word, rect, verseId, ti, tc) => {
    await prevCard(word, rect, verseId, ti, tc);
    const card = $('#wordcard');
    if (card.hidden || $('.wc-easton', card)) return;
    const entry = await tsk.easton(word).catch(() => null);
    if (!entry || card.hidden || $('.wc-easton', card) || $('h4', card).textContent !== word) return;
    const more = entry.p.length > 1;
    const sec = `<div class="wc-label">Easton's Bible Dictionary</div>
      <div class="wc-easton" data-key="${esc(entry.key)}">${entry.t.toLowerCase() !== word.toLowerCase() ? `<div class="hint">Entry: ${esc(entry.t.toUpperCase())}</div>` : ''}
      <div class="eb-body">${eastonHtml(entry, false)}</div>${more ? '<button class="linkish" data-eb="more">Read the whole entry</button>' : ''}</div>`;
    const more1828 = $('.more', card);
    if (more1828) more1828.insertAdjacentHTML('beforebegin', sec);
    else card.insertAdjacentHTML('beforeend', sec);
    if (!onPhone()) {
      const r = card.getBoundingClientRect();
      if (r.bottom > window.innerHeight - 12) card.style.top = `${Math.max(12, window.innerHeight - r.height - 12)}px`;
    }
  };
  $('#wordcard').addEventListener('click', async (e) => {
    if (e.target.closest('[data-eb="more"]')) {
      const box = e.target.closest('.wc-easton');
      const entry = await tsk.eastonEntry(box.dataset.key);
      if (entry) $('.eb-body', box).innerHTML = eastonHtml(entry, true);
      e.target.remove();
      return;
    }
    const r = e.target.closest('.wc-easton .ref');
    if (r) {
      hideWordCard();
      toReading();
      go({ id: Number(r.dataset.s), endId: Number(r.dataset.e) });
    }
  });
}

// ---------------------------------------------------------------- About this book
async function openBookIntro(bookId) {
  const d = await tsk.bookIntro(bookId);
  const bk = state.books[bookId - 1];
  if (!d || !bk) return;
  const [kv] = d.k ? await tsk.versesByIds([d.k]) : [];
  const ch = (a, b) => (a === b ? `${a}` : `${a}–${b}`);
  const single = bk.chapters === 1;
  openModal(`<div class="kicker">About this book</div><h2 class="m-title">${esc(bk.name)}</h2>
    <dl class="bi-facts">
      <dt>Written by</dt><dd>${esc(d.a)}</dd>
      <dt>When</dt><dd>${esc(d.w)}</dd>
      <dt>Written to</dt><dd>${esc(d.to)}</dd>
      <dt>Theme</dt><dd>${esc(d.th)}</dd>
    </dl>
    ${kv ? `<blockquote class="td-invite bi-key">“${esc(kv.text)}” <span><button class="linkish" data-bi-go="${kv.id}">${esc(kv.label)}</button></span></blockquote>` : ''}
    <div class="section-title">Outline</div>
    <ol class="bi-outline">${d.o.map(([a, b, t]) => `<li><button data-bi-ch="${a}">${single ? '' : `<span class="bi-ch">${bookId === 19 ? (a === b ? 'Psalm' : 'Psalms') : a === b ? 'Chapter' : 'Chapters'} ${ch(a, b)}</span>`}${esc(t)}</button></li>`).join('')}</ol>
    ${d.e ? `<details class="bi-easton"><summary>Read more in Easton's Bible Dictionary</summary><div class="eb-body" data-key="${esc(d.e)}"><p class="hint">Loading…</p></div></details>` : ''}
    <p class="hint bi-note">Where Scripture does not name the writer, this says so and gives the traditional view.</p>`, 'm-bookintro');
  $('#modal').dataset.book = bookId;
}
$('#modal').addEventListener('click', (e) => {
  if (!$('#modal').classList.contains('m-bookintro')) return;
  const book = Number($('#modal').dataset.book);
  const c = e.target.closest('[data-bi-ch]');
  const v = e.target.closest('[data-bi-go]');
  const r = e.target.closest('.bi-easton .ref');
  if (!c && !v && !r) return;
  closeModal();
  toReading();
  if (c) go({ book, ch: Number(c.dataset.biCh) });
  else if (v) go({ id: Number(v.dataset.biGo) });
  else go({ id: Number(r.dataset.s), endId: Number(r.dataset.e) });
});
$('#modal').addEventListener('toggle', async (e) => {
  const det = e.target.closest && e.target.closest('.bi-easton');
  if (!det || !det.open) return;
  const body = $('.eb-body', det);
  if (body.dataset.done) return;
  const entry = await tsk.eastonEntry(body.dataset.key);
  body.innerHTML = entry ? eastonHtml(entry, true) : '<p class="hint">Not found.</p>';
  body.dataset.done = '1';
}, true);
// a quiet link under each chapter heading
new MutationObserver(() => {
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
COMMANDS.push(['About this book', 'introduction author date theme outline book', () => openBookIntro(state.cur.book)]);
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
      <button role="menuitem" data-vm="note">Write a note</button>
      <button role="menuitem" data-vm="copy">Copy verse</button>
      <button role="menuitem" data-vm="memory">${state.memory[id] ? 'Remove from memory verses' : 'Memorize'}</button>
      <div class="vm-sep"></div>
      <button role="menuitem" data-vm="lesson" data-act="lessonAdd">Add to a lesson…</button>
      <button role="menuitem" data-vm="pin">Pin above the text</button>`;
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
