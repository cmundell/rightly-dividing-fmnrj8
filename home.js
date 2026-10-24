'use strict';
/* Later additions: swiping between chapters, What's New, medallions, the start screen and your name, Settings, Easton's Bible Dictionary and the book introductions.
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
// Medallions (3.16; badges before): milestones in memorizing Scripture and reading the Bible, each with a verse,
// to collect. Days in a row are counted too: the current run starts again if a day is missed, but your longest
// run is kept and a medallion, once earned, is never taken away. Pin three to Today, or share a picture of one.
// =====================================================================================================
/* global tsk, state, $, $$, esc, openModal, toast, saveUser, todayStr, COMMANDS */

// a memory verse counts as learned once you have said it correctly from memory three times, on separate days
const LEARNED_BOX = 3;

// every Scripture quotation here is checked word for word against the KJV by tools/check_quotes.py
const MEDALS = [
  { id: 'mem1', group: 'memory', n: 1, title: 'First verse hidden in your heart', verse: ['Psalm 119:11', 'Thy word have I hid in mine heart, that I might not sin against thee.'] },
  { id: 'mem5', group: 'memory', n: 5, title: 'Five verses learned', verse: ['Colossians 3:16', 'Let the word of Christ dwell in you richly in all wisdom'] },
  { id: 'mem10', group: 'memory', n: 10, title: 'Ten verses learned', verse: ['Deuteronomy 6:6', 'And these words, which I command thee this day, shall be in thine heart'] },
  { id: 'mem25', group: 'memory', n: 25, title: 'Twenty-five verses learned', verse: ['Psalm 119:97', 'O how love I thy law! it is my meditation all the day.'] },
  { id: 'mem50', group: 'memory', n: 50, title: 'Fifty verses learned', verse: ['Joshua 1:8', 'This book of the law shall not depart out of thy mouth; but thou shalt meditate therein day and night'] },
  { id: 'mem100', group: 'memory', n: 100, title: 'One hundred verses learned', verse: ['Psalm 1:2', 'But his delight is in the law of the LORD; and in his law doth he meditate day and night.'] },
  { id: 'run3', group: 'run', n: 3, title: 'Three days in a row', verse: ['Psalm 55:17', 'Evening, and morning, and at noon, will I pray, and cry aloud: and he shall hear my voice.'] },
  { id: 'run7', group: 'run', n: 7, title: 'A week in a row', verse: ['Psalm 119:164', 'Seven times a day do I praise thee because of thy righteous judgments.'] },
  { id: 'run30', group: 'run', n: 30, title: 'Thirty days in a row', verse: ['Psalm 92:2', 'To shew forth thy loving-kindness in the morning, and thy faithfulness every night'] },
  { id: 'run100', group: 'run', n: 100, title: 'One hundred days in a row', verse: ['Galatians 6:9', 'And let us not be weary in well doing: for in due season we shall reap, if we faint not.'] },
  { id: 'run365', group: 'run', n: 365, title: 'A whole year in a row', verse: ['Hebrews 12:1', 'let us run with patience the race that is set before us'] },
  { id: 'day7', group: 'days', n: 7, title: 'Seven days in the Word', verse: ['Psalm 119:105', 'Thy word is a lamp unto my feet, and a light unto my path.'] },
  { id: 'day30', group: 'days', n: 30, title: 'Thirty days in the Word', verse: ['Lamentations 3:23', 'They are new every morning: great is thy faithfulness.'] },
  { id: 'day100', group: 'days', n: 100, title: 'One hundred days in the Word', verse: ['Acts 17:11', 'they received the word with all readiness of mind, and searched the scriptures daily'] },
  { id: 'day365', group: 'days', n: 365, title: 'A year of days in the Word', verse: ['Psalm 119:103', 'How sweet are thy words unto my taste! yea, sweeter than honey to my mouth!'] },
  { id: 'day1000', group: 'days', n: 1000, title: 'A thousand days in the Word', verse: ['Isaiah 40:8', 'The grass withereth, the flower fadeth: but the word of our God shall stand for ever.'] },
  { id: 'law', group: 'whole', short: '5', title: 'The books of Moses, read through', verse: ['Deuteronomy 32:47', 'For it is not a vain thing for you; because it is your life'] },
  { id: 'psalms', group: 'whole', short: '150', title: 'The Psalms, read through', verse: ['Psalm 150:6', 'Let every thing that hath breath praise the LORD. Praise ye the LORD.'] },
  { id: 'gospels', group: 'whole', short: '4', title: 'The four Gospels, read through', verse: ['John 20:31', 'But these are written, that ye might believe that Jesus is the Christ, the Son of God'] },
  { id: 'nt', group: 'whole', short: 'NT', title: 'The New Testament, read through', verse: ['2 Timothy 3:16', 'All scripture is given by inspiration of God'] },
  { id: 'ot', group: 'whole', short: 'OT', title: 'The Old Testament, read through', verse: ['Luke 24:27', 'And beginning at Moses and all the prophets, he expounded unto them in all the scriptures the things concerning himself.'] },
  { id: 'bible', group: 'whole', short: '66', title: 'The whole Bible, read through', verse: ['Matthew 4:4', 'Man shall not live by bread alone, but by every word that proceedeth out of the mouth of God.'] },
  { id: 'first-walk', group: 'first', short: '1', title: 'First time with God', verse: ['Psalm 46:10', 'Be still, and know that I am God'] },
  { id: 'first-study', group: 'first', short: '1', title: 'First verse studied step by step', verse: ['2 Timothy 2:15', 'Study to shew thyself approved unto God, a workman that needeth not to be ashamed, rightly dividing the word of truth.'] },
  { id: 'first-note', group: 'first', short: '1', title: 'First note written', verse: ['Habakkuk 2:2', 'Write the vision, and make it plain upon tables'] },
  { id: 'early', group: 'first', short: '6', title: 'In the Word early in the morning', verse: ['Psalm 5:3', 'My voice shalt thou hear in the morning, O LORD; in the morning will I direct my prayer unto thee, and will look up.'] },
];
const BOOK_VERSE = ['John 5:39', 'Search the scriptures; for in them ye think ye have eternal life: and they are they which testify of me.'];
const MEDAL_GROUPS = {
  memory: { name: 'Memory verses', fill: ['#c2414b', '#8e2430'], icon: 'heart' },
  run: { name: 'Days in a row', fill: ['#2f6fb5', '#1c4a80'], icon: 'lamp' },
  days: { name: 'Days in the Word', fill: ['#d9a32c', '#a8761a'], icon: 'sun' },
  whole: { name: 'Reading the Bible through', fill: ['#6b4fa8', '#46317a'], icon: 'book' },
  first: { name: 'Firsts', fill: ['#1f8a7a', '#135e53'], icon: 'star' },
  book: { name: 'Books', fill: ['#3f8a4a', '#295e31'], icon: 'scroll' },
};

// the days you were in the Word (a chapter read, or time with God)
const wordDays = () => new Set([...Object.keys(state.readlog.days || {}), ...Object.keys(state.walk.days || {}), ...Object.values((state.walk.family || {}).done || {})]);
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// the current run counts back from today (or from yesterday, until today's reading); a missed day starts it again
function runOfDays() {
  const days = wordDays();
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let current = 0;
  while (days.has(dayKey(d))) {
    current += 1;
    d.setDate(d.getDate() - 1);
  }
  let longest = 0;
  let run = 0;
  let prev = null;
  for (const k of [...days].sort()) {
    const t = new Date(`${k}T12:00`);
    run = prev && Math.round((t - prev) / 864e5) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = t;
  }
  longest = Math.max(longest, current, (state.walk && state.walk.bestRun) || 0);
  return { current, longest, today: days.has(dayKey(new Date())) };
}

function medalProgress() {
  const mem = Object.values(state.memory || {}).filter((m) => (m.box || 0) >= LEARNED_BOX).length;
  const days = wordDays();
  const chs = state.readlog.chapters || {};
  const books = state.books.filter((b) => {
    for (let c = 1; c <= b.chapters; c++) if (!chs[`${b.id}:${c}`]) return false;
    return true;
  });
  const has = (from, to) => books.filter((b) => b.id >= from && b.id <= to).length === to - from + 1;
  const run = runOfDays();
  return {
    mem, days: days.size, run: run.longest, books,
    law: has(1, 5), psalms: has(19, 19), gospels: has(40, 43), nt: has(40, 66), ot: has(1, 39), bible: has(1, 66),
    'first-walk': Object.keys(state.walk.days || {}).length > 0,
    'first-study': !!(state.walk && state.walk.guided),
    'first-note': Object.values(state.notes || {}).some(Boolean),
    early: !!(state.walk && state.walk.early),
  };
}

function earnedNow(p) {
  const out = [];
  for (const m of MEDALS) {
    const ok = m.group === 'memory' ? p.mem >= m.n : m.group === 'days' ? p.days >= m.n : m.group === 'run' ? p.run >= m.n : p[m.id];
    if (ok) out.push(m.id);
  }
  for (const bk of p.books) out.push(`book${bk.id}`);
  return out;
}

const medalInfo = (id) => {
  if (id.startsWith('book')) {
    const b = state.books[Number(id.slice(4)) - 1] || {};
    return { id, group: 'book', short: b.abbr || '', title: `${b.name || ''}, read through`, verse: BOOK_VERSE };
  }
  return MEDALS.find((m) => m.id === id) || null;
};

let medalTimer = null;
let medalFirst = true;
function checkMedals() {
  if (!state.walk || !state.readlog || !state.books.length) return;
  // reading early in the morning (before 7)
  if (new Date().getHours() < 7 && wordDays().has(dayKey(new Date())) && !state.walk.early) state.walk.early = todayStr();
  const run = runOfDays();
  if (run.longest > (state.walk.bestRun || 0)) state.walk.bestRun = run.longest;
  state.walk.badges = state.walk.badges || {}; // where earned medallions are kept (named before 3.16)
  const got = state.walk.badges;
  const fresh = earnedNow(medalProgress()).filter((id) => !got[id]);
  if (!fresh.length) {
    medalFirst = false;
    return;
  }
  const quiet = medalFirst && !Object.keys(got).length; // progress made before medallions existed is recorded quietly
  for (const id of fresh) got[id] = todayStr();
  saveUser(['walk']);
  medalFirst = false;
  if (!quiet) toast(fresh.length > 1 ? `${fresh.length} new medallions! See Today › Medallions.` : `New medallion: ${medalInfo(fresh[0]).title}. See Today › Medallions.`);
}
// look again whenever reading, memory, notes or your walk is saved
{
  const prevSave = window.saveUser;
  window.saveUser = function (keys) {
    prevSave(keys);
    if ((keys || []).some((k) => k === 'readlog' || k === 'memory' || k === 'walk' || k === 'notes')) {
      clearTimeout(medalTimer);
      medalTimer = setTimeout(checkMedals, 900);
    }
  };
  const prevInit = window.v3Init;
  window.v3Init = (u) => {
    if (prevInit) prevInit(u);
    setTimeout(checkMedals, 2500);
  };
}

// the medallion itself: a coin in its group's colors with an engraved sign and a word or number
const MEDAL_ICONS = {
  heart: '<path d="M32 46s-13-8-13-17a7 7 0 0 1 13-3.5A7 7 0 0 1 45 29c0 9-13 17-13 17z"/>',
  lamp: '<path d="M19 38h22l-4 6H23z"/><path d="M41 38c4 0 6-3 6-5h-6"/><path d="M30 37c-3-3-2-7 2-11 1 4 4 6 2 11"/>',
  sun: '<circle cx="32" cy="33" r="7"/><path d="M32 19v5M32 42v5M18 33h5M41 33h5M22 23l3.5 3.5M38.5 39.5 42 43M42 23l-3.5 3.5M25.5 39.5 22 43"/>',
  book: '<path d="M18 26c5-2 10-2 14 1 4-3 9-3 14-1v17c-5-2-10-2-14 1-4-3-9-3-14-1z"/><path d="M32 27v17"/>',
  star: '<path d="M32 21l3.4 7 7.6 1.1-5.5 5.4 1.3 7.6L32 38.5l-6.8 3.6 1.3-7.6-5.5-5.4 7.6-1.1z"/>',
  scroll: '<path d="M22 22h18a4 4 0 0 1 0 8h-2v14H24a4 4 0 0 1 0-8h2V22"/><path d="M26 30h10M26 35h8"/>',
};
function medalSvg(m, on, size = 64) {
  const g = MEDAL_GROUPS[m.group];
  const [a, b] = on ? g.fill : ['#c9c4b8', '#a39d90'];
  const uid = `${m.id}-${on ? 1 : 0}-${Math.random().toString(36).slice(2, 7)}`;
  const label = m.short || String(m.n || '');
  return `<svg class="md-svg${on ? ' on' : ''}" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
    <defs><radialGradient id="g${uid}" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#ffffff" stop-opacity=".55"/><stop offset=".35" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient></defs>
    <circle cx="32" cy="32" r="30" fill="${b}"/><circle cx="32" cy="32" r="27.5" fill="url(#g${uid})"/>
    <circle cx="32" cy="32" r="23.5" fill="none" stroke="#ffffff" stroke-opacity="${on ? '.55' : '.4'}" stroke-width="1.2" stroke-dasharray="${on ? '0' : '2 2'}"/>
    <g fill="none" stroke="#ffffff" stroke-opacity="${on ? '.95' : '.75'}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" transform="translate(0 -6)">${MEDAL_ICONS[g.icon]}</g>
    <text x="32" y="54.5" text-anchor="middle" font-family="Georgia, serif" font-size="${label.length > 3 ? 9 : label.length > 2 ? 10.5 : 12}" font-weight="700" fill="#ffffff" fill-opacity="${on ? '1' : '.85'}">${esc(label)}</text></svg>`;
}

const fmtDate = (k) => new Date(`${k}T00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
function openMedals() {
  const p = medalProgress();
  const run = runOfDays();
  const got = (state.walk && state.walk.badges) || {};
  const pins = (state.walk && state.walk.showcase) || [];
  const card = (m, sub) => {
    const on = !!got[m.id];
    return `<div class="md-card${on ? ' on' : ''}" data-md="${m.id}">${medalSvg(m, on)}<div class="md-t"><b>${esc(m.title)}</b>
      <span class="md-sub">${on ? `Earned ${esc(fmtDate(got[m.id]))}` : esc(sub)}</span>
      ${on ? `<span class="md-v">“${esc(m.verse[1])}” <i>${esc(m.verse[0])}</i></span>
      <span class="md-acts"><button class="linkish" data-md-pin="${m.id}">${pins.includes(m.id) ? 'Unpin from Today' : 'Pin to Today'}</button><button class="linkish" data-md-share="${m.id}">Share a picture</button></span>` : ''}</div></div>`;
  };
  const group = (key, sub) => `<div class="section-title">${MEDAL_GROUPS[key].name}</div><div class="md-grid">${MEDALS.filter((m) => m.group === key).map((m) => card(m, sub(m))).join('')}</div>`;
  const n = Object.keys(got).length;
  const bookCards = state.books.map((b) => {
    const m = medalInfo(`book${b.id}`);
    const on = !!got[m.id];
    return `<span class="md-book${on ? ' on' : ''}" title="${esc(b.name)}${on ? ' — read through' : ''}" data-md="${m.id}">${medalSvg(m, on, 40)}</span>`;
  }).join('');
  openModal(`<div class="kicker">Medallions</div><h2 class="m-title">Faithful in the Word</h2>
    <p class="hint">${n ? `${n} collected. ` : ''}A medallion, once earned, is yours to keep.</p>
    <div class="md-run"><div><b>${run.current}</b><span>day${run.current === 1 ? '' : 's'} in a row${run.current && !run.today ? ' — read today to keep it going' : ''}</span></div>
      <div><b>${run.longest}</b><span>your longest run</span></div><div><b>${p.days}</b><span>days in the Word in all</span></div></div>
    ${group('memory', (m) => `${Math.min(p.mem, m.n)} of ${m.n} learned`)}
    <p class="hint">A verse counts as learned when you have said it correctly from memory three times, on separate days (Notes › Memory).</p>
    ${group('run', (m) => `${Math.min(run.current, m.n)} of ${m.n} days in a row`)}
    <p class="hint">Any day you read a chapter or spend time with God. Miss a day and the count starts again — the medallions you have earned stay.</p>
    ${group('days', (m) => `${Math.min(p.days, m.n)} of ${m.n} days`)}
    ${group('whole', () => 'Keep reading')}
    ${group('first', (m) => (m.id === 'early' ? 'Read or spend time with God before 7 in the morning' : m.id === 'first-study' ? 'Tap a verse › Study this verse, step by step' : 'Not yet'))}
    <div class="section-title">Books read through <span class="hint">· ${p.books.length} of 66</span></div>
    <div class="md-books">${bookCards}</div>
    <p class="md-v">“${esc(BOOK_VERSE[1])}” <i>${esc(BOOK_VERSE[0])}</i></p>`, 'm-medals');
}

// pin up to three to Today
function toggleShowcase(id) {
  const list = (state.walk.showcase = state.walk.showcase || []);
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1);
  else {
    if (list.length >= 3) list.shift();
    list.push(id);
  }
  saveUser(['walk']);
  toast(i >= 0 ? 'Unpinned' : 'Pinned to Today');
}
const showcaseHtml = () => {
  const got = (state.walk && state.walk.badges) || {};
  const pins = ((state.walk && state.walk.showcase) || []).filter((id) => got[id] && medalInfo(id));
  const run = runOfDays();
  return `<div class="td-medals"><button class="td-run" data-md-open="" title="Medallions">${medalSvg({ id: 'run', group: 'run', short: String(run.current) }, run.current > 0, 44)}<span><b>${run.current} day${run.current === 1 ? '' : 's'} in a row</b>${run.longest > run.current ? `Longest: ${run.longest}` : run.current ? 'Your best yet' : 'Read today to begin'}</span></button>
    ${pins.map((id) => `<button class="td-medal" data-md-open="${id}" title="${esc(medalInfo(id).title)}">${medalSvg(medalInfo(id), true, 44)}</button>`).join('')}</div>`;
};

// a picture of a medallion to share (phone: the share sheet; computer: saved as a file)
async function shareMedal(id) {
  const m = medalInfo(id);
  const got = (state.walk && state.walk.badges) || {};
  if (!m || !got[id]) return;
  const W = 1080;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = W;
  const c = cv.getContext('2d');
  c.fillStyle = '#fbf8f1';
  c.fillRect(0, 0, W, W);
  c.fillStyle = '#1f3a6b';
  c.fillRect(0, 0, W, 14);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(medalSvg(m, true, 64).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))}`;
  await img.decode();
  c.drawImage(img, W / 2 - 200, 110, 400, 400);
  c.textAlign = 'center';
  c.fillStyle = '#1f3a6b';
  c.font = 'bold 54px Georgia, serif';
  c.fillText(m.title, W / 2, 600, W - 120);
  c.fillStyle = '#6b6457';
  c.font = '32px system-ui, sans-serif';
  c.fillText(`Earned ${fmtDate(got[id])}`, W / 2, 655);
  // the verse, wrapped
  c.fillStyle = '#2b2a27';
  c.font = 'italic 40px Georgia, serif';
  const words = `“${m.verse[1]}”`.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (c.measureText(t).width > W - 200 && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  lines.push(line);
  let y = 750;
  for (const l of lines.slice(0, 5)) {
    c.fillText(l, W / 2, y);
    y += 54;
  }
  c.fillStyle = '#8a6d1f';
  c.font = '34px system-ui, sans-serif';
  c.fillText(`${m.verse[0]} (KJV)`, W / 2, y + 10);
  c.fillStyle = '#6b6457';
  c.font = '28px Georgia, serif';
  c.fillText('SEARCH THE SCRIPTURES', W / 2, W - 50);
  const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
  const file = new File([blob], `${m.title.replace(/[^A-Za-z0-9 ]/g, '').replace(/ +/g, '-')}.png`, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: m.title, text: `${m.title} — Search the Scriptures` });
    } catch { /* cancelled */ }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Picture saved');
}

// Today: the Medallions tile (built in walk.js) and the pinned ones; the command box knows them too
{
  COMMANDS.push(['Medallions', 'rewards milestones awards badges streak days in a row memory reading', () => openMedals()]);
  $('#modal').addEventListener('click', (e) => {
    if (e.target.closest('[data-td3="badges"]')) return openMedals();
    const o = e.target.closest('[data-md-open]');
    if (o) return openMedals();
    const pin = e.target.closest('[data-md-pin]');
    if (pin) {
      toggleShowcase(pin.dataset.mdPin);
      const y = $('#modal .modal-card') ? $('#modal .modal-card').scrollTop : 0;
      openMedals();
      if ($('#modal .modal-card')) $('#modal .modal-card').scrollTop = y;
      return;
    }
    const sh = e.target.closest('[data-md-share]');
    if (sh) shareMedal(sh.dataset.mdShare);
  });
  window.openMedals = openMedals;
  window.openBadges = openMedals; // older name
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
      <button role="menuitem" data-vm="guide" class="vm-guide">Study it step by step</button>
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
    else if (k === 'guide') startGuide(v.id);
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
  { key: 'teacher', title: 'What a trusted teacher said', what: 'Matthew Henry (1662–1714), a pastor, wrote short notes on the whole Bible. Here is what he said about this passage.' },
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
  const [x, words, comm] = await Promise.all([tsk.xrefs(id, 'kjv'), tsk.words(id).catch(() => []), tsk.commentary(id).catch(() => null)]);
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
  // Matthew Henry: the part on this verse — his section for it, or else the sentences that speak of it
  let teacher = '';
  if (comm && comm.html) {
    const vs = v.label.split(':')[1] ? Number(v.label.split(':')[1].split('-')[0]) : 0;
    const parts = comm.html.split(/(?=<p><b>Verses? \d)/);
    const hit = parts.find((p) => {
      const m = p.match(/^<p><b>Verses? (\d+)(?:[-–](\d+))?/);
      return m && vs >= Number(m[1]) && vs <= Number(m[2] || m[1]);
    });
    if (hit && hit.replace(/<[^>]+>/g, '').length < 2500) teacher = hit;
    else {
      const text = (hit || comm.html).replace(/<h4>[^]*?<\/h4>/g, ' ').replace(/<p><b>[^<]*<\/b><\/p>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      const sents = text.match(/[^.!?]+[.!?]+["”’]?/g) || [];
      const STOP = /^(that|this|with|from|unto|they|them|their|there|which|shall|have|hath|were|what|when|whom|whose|also|into|upon|said|saith|thee|thou|thine|your|ye|and|the|for|but|not|him|his|her|all|was|are|our|out)$/i;
      const keys = [...new Set((v.text.toLowerCase().match(/[a-z]{4,}/g) || []).filter((w) => !STOP.test(w)))];
      let best = -1, at = -1;
      sents.forEach((t, i) => {
        const low = t.toLowerCase();
        const n = keys.filter((k) => low.includes(k.slice(0, Math.max(4, k.length - 2)))).length;
        if (n > best) [best, at] = [n, i];
      });
      if (at >= 0 && best >= 2) teacher = `<p>${esc(sents.slice(Math.max(0, at - 1), at + 3).join(' ').trim())}</p><p class="hint">From his notes on ${esc(comm.label || 'this passage')}.</p>`;
    }
  }
  guide.data = { v, around, picks: picks.map((p) => ({ ...p, text: texts.get(p.start) || '' })), keyWords, teacher };
  renderGuide();
}

function renderGuide() {
  const { v, around, picks, keyWords, teacher } = guide.data;
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
  } else if (s.key === 'teacher') {
    body = teacher ? `<div class="gd-teacher">${typeof commHtml === 'function' ? commHtml(teacher) : teacher}</div>` : '<p class="hint">Matthew Henry has no note on this verse on its own. The Commentary tab has his notes on the whole passage.</p>';
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
  state.walk.guided = state.walk.guided || todayStr();
  saveUser(['walk']);
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
  const r = e.target.closest('.gd-teacher .ref');
  if (r) {
    closeModal();
    toReading();
    go({ id: Number(r.dataset.s), endId: Number(r.dataset.e) });
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
  comm: { line: 'Notes on this passage by Matthew Henry, a pastor (1662–1714).', tip: 'Matthew Henry wrote short notes on the whole Bible. Read the passage for yourself first, then see what he noticed — a teacher to learn from, with Scripture as the final word.', eg: '' },
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
  let introCache = {};
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
    if (!(b.id in introCache)) introCache[b.id] = await tsk.bookIntro(b.id).catch(() => null);
    const intro = introCache[b.id];
    const read = state.readlog && state.readlog.chapters ? state.readlog.chapters : {};
    const nRead = Array.from({ length: b.chapters }, (_, i) => read[`${b.id}:${i + 1}`]).filter(Boolean).length;
    const label = b.id === 19 ? 'Psalm' : 'Chapter';
    return `<div class="sg-book">
      <div class="sg-book-h"><span class="sg-book-n">${esc(b.name)}</span><span class="sg-book-c">${b.chapters} chapter${b.chapters === 1 ? '' : 's'}${nRead ? ` · ${nRead} read` : ''}</span>
        <button class="sg-about" data-sg-about="${b.id}" tabindex="-1">About ${esc(b.name)} ›</button></div>
      ${intro ? `<div class="sg-book-t">${esc(intro.th)}</div>` : ''}
      <div class="sg-chs" role="group" aria-label="${esc(b.name)} chapters">${Array.from({ length: b.chapters }, (_, i) => i + 1).map((c) => `<button class="sg-ch${read[`${b.id}:${c}`] ? ' read' : ''}${c === ch ? ' on' : ''}" data-sg-go="${b.id}:${c}" title="${label} ${c}${read[`${b.id}:${c}`] ? ' — read' : ''}">${c}</button>`).join('')}</div></div>`;
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
      html.push(`<div class="sg-sec">Books</div><div class="sg-books">${books.map((b) => `<button class="sg-item sg-bk" data-sg-book="${b.id}">${esc(b.name)}<span>${b.chapters} ch.</span></button>`).join('')}</div>`);
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
      if (hits.length) html.push(`<div class="sg-sec">In the KJV</div>${hits.map(([p, n]) => `<button class="sg-item sg-ph" data-sg-phrase="${esc(p)}"><span class="sg-q">${mark(p, words)}</span><span class="sg-n">${n} time${n === 1 ? '' : 's'}</span></button>`).join('')}`);
      if (q.length >= 3 && !books.length) {
        const [topics, people] = await Promise.all([tsk.naveSearch(q).catch(() => []), tsk.personSearch(q).catch(() => [])]);
        if (my !== seq) return;
        const ts = (topics || []).filter((t) => t.subject.toLowerCase().startsWith(words[0])).slice(0, 2);
        const ps = (people || []).slice(0, 2);
        if (ts.length || ps.length) {
          html.push(`<div class="sg-sec">Topics and people</div>${ts.map((t) => `<button class="sg-item sg-tp" data-sg-topic="${t.id}"><span class="sg-kind">Topic</span><span class="sg-q">${esc(t.subject.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()))}</span></button>`).join('')}
            ${ps.map((p) => `<button class="sg-item sg-pp" data-sg-person="${p.pid}"><span class="sg-kind">Person</span><span class="sg-q">${esc(p.name)}</span><span class="sg-n">${esc(String(p.note || '').split(/[.;]/)[0].slice(0, 50))}</span></button>`).join('')}`);
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
