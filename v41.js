'use strict';
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
    <p class="hint">Any day you read a chapter, spend time with God or have family devotions. Days do not need to be in a row.</p>
    <div class="section-title">Reading the Bible through <span class="hint">· ${p.books.length} of 66 books</span></div>
    <div class="bd-grid">${BADGES.filter((b) => b.group === 'whole').map((b) => card(b, b.id === 'nt' ? 'NT' : '66', b.id === 'nt' ? `${p.books.filter((x) => x.id >= 40).length} of 27 books` : `${p.books.length} of 66 books`)).join('')}</div>
    <div class="bd-books">${bookCells}</div>
    <p class="bd-v">“${esc(BOOK_VERSE[1])}” <i>${esc(BOOK_VERSE[0])}</i></p>`, 'm-badges');
}

// Today: a Badges tile; the command box knows it too
{
  const prevToday = window.openToday;
  window.openToday = async function () {
    await prevToday();
    const tiles = $('#modal .td-tiles');
    if (!tiles) return;
    const n = Object.keys((state.walk && state.walk.badges) || {}).length;
    tiles.insertAdjacentHTML('beforeend', `<button data-td3="badges"><b>Badges</b><span>${n ? `${n} earned` : 'Milestones in memorizing and reading'}</span></button>`);
  };
  COMMANDS.push(['Badges', 'rewards milestones awards memory reading', () => openBadges()]);
  $('#modal').addEventListener('click', (e) => {
    if (e.target.closest('[data-td3="badges"]')) openBadges();
  });
  window.openBadges = openBadges;
}
