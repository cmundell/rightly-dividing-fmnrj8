'use strict';
/* Today, the gospel, the prayer list and journal, ways to practise memory verses; study methods.
   Merged in 3.15 from the per-release layers (v38.js, v381.js, v39.js), kept in their original order: later
   sections still extend earlier ones by wrapping window.X. */

// =====================================================================================================
// from v38.js
// =====================================================================================================
/* v3.8: Daily walk — Today, the gospel,
   prayer list, journal and more ways to practise memory verses.
   Loaded after v37.js; overrides use window.X so earlier code picks them up. */
/* global tsk, state, $, $$, esc, go, toast, switchTab, saveUser, openModal, closeModal, todayStr, renderMarks, setTags,
   openPlan, planStatus, openDaily, openProgress, readingStats, markRead, v32, v33, startPractice, showPracticeCard,
   gradePractice, toggleMemory, MEMO_DAYS, WORD_RE, marksSwitch, newId, TOUR, openQuickStart, COMMANDS, bookName */

const v38 = {
  gospel: null,
  journalQ: '',
};
const dkey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const longDate = (k) => new Date(`${k}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const shortDate = (k) => new Date(`${k}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

// gentle invitations from Scripture (checked word for word against the KJV by the 3.8 tests)
const INVITES = [
  ['Psalm 46:10', 'Be still, and know that I am God.'],
  ['James 4:8', 'Draw nigh to God, and he will draw nigh to you.'],
  ['Psalm 119:105', 'Thy word is a lamp unto my feet, and a light unto my path.'],
  ['Matthew 11:28', 'Come unto me, all ye that labour and are heavy laden, and I will give you rest.'],
  ['Psalm 34:8', 'O taste and see that the LORD is good.'],
  ['Psalm 5:3', 'My voice shalt thou hear in the morning, O LORD.'],
  ['Lamentations 3:22-23', 'His compassions fail not. They are new every morning: great is thy faithfulness.'],
];
const PRAYER_CATS = ['Family', 'Church', 'Friends', 'Those who need Christ', 'Missions', 'Our nation and leaders', 'Myself', 'Thanksgiving'];
// ===================================================================== data + hooks
{
  const prevInit = window.v3Init;
  window.v3Init = (u) => {
    if (prevInit) prevInit(u);
    state.journal = Array.isArray(u.journal) ? u.journal : [];
    state.prayers = Array.isArray(u.prayers) ? u.prayers : [];
    const w = u.walk && typeof u.walk === 'object' ? u.walk : {};
    state.walk = {
      days: w.days || {},
    };
  };
}
state.journal = state.journal || [];
state.prayers = state.prayers || [];
state.walk = state.walk || { days: {} };

async function loadGospel() {
  if (!v38.gospel) v38.gospel = await tsk.gospel();
  return v38.gospel;
}

// ===================================================================== gentle progress (no pressure)
function walkedOn(k) {
  return !!(state.walk.days[k] || (state.readlog && state.readlog.days[k]));
}
/** Days in a row with God's Word, with grace: one missed day in any seven doesn't break the walk. */
function weekSummary() {
  const d = new Date();
  let days = 0, chapters = 0;
  for (let i = 0; i < 7; i++) {
    const k = dkey(d);
    if (walkedOn(k)) days += 1;
    chapters += (state.readlog && state.readlog.days[k]) || 0;
    d.setDate(d.getDate() - 1);
  }
  return { days, chapters };
}
const inviteFor = (k) => INVITES[[...k].reduce((a, c) => a + c.charCodeAt(0), 0) % INVITES.length];

// ===================================================================== Today
async function openToday() {
  const today = todayStr();
  const w = weekSummary();
  const [ref, text] = inviteFor(today);
  const due = Object.values(state.memory || {}).filter((m) => m.due <= today).length;
  const open = state.prayers.filter((p) => !p.answered).length;
  const hr = new Date().getHours();
  const hello = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  const ps = typeof planStatus === 'function' ? planStatus() : null;
  const planToday = ps && !ps.finished ? ps.days[ps.today] || [] : [];
  const name = state.settings.name;
  const bk = state.books[(state.cur.book || 1) - 1];
  openModal(`<div class="kicker">${esc(longDate(today))}</div>
    <h2 class="m-title">${hello}${name ? `, ${esc(name)}` : ''}</h2>
    <blockquote class="td-invite">“${esc(text)}” <span>${esc(ref)}</span></blockquote>
    ${bk ? `<button class="td-open" data-td4="open">Open your Bible<span>Continue in ${esc(bk.name)} ${state.cur.ch}</span></button>` : ''}
    <div class="td-tiles">
      <button data-td2="study"><b>Study methods</b><span>Guided worksheets: observe, words, people, topics</span></button>
      ${FEATURES.prayer === false ? '' : `<button data-td="prayers"><b>Prayer list</b><span>${open ? `${open} request${open === 1 ? '' : 's'} you are praying for` : 'Keep a list of what you are praying for'}</span></button>`}
      <button data-td="memory"><b>Memory verses</b><span>${due ? `${due} to practise today` : `${Object.keys(state.memory || {}).length || 'No'} verse${Object.keys(state.memory || {}).length === 1 ? '' : 's'} hidden in your heart`}</span></button>
      <button data-td="plan"><b>Reading plan</b><span>${planToday.length ? `Today: ${esc(planLabel(planToday))}` : ps && ps.finished ? 'Plan finished — well done' : 'Choose a plan to read through the Bible'}</span></button>
      <button data-td="daily"><b>Devotional</b><span>Spurgeon's Morning and Evening for today</span></button>
      <button data-td="journal"><b>Journal</b><span>${state.journal.length ? `${state.journal.length} entr${state.journal.length === 1 ? 'y' : 'ies'}` : 'Write down what God is teaching you'}</span></button>
      <button data-td="gospel" class="td-gospel"><b>The Gospel</b><span>How to be saved — to read, print or share</span></button>
    </div>
    <div class="td-quiet" title="Days with God's Word: a chapter read">
      This week: ${w.days} day${w.days === 1 ? '' : 's'} in the Word · ${w.chapters} chapter${w.chapters === 1 ? '' : 's'}
    </div>`, 'm-today');
}

function planLabel(list) {
  if (!list.length) return '';
  const byBook = [];
  for (const [b, c] of list) {
    const last = byBook[byBook.length - 1];
    if (last && last.b === b && last.c2 === c - 1) last.c2 = c;
    else byBook.push({ b, c1: c, c2: c });
  }
  return byBook.map((x) => `${bookName(x.b)} ${x.c1}${x.c2 !== x.c1 ? `–${x.c2}` : ''}`).join('; ');
}

function sheetPage(title, inner) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    body{font:12.5pt/1.55 Georgia,'Times New Roman',serif;color:#1d2433;max-width:7in;margin:0.4in auto;padding:0 0.3in}
    h1{font-size:22pt;color:#1f3a6b;margin:0 0 4pt}h2{font-size:14pt;color:#1f3a6b;margin:16pt 0 4pt;font-family:'Segoe UI',Arial,sans-serif}
    .k{font:9pt 'Segoe UI',Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#8a6414}
    blockquote{margin:6pt 0 10pt;padding:6pt 12pt;border-left:3pt solid #b8892b;background:#f7f3ea}
    blockquote cite{display:block;font:9.5pt 'Segoe UI',Arial,sans-serif;color:#5b6476;margin-top:3pt;font-style:normal}
    sup{font-size:7pt;color:#8a6414;margin-right:1pt}ol,ul{margin:4pt 0 8pt 18pt;padding:0}li{margin:2pt 0}
    .f{margin-top:22pt;font:8.5pt 'Segoe UI',Arial,sans-serif;color:#8a8f99}
    @media print{body{margin:0 auto}}</style></head><body>${inner}<div class="f">Scripture from the King James Version. Made with Rightly Dividing.</div></body></html>`;
}

// ===================================================================== the gospel
async function openGospel() {
  const g = await loadGospel();
  // Word for word from the tract "A Heavenly Home" (see tools/build_gospel.py): nothing here is reworded.
  openModal(`<h2 class="m-title gs-title">${esc(g.title)}</h2>
    ${g.meaning ? `<p class="gs-meaning">${esc(g.meaning)}</p>` : ''}
    <h3 class="gs-name">${esc(g.name)}</h3>
    <p class="gs-intro">${esc(g.intro)}</p>
    ${g.sections.map((s) => `<section class="gs-sec"><h3>${esc(s.head)}</h3>
      <blockquote class="gs-verse"><span class="gs-q">${esc(s.quote)}</span> <button class="gs-ref" data-dvgo="${s.s}" title="Open in the Bible">${esc(s.ref)}</button></blockquote>
      ${s.p.map((t) => `<p class="gs-p">${esc(t)}</p>`).join('')}</section>`).join('')}
    ${g.closing ? `<p class="gs-close">${esc(g.closing)}</p>` : ''}
    <a class="gs-film" href="${esc(g.film.url)}" target="_blank" rel="noopener">
      <span class="gs-play" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg></span>
      <span class="gs-film-t"><b>Watch ${esc(g.film.title)}</b><small>${esc(g.film.by)} · YouTube · needs internet</small></span>
      <span class="gs-film-go" aria-hidden="true">&#8250;</span></a>
    <div class="fm-foot"><button data-gs="print">Print</button><button data-gs="pdf">Save as PDF</button><button data-gs="html" title="A web page anyone can open — to email or put on a USB stick">Save to share</button></div>`, 'm-gospel');
}

async function gospelPage() {
  const g = await loadGospel();
  return sheetPage(g.title, `<h1>${esc(g.title)}</h1>
    ${g.meaning ? `<p style="font-style:italic;color:#8a6414;margin-top:0">${esc(g.meaning)}</p>` : ''}
    <h2>${esc(g.name)}</h2><p>${esc(g.intro)}</p>
    ${g.sections.map((s) => `<h2>${esc(s.head)}</h2><blockquote>${esc(s.quote)} <cite>${esc(s.ref)}</cite></blockquote>
      ${s.p.map((t) => `<p>${esc(t)}</p>`).join('')}`).join('')}
    ${g.closing ? `<p style="font-weight:600">${esc(g.closing)}</p>` : ''}
    <p>Watch ${esc(g.film.title)} (${esc(g.film.by)}): <a href="${esc(g.film.url)}">${esc(g.film.url)}</a></p>`);
}

// ===================================================================== prayer list (Notes › Prayer)
function renderPrayers() {
  const open = state.prayers.filter((p) => !p.answered);
  const answered = state.prayers.filter((p) => p.answered).sort((a, b) => b.answered.localeCompare(a.answered));
  const byCat = PRAYER_CATS.map((c) => [c, open.filter((p) => p.cat === c)]).filter(([, l]) => l.length);
  const tagged = Object.entries(state.tags || {}).filter(([, t]) => (t || []).includes('prayer')).map(([id]) => Number(id));
  const item = (p) => `<div class="pr-item" data-pr="${p.id}"><div class="pr-t">${esc(p.text)}</div>
      <div class="pr-meta">since ${esc(shortDate(p.added))}${p.lastPrayed ? ` · prayed ${esc(shortDate(p.lastPrayed))}` : ''}</div>
      <div class="pr-btns"><button data-pra="answer">Answered</button><button class="del" data-pra="rm" title="Remove">&times;</button></div></div>`;
  $('#pane-marks').innerHTML = `${marksSwitch()}
    <form class="pr-add" data-pr-form><input id="prText" placeholder="What are you praying for?" aria-label="Prayer request" />
      <select id="prCat" aria-label="Category">${PRAYER_CATS.map((c) => `<option>${esc(c)}</option>`).join('')}</select><button class="primary-btn">Add</button></form>
    ${byCat.length ? byCat.map(([c, l]) => `<div class="section-title">${esc(c)}</div>${l.map(item).join('')}`).join('') : '<div class="empty">“Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God.” <br><span class="hint">Philippians 4:6</span><br><br>Add the people and needs you are praying for. When God answers, mark it answered and write how — it becomes a record of His faithfulness.</div>'}
    ${answered.length ? `<details class="pr-ans" open><summary>Answered prayers (${answered.length})</summary>${answered.map((p) => `<div class="pr-item ans" data-pr="${p.id}"><div class="pr-t">${esc(p.text)}</div>
        <div class="pr-meta"><span class="answered-badge">Answered</span> ${esc(shortDate(p.answered))}${p.answer ? ` — ${esc(p.answer)}` : ''}</div>
        <div class="pr-btns"><button data-pra="reopen" title="Move back to the list">Keep praying</button><button class="del" data-pra="rm" title="Remove">&times;</button></div></div>`).join('')}</details>` : ''}
    ${tagged.length ? `<div class="section-title">Prayer journal notes on verses</div><div class="pr-tagged">${tagged.map((id) => `<span class="ref nref" data-s="${id}" data-e="${id}" data-tagged="${id}">…</span>`).join('')}</div>` : ''}`;
  if (tagged.length) {
    tsk.versesByIds(tagged).then((vs) => vs.forEach((v) => {
      const el = $(`#pane-marks [data-tagged="${v.id}"]`);
      if (el) el.textContent = v.label;
    }));
  }
}

function answerPrayer(id) {
  const el = $(`#pane-marks [data-pr="${id}"]`);
  if (!el || $('.pr-answer', el)) return;
  el.insertAdjacentHTML('beforeend', `<form class="pr-answer" data-pr-ans="${id}"><input placeholder="How did God answer? (optional)" aria-label="How God answered" /><button class="primary-btn">Save</button></form>`);
  $('.pr-answer input', el).focus();
}

// ===================================================================== journal (Notes › Journal)
function renderJournal() {
  const q = v38.journalQ.toLowerCase();
  const text = (e) => [e.read, e.prayer, e.text, ...Object.values(e.answers || {})].join(' ').toLowerCase();
  const list = state.journal.slice().sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || ''))).filter((e) => !q || text(e).includes(q));
  const months = [];
  for (const e of list) {
    const m = e.date.slice(0, 7);
    if (!months.length || months[months.length - 1][0] !== m) months.push([m, []]);
    months[months.length - 1][1].push(e);
  }
  const label = { god: 'About God', respond: 'To obey, trust, turn from or follow', apply: 'Living it today' };
  $('#pane-marks').innerHTML = `${marksSwitch()}
    <div class="jr-bar"><input id="jrSearch" type="search" placeholder="Search your journal" value="${esc(v38.journalQ)}" aria-label="Search your journal" />
      <button class="primary-btn" data-jr="new">New entry</button></div>
    ${state.journal.length ? '' : '<div class="empty">Write down what God is teaching you: what you read, what it showed you, and what you prayed. Saved study worksheets appear here too.</div>'}
    ${months.map(([m, es]) => `<div class="section-title">${new Date(`${m}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>
      ${es.map((e) => `<div class="jr-entry" data-jr-id="${e.id}"><div class="jr-top"><b>${esc(longDate(e.date))}</b>${e.read ? ` · <span class="ref" data-jr-read="${e.id}">${esc(e.read)}</span>` : ''}<button class="del" data-jr="rm" title="Delete this entry">&times;</button></div>
        ${Object.entries(e.answers || {}).map(([k, v]) => `<div class="jr-a"><i>${esc(label[k] || k)}</i>${esc(v)}</div>`).join('')}
        ${e.text ? `<div class="jr-a">${esc(e.text)}</div>` : ''}${e.prayer ? `<div class="jr-a"><i>Prayer</i>${esc(e.prayer)}</div>` : ''}
        ${e.carry ? `<div class="jr-a"><i>Verse to carry</i><span class="ref nref" data-s="${e.carry}" data-e="${e.carry}" data-jr-carry="${e.carry}">…</span></div>` : ''}</div>`).join('')}`).join('')}
    ${!list.length && state.journal.length ? '<div class="empty">No entries match.</div>' : ''}`;
  const carries = [...new Set(list.map((e) => e.carry).filter(Boolean))];
  if (carries.length) tsk.versesByIds(carries).then((vs) => vs.forEach((v) => $$(`#pane-marks [data-jr-carry="${v.id}"]`).forEach((el) => (el.textContent = `${v.label} — “${v.text.length > 80 ? `${v.text.slice(0, 80)}…` : v.text}”`))));
}

function newJournalEntry() {
  if ($('#pane-marks .jr-new')) return;
  $('#pane-marks .jr-bar').insertAdjacentHTML('afterend', `<form class="jr-new" data-jr-form><textarea rows="5" placeholder="What is God teaching you?" aria-label="Journal entry"></textarea><div class="plan-foot"><button type="button" data-jr="cancel">Cancel</button><button class="primary-btn">Save</button></div></form>`);
  $('#pane-marks .jr-new textarea').focus();
}

// Notes tab: Prayer and Journal views beside Notes, Lessons and Memory
{
  // (the Prayer and Journal buttons are in marksSwitch, study.js)
  const prevRender = window.renderMarks;
  window.renderMarks = async function () {
    if (v32.marksView === 'prayer') return renderPrayers();
    if (v32.marksView === 'journal') return renderJournal();
    return prevRender();
  };
}
function showMarksView(view) {
  closeModal();
  v32.marksView = view;
  switchTab('marks');
  renderMarks();
}

// ===================================================================== memory practice: more ways
{
  const origPractice = window.showPracticeCard;
  const prevPractice = async function () {
    await origPractice();
    const p = v33.practice;
    const b = $('#modal .mem-btns');
    if (p && b && (p.stage === 'ref' || p.stage === 'hint')) {
      b.insertAdjacentHTML('afterbegin', '<button data-memx="blanks">Fill in the blanks</button><button data-memx="type">Type it out</button>');
    }
  };
  window.showPracticeCard = async function () {
    const p = v33.practice;
    if (!p || p.i >= p.queue.length || !['blanks', 'type', 'typed'].includes(p.stage)) return prevPractice();
    const id = p.queue[p.i];
    const [v] = await tsk.versesByIds([id]);
    let inner = '';
    if (p.stage === 'blanks') {
      let k = 0;
      inner = `<div class="mem-text mem-blanks">${v.text.replace(WORD_RE, (w) => ((k++ % 3 === 1) ? `<button class="mb" data-w="${esc(w)}" title="Click to see the word">${'_'.repeat(Math.max(2, w.length))}</button>` : esc(w)))}</div>
        <div class="hint">Say the verse, filling in each blank. Click a blank to check it.</div>`;
    } else if (p.stage === 'type') {
      inner = `<textarea class="mem-type" rows="4" placeholder="Type the verse from memory" aria-label="Type the verse"></textarea>`;
    } else {
      const want = v.text.match(WORD_RE) || [];
      const got = (p.typed || '').match(WORD_RE) || [];
      const res = diffWords(want, got);
      const pct = want.length ? Math.round((res.filter((r) => r.ok).length / want.length) * 100) : 0;
      inner = `<div class="mem-text mem-check">${res.map((r) => (r.ok ? esc(r.w) : `<mark title="${r.typed ? `You typed “${esc(r.typed)}”` : 'Missed'}">${esc(r.w)}</mark>`)).join(' ')}</div>
        <div class="hint">${pct === 100 ? 'Every word right.' : `${pct}% of the words right. Highlighted words were missed or different.`} (Punctuation and capitals don't count.)</div>`;
    }
    const btns = p.stage === 'typed'
      ? '<button data-act="memMiss">Not yet</button><button class="primary-btn" data-act="memGot">I knew it</button>'
      : p.stage === 'type' ? '<button data-act="memReveal">Show the verse</button><button class="primary-btn" data-memx="check">Check</button>'
        : '<button class="primary-btn" data-act="memReveal">Show the verse</button>';
    openModal(`<div class="kicker">Memory verse ${p.i + 1} of ${p.queue.length}</div><h2 class="m-title">${esc(v.label)}</h2>
      <div class="mem-body">${inner}</div><div class="mem-btns">${btns}</div>`, 'm-mem');
    const ta = $('#modal .mem-type');
    if (ta) ta.focus();
  };
}
/** word-by-word comparison (ignores case and punctuation) */
function diffWords(want, got) {
  const n = want.length, m = got.length;
  const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  const eq = (a, b) => a.toLowerCase() === b.toLowerCase();
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = eq(want[i], got[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n) {
    if (j < m && eq(want[i], got[j])) {
      out.push({ w: want[i], ok: true });
      i++;
      j++;
    } else if (j < m && L[i][j + 1] > L[i + 1][j]) j++;
    else {
      out.push({ w: want[i], ok: false, typed: j < m && L[i + 1][j + 1] === L[i][j] ? got[j] : '' });
      if (j < m && L[i + 1][j + 1] === L[i][j]) j++;
      i++;
    }
  }
  return out;
}

// ===================================================================== tour, quick start, commands
{
  const i = TOUR.findIndex((t) => t.el === '#btnTimeline');
  TOUR.splice(i >= 0 ? i : TOUR.length - 1, 0, { el: '#btnToday', title: 'Today', text: 'Start here each day: open your Bible where you left off, today\'s devotional, your prayer list, memory verses, reading plan, journal and The Gospel.' });
  const prevQS = window.openQuickStart;
  window.openQuickStart = () => {
    prevQS();
    const first = $('#modal .qs section');
    if (first) first.insertAdjacentHTML('afterend', `<section><h3>Your daily walk</h3><ul>
      <li><b>Today</b> (Ctrl+Shift+W): open your Bible where you left off, today's devotional, your prayer list, memory verses and reading plan.</li>
      <li><b>Notes › Journal</b>: write down what God is teaching you, by date.</li>
      <li><b>Notes › Prayer</b>: your prayer list by category; mark requests answered and keep a record of God's faithfulness.</li>
      <li><b>Memory verses</b>: practise with first letters, fill in the blanks, or type it out.</li>
      <li><b>The Gospel</b>: how to be saved — print it or save it to share.</li></ul></section>`);
  };
  COMMANDS.unshift(
    ['Today', 'devotional prayer memory plan', () => openToday()],
    ['Prayer list', 'requests answered', () => showMarksView('prayer')],
    ['Journal', 'diary entries', () => showMarksView('journal')],
    ['The Gospel — how to be saved', 'salvation saved romans road share', () => openGospel()],
  );
}

// ===================================================================== events
function wireV38() {
  $('#btnDaily').insertAdjacentHTML('beforebegin', '<button id="btnToday" class="icon text" title="Today: devotional, prayer list, memory verses, reading plan (Ctrl+Shift+W)">Today</button>');
  $('#btnToday').addEventListener('click', () => openToday());
  const modal = $('#modal');
  modal.addEventListener('click', async (e) => {
    const t = e.target;
    const td = t.closest('[data-td]');
    if (td) {
      const k = td.dataset.td;
      if (k === 'prayers') return showMarksView('prayer');
      if (k === 'journal') return showMarksView('journal');
      if (k === 'memory') return showMarksView('memory');
      if (k === 'plan') return openPlan();
      if (k === 'daily') return openDaily(0, null);
      if (k === 'gospel') return openGospel();
    }
    const wk = t.closest('[data-wk]');
    if (wk) {
      const k = wk.dataset.wk;
      if (k === 'close') return closeModal();
      if (k === 'practice') return startPractice(false);
    }
    // gospel
    const gs = t.closest('[data-gs]');
    if (gs) {
      const html = await gospelPage();
      if (gs.dataset.gs === 'print') return tsk.printSheet(html);
      if (gs.dataset.gs === 'pdf') return tsk.exportSheet(html, 'How can I be saved');
      const saved = await tsk.saveHtml(html, 'How can I be saved');
      if (saved) toast('Saved. Anyone can open it in a web browser.');
      return;
    }
    // memory practice extras
    const mx = t.closest('[data-memx]');
    if (mx && v33.practice) {
      const p = v33.practice;
      if (mx.dataset.memx === 'check') {
        p.typed = ($('#modal .mem-type') || {}).value || '';
        p.stage = 'typed';
      } else p.stage = mx.dataset.memx;
      return showPracticeCard();
    }
    const mb = t.closest('.mb');
    if (mb) {
      mb.textContent = mb.dataset.w;
      mb.classList.add('shown');
    }
  });
  modal.addEventListener('keydown', (e) => {
    const ta = e.target.closest && e.target.closest('.mem-type');
    if (ta && e.key === 'Enter' && (e.ctrlKey || !e.shiftKey)) {
      e.preventDefault();
      v33.practice.typed = ta.value;
      v33.practice.stage = 'typed';
      showPracticeCard();
    }
  });
  // Notes tab: prayer list and journal
  const pm = $('#pane-marks');
  pm.addEventListener('submit', (e) => {
    if (e.target.closest('[data-pr-form]')) {
      e.preventDefault();
      const text = $('#prText').value.trim();
      if (!text) return;
      state.prayers.push({ id: newId(), text, cat: $('#prCat').value, added: todayStr(), answered: null });
      saveUser(['prayers']);
      return renderPrayers();
    }
    const ans = e.target.closest('[data-pr-ans]');
    if (ans) {
      e.preventDefault();
      const p = state.prayers.find((x) => x.id === ans.dataset.prAns);
      if (p) {
        p.answered = todayStr();
        p.answer = $('input', ans).value.trim();
        saveUser(['prayers']);
        toast('Praise the Lord!');
      }
      return renderPrayers();
    }
    const jf = e.target.closest('[data-jr-form]');
    if (jf) {
      e.preventDefault();
      const text = $('textarea', jf).value.trim();
      if (text) {
        state.journal.push({ id: newId(), date: todayStr(), time: new Date().toTimeString().slice(0, 5), text, answers: {} });
        saveUser(['journal']);
      }
      return renderJournal();
    }
  });
  pm.addEventListener('click', (e) => {
    const pra = e.target.closest('[data-pra]');
    if (pra) {
      e.stopPropagation();
      const id = pra.closest('[data-pr]').dataset.pr;
      const p = state.prayers.find((x) => x.id === id);
      if (!p) return;
      if (pra.dataset.pra === 'answer') return answerPrayer(id);
      if (pra.dataset.pra === 'reopen') {
        p.answered = null;
        p.answer = '';
      }
      if (pra.dataset.pra === 'rm') {
        state.prayers = state.prayers.filter((x) => x.id !== id);
      }
      saveUser(['prayers']);
      return renderPrayers();
    }
    const jr = e.target.closest('[data-jr]');
    if (jr) {
      e.stopPropagation();
      const k = jr.dataset.jr;
      if (k === 'new') return newJournalEntry();
      if (k === 'cancel') return renderJournal();
      if (k === 'rm') {
        const id = jr.closest('[data-jr-id]').dataset.jrId;
        const el = jr.closest('.jr-entry');
        if (!el.classList.contains('confirm')) {
          el.classList.add('confirm');
          jr.textContent = 'Delete?';
          return;
        }
        state.journal = state.journal.filter((x) => x.id !== id);
        saveUser(['journal']);
        return renderJournal();
      }
    }
    const rd = e.target.closest('[data-jr-read]');
    if (rd) {
      const en = state.journal.find((x) => x.id === rd.dataset.jrRead);
      if (en && en.chapters && en.chapters[0]) go({ book: en.chapters[0][0], ch: en.chapters[0][1], vs: 1 });
      return;
    }
  });
  pm.addEventListener('input', (e) => {
    if (e.target.id !== 'jrSearch') return;
    v38.journalQ = e.target.value;
    clearTimeout(v38.jrTimer);
    v38.jrTimer = setTimeout(() => {
      renderJournal();
      const s = $('#jrSearch');
      s.focus();
      s.setSelectionRange(s.value.length, s.value.length);
    }, 250);
  });
  tsk.onMenu((cmd) => {
    if (cmd === 'walk') openToday();
    else if (cmd === 'prayers') showMarksView('prayer');
    else if (cmd === 'journal') showMarksView('journal');
    else if (cmd === 'gospel') openGospel();
  });
}

wireV38();

// =====================================================================================================
// from v39.js
// =====================================================================================================
/* v3.9: Study methods (guided worksheets that teach how to study a passage, using the app's own study data). */
/* global tsk, state, $, $$, esc, go, toast, saveUser, openModal, closeModal, todayStr, newId, v32, v38, switchTab,
   renderMarks, toggleMemory, COMMANDS, TOUR, openQuickStart, showMarksView, sheetPage, bookName */

const v39 = { study: null };

// ===================================================================== study methods
const METHODS = {
  oia: {
    name: 'Observe, Interpret, Apply',
    blurb: 'The foundation of all Bible study: see what the passage says, understand what it means, then live it.',
    how: ['Read the passage slowly, more than once.', 'Observe before you explain: write down only what the text says.', 'Interpret by letting Scripture explain Scripture — the cross-references are a good start.', 'Apply it personally and specifically.'],
    fields: [
      ['Observe', 'What does it say? Who, what, when, where, why, how? Note repeated words, commands, promises, contrasts and connecting words (therefore, but, for).'],
      ['Interpret', 'What does it mean? What did it mean to those who first heard it? What do other passages say about this?'],
      ['Apply', 'How should I live? Is there a sin to confess, a command to obey, a promise to trust, an example to follow?'],
    ],
    aids: ['repeated', 'xrefs'],
  },
  soap: {
    name: 'SOAP',
    blurb: 'A simple daily method: Scripture, Observation, Application, Prayer.',
    how: ['Write out the verse that stands out to you.', 'Observe what it says.', 'Apply it to your life today.', 'Pray it back to God.'],
    fields: [
      ['Scripture', 'Write out the verse that stood out to you.'],
      ['Observation', 'What do you notice? What does it teach about God, about people, about life?'],
      ['Application', 'What will you do about it today?'],
      ['Prayer', 'Pray the verse back to God in your own words.'],
    ],
    aids: ['xrefs'],
  },
  word: {
    name: 'Word study',
    blurb: 'Dig into one key word: what it meant in Hebrew or Greek, and how the Bible uses it elsewhere.',
    how: ['Choose a key word in the verse.', 'Look at its meaning in the original language.', 'Read other verses that use the same word.', 'Ask what the word adds to this passage.'],
    fields: [
      ['The word and its meaning', 'The English word, the Hebrew or Greek word, and what it means.'],
      ['How the Bible uses it', 'What do the other verses that use this word show?'],
      ['What it adds here', 'How does this meaning help you understand the passage?'],
      ['Apply', 'How does this change what you believe or do?'],
    ],
    aids: ['words'],
  },
  character: {
    name: 'Character study',
    blurb: 'Learn from a person in the Bible: their life, their faith, their failures and their God.',
    how: ['Choose a person.', 'Read the main passages about them.', 'Notice how they responded to God.', 'Learn from both their faith and their failures.'],
    fields: [
      ['Background', 'Family, times, where they lived, what they did.'],
      ['Faith and strengths', 'Where did they trust and obey God?'],
      ['Failures and warnings', 'Where did they fall, and what were the results?'],
      ['God in their story', 'What does their life show about God?'],
      ['Lessons for me', 'What do you want to imitate, and what to avoid?'],
    ],
    aids: ['people'],
  },
  topic: {
    name: 'Topical study',
    blurb: 'Gather what the whole Bible says about one subject, using Nave\'s Topical Bible.',
    how: ['Choose a topic.', 'Read the verses listed for it.', 'Group what they teach.', 'Sum it up in one sentence, then apply it.'],
    fields: [
      ['What the Bible says', 'Write down what the verses teach, grouping similar ones together.'],
      ['Summary', 'Sum up the Bible\'s teaching on this topic in a sentence or two.'],
      ['Apply', 'How should this shape your life?'],
    ],
    aids: ['topics'],
  },
  versemap: {
    name: 'Verse mapping',
    blurb: 'Take one verse apart phrase by phrase, look at its key words and cross-references, then put it back together.',
    how: ['Write out the verse.', 'Break it into phrases.', 'Look up key words and cross-references.', 'Write the verse\'s meaning in your own words.'],
    fields: [
      ['Phrase by phrase', 'What does each phrase say?'],
      ['Key words', 'Which words matter most, and what do they mean?'],
      ['Cross-references', 'What do related verses add?'],
      ['In my own words', 'Write what the verse means.'],
      ['Apply', 'How will you live this verse?'],
    ],
    aids: ['phrases', 'words', 'xrefs'],
  },
  overview: {
    name: 'Book overview',
    blurb: 'See a whole book at once: its setting, theme, people, places and how it points to Christ.',
    how: ['Read the book through (or skim the chapter headings).', 'Note who wrote it, to whom and when.', 'Find its theme and key verse.', 'Sketch a simple outline.'],
    fields: [
      ['Setting', 'Who wrote it, to whom, when and why?'],
      ['Theme and key verse', 'What is the book about? Which verse sums it up?'],
      ['Outline', 'Divide the book into its main sections (by chapters).'],
      ['Key people and places', 'Who and where does the book centre on?'],
      ['Christ in this book', 'How does it point to Jesus?'],
      ['Apply', 'What does this book call you to?'],
    ],
    aids: ['book'],
  },
};
const METHOD_ORDER = ['oia', 'soap', 'word', 'character', 'topic', 'versemap', 'overview'];

async function resolvePassage(q) {
  const r = state.parse(String(q || '').trim());
  if (!r) return null;
  const s = await tsk.verseId(r.book, r.ch, r.vs || 1);
  let e = s;
  if (r.vsEnd) e = await tsk.verseId(r.book, r.ch, r.vsEnd);
  else if (!r.vs) {
    const c = await tsk.chapter(r.book, r.ch);
    e = c.verses[c.verses.length - 1].id;
  }
  return { s, e, book: r.book, ch: r.ch };
}

function openStudyChooser(ctx = {}) {
  openModal(`<div class="kicker">Study methods</div><h2 class="m-title">How would you like to study?</h2>
    <p class="hint">Each method is a guided worksheet. The app fills in study aids — cross-references, Hebrew and Greek words, people, topics — so you can concentrate on the text. Your worksheet is saved in Notes › Journal.</p>
    <div class="sm-list">${METHOD_ORDER.map((k) => `<button class="sm-opt" data-sm="${k}"><b>${esc(METHODS[k].name)}</b><span>${esc(METHODS[k].blurb)}</span></button>`).join('')}</div>`, 'm-study-pick');
  v39.pickCtx = ctx;
}

/** Open a worksheet. ctx: { ref, s, e, from: { path, step } } */
async function openStudy(method, ctx = {}) {
  const m = METHODS[method];
  let { s, e } = ctx;
  if (!s) {
    const id = state.cur.sel || (await tsk.verseId(state.cur.book, state.cur.ch, 1));
    s = id;
    e = method === 'oia' || method === 'overview' ? null : id;
    if (!e) {
      const c = await tsk.chapter(state.cur.book, state.cur.ch);
      e = method === 'overview' ? id : c.verses[c.verses.length - 1].id;
      if (method === 'oia' && state.cur.sel) e = state.cur.sel;
    }
  }
  const pas = await tsk.passage(s, e);
  v39.study = { method, s, e, label: pas.label, answers: {}, from: ctx.from || null, pick: null };
  renderStudy(pas);
}

async function renderStudy(pas) {
  const st = v39.study;
  const m = METHODS[st.method];
  pas = pas || (await tsk.passage(st.s, st.e));
  const loc = pas.start || (await tsk.locate(st.s));
  const bookId = loc && loc.book;
  const text = pas.verses.map((v) => `<span data-id="${v.id}"><sup>${v.vs}</sup>${esc(v.text)} </span>`).join('');
  openModal(`<div class="kicker">Study method · ${esc(m.name)}${st.from ? ` · ${esc(st.from.title)}` : ''}</div>
    <div class="sm-head"><h2 class="m-title">${st.method === 'overview' ? esc(bookName(bookId)) : esc(pas.label)}</h2>
      <form class="sm-ref" data-sm-form="ref"><input value="${esc(st.method === 'overview' ? bookName(bookId) : pas.label)}" aria-label="Passage to study" placeholder="${st.method === 'overview' ? 'A book, e.g. Ruth' : 'e.g. John 15:1-11'}" /><button>Change</button></form></div>
    <details class="sm-how"><summary>How this method works</summary><ol>${m.how.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></details>
    <div class="sm-grid">
      <div class="sm-main">
        ${st.method === 'overview' ? '' : `<div class="sm-text">${text}${pas.truncated ? '<span class="hint"> …(shortened)</span>' : ''}</div>`}
        ${m.fields.map(([k, hint]) => `<label class="sm-field"><b>${esc(k)}</b><span class="hint">${esc(hint)}</span><textarea data-smf="${esc(k)}" rows="3">${esc(st.answers[k] || (k === 'Scripture' && st.method === 'soap' ? `${pas.label} — ${pas.verses.map((v) => v.text).join(' ')}` : ''))}</textarea></label>`).join('')}
      </div>
      <aside class="sm-aids" aria-label="Study aids"><div class="sm-aids-h">Study aids</div><div class="sm-aids-body"><div class="hint">Gathering…</div></div></aside>
    </div>
    <div class="fm-foot"><button data-smx="methods">Other methods</button><button data-smx="print">Print</button><button class="primary-btn" data-smx="save">Save to journal</button></div>`, 'm-study');
  if (st.method === 'soap' && !st.answers.Scripture) st.answers.Scripture = $('#modal [data-smf="Scripture"]').value;
  fillAids(pas, bookId);
}

// ---------------------------------------------------------------- study aids
async function fillAids(pas, bookId) {
  const st = v39.study;
  const body = $('#modal .sm-aids-body');
  if (!body) return;
  const parts = [];
  const ids = pas.verses.map((v) => v.id);
  const focus = st.pick && st.pick.verse ? st.pick.verse : state.cur.sel && ids.includes(state.cur.sel) ? state.cur.sel : ids[0];
  for (const a of METHODS[st.method].aids) {
    if (a === 'repeated') {
      const STOP = new Set('and the of to that in he for unto i his a they shall is be not with them him it all ye as which but my me was thou thy thee their were from have hath by are this there upon when so then what or an at said you we her she will no also out up if your our us into one even who on'.split(' '));
      const count = new Map();
      for (const v of pas.verses) for (const w of v.text.toLowerCase().match(/[a-z']+/g) || []) if (!STOP.has(w) && w.length > 2) count.set(w, (count.get(w) || 0) + 1);
      const rep = [...count].filter(([, n]) => n > 1).sort((x, y) => y[1] - x[1]).slice(0, 14);
      parts.push(`<section><h4>Repeated words</h4>${rep.length ? `<div class="sm-chips">${rep.map(([w, n]) => `<span>${esc(w)} <i>${n}</i></span>`).join('')}</div>` : '<div class="hint">No word repeats in this passage.</div>'}</section>`);
    }
    if (a === 'xrefs') {
      const x = await tsk.xrefs(focus);
      const refs = x ? x.groups.flatMap((g) => g.refs.map((r) => ({ ...r, anchor: g.anchor }))).slice(0, 16) : [];
      parts.push(`<section><h4>Cross-references for ${esc(x ? x.verse.label : '')}</h4>${refs.length ? `<div class="sm-refs">${refs.map((r) => `<button class="ref" data-smref="${r.start}-${r.end}" title="${esc(r.anchor || '')}">${esc(r.label)}</button>`).join('')}</div><div class="sm-refshow hint">Click a reference to read it here.</div>` : '<div class="hint">None for this verse.</div>'}
        <div class="hint">Treasury of Scripture Knowledge. Choose another verse by clicking it in the passage.</div></section>`);
    }
    if (a === 'words') {
      const ws = (await tsk.words(focus)).filter((w) => w.strongs && w.gloss && !/^\s*</.test(w.gloss)).map((w) => ({ ...w, gloss: w.gloss.replace(/[<>]/g, '').replace(/[\s,.;:!?]+$/, '') }));
      const seen = new Set();
      const uniq = ws.filter((w) => !seen.has(w.strongs) && seen.add(w.strongs));
      const pick = st.pick && st.pick.strongs ? st.pick.strongs : null;
      let detail = '';
      if (pick) {
        const [sg, conc] = await Promise.all([tsk.strong(pick), tsk.concordance(pick, undefined, 10)]);
        if (sg) {
          detail = `<div class="sm-word"><b>${esc(sg.lemma || '')}</b> <i>${esc(sg.xlit || '')}</i> · ${esc(pick)}
            <div>${esc(sg.def || '')}</div>
            ${sg.kjv_def ? `<div class="hint">KJV: ${esc(sg.kjv_def)}</div>` : ''}
            <div class="hint">In ${conc.total} verse${conc.total === 1 ? '' : 's'}. For example:</div>
            <ul>${conc.results.slice(0, 8).map((r) => `<li><button class="ref" data-smref="${r.id}-${r.id}">${esc(r.label)}</button> ${esc(r.text.length > 110 ? `${r.text.slice(0, 110)}…` : r.text)}</li>`).join('')}</ul></div>`;
        }
      }
      parts.push(`<section><h4>Words in ${esc((await tsk.label(focus)) || '')}</h4><div class="sm-chips">${uniq.map((w) => `<button data-smword="${esc(w.strongs)}" class="${w.strongs === pick ? 'on' : ''}" title="${esc(w.strongs)}">${esc(w.gloss)}</button>`).join('')}</div>${detail || '<div class="hint">Choose a word to see its meaning and other verses that use it.</div>'}</section>`);
    }
    if (a === 'phrases') {
      const v = pas.verses.find((x) => x.id === focus) || pas.verses[0];
      const ph = v.text.split(/(?<=[,;:.?!])\s+/).filter(Boolean);
      parts.push(`<section><h4>Phrases in verse ${v.vs}</h4><ol class="sm-phrases">${ph.map((p) => `<li>${esc(p)}</li>`).join('')}</ol></section>`);
    }
    if (a === 'people') {
      const seen = new Map();
      for (const id of ids.slice(0, 40)) for (const p of await tsk.peopleInVerse(id)) if (!seen.has(p.pid) && p.name !== 'YHVH') seen.set(p.pid, p);
      const pick = st.pick && st.pick.pid ? st.pick.pid : null;
      let detail = '';
      if (pick) {
        const p = await tsk.person(pick);
        if (p) {
          const rel = (label, list) => (list.length ? `<div><i>${label}:</i> ${list.map((x) => esc(x.name)).join(', ')}</div>` : '');
          const vs = await tsk.personVerses(pick);
          detail = `<div class="sm-word"><b>${esc(p.name)}</b>${p.aka && p.aka.length ? ` <span class="hint">(also ${esc(p.aka.join(', '))})</span>` : ''}
            ${p.note ? `<div>${esc(p.note)}</div>` : ''}
            ${rel('Parents', p.parents)}${rel('Husband or wife', p.spouses)}${rel('Children', p.children)}${rel('Brothers and sisters', p.siblings)}
            <div class="hint">Named in ${p.verses} verse${p.verses === 1 ? '' : 's'}${p.firstRef ? `, first in ${esc(p.firstRef)}` : ''}.</div>
            <ul>${(vs || []).slice(0, 10).map((r) => `<li><button class="ref" data-smref="${r.id}-${r.id}">${esc(r.label)}</button></li>`).join('')}</ul></div>`;
        }
      }
      const list = [...seen.values()];
      parts.push(`<section><h4>People in this passage</h4>${list.length ? `<div class="sm-chips">${list.map((p) => `<button data-smpid="${esc(p.pid)}" class="${p.pid === pick ? 'on' : ''}">${esc(p.name)}</button>`).join('')}</div>` : '<div class="hint">No one is named here.</div>'}
        <form class="sm-find" data-sm-form="person"><input placeholder="Or find anyone, e.g. Ruth" aria-label="Find a person" /><button>Find</button></form>${detail}</section>`);
    }
    if (a === 'topics') {
      const seen = new Map();
      for (const id of ids.slice(0, 20)) for (const t of await tsk.naveForVerse(id)) if (!seen.has(t.id)) seen.set(t.id, t);
      const pick = st.pick && st.pick.topic ? st.pick.topic : null;
      let detail = '';
      if (pick) {
        const t = await tsk.naveTopic(pick);
        if (t) detail = `<div class="sm-word"><b>${esc(t.subject)}</b><ul class="sm-topic">${t.lines.slice(0, 40).map((l) => `<li style="margin-left:${l.depth * 12}px">${esc(l.text)} ${l.refs.slice(0, 8).map((r) => `<button class="ref" data-smref="${r.start}-${r.end}">${esc(r.label)}</button>`).join(' ')}</li>`).join('')}</ul></div>`;
      }
      const list = [...seen.values()].slice(0, 24);
      parts.push(`<section><h4>Topics in this passage</h4><div class="sm-chips">${list.map((t) => `<button data-smtopic="${t.id}" class="${t.id === pick ? 'on' : ''}">${esc(t.subject)}</button>`).join('')}</div>
        <form class="sm-find" data-sm-form="topic"><input placeholder="Or find a topic, e.g. prayer" aria-label="Find a topic" /><button>Find</button></form><div class="sm-found"></div>${detail}</section>`);
    }
    if (a === 'book') {
      const bk = state.books[bookId - 1];
      const events = [];
      const places = new Map();
      for (let c = 1; c <= bk.chapters; c++) {
        const [ev, pl] = await Promise.all([tsk.eventsForChapter(bookId, c), tsk.placesForChapter(bookId, c)]);
        for (const e of ev || []) if (!events.some((x) => x.eid === e.eid)) events.push(e);
        for (const p of (pl && (pl.places || pl)) || []) {
          const k = p.name || p.label;
          if (k) places.set(k, (places.get(k) || 0) + 1);
        }
      }
      const topPlaces = [...places].sort((x, y) => y[1] - x[1]).slice(0, 14);
      const first = await tsk.passage(await tsk.verseId(bookId, 1, 1), await tsk.verseId(bookId, 1, 3));
      parts.push(`<section><h4>${esc(bk.name)}</h4><div>${bk.chapters} chapter${bk.chapters === 1 ? '' : 's'} · ${bookId <= 39 ? 'Old' : 'New'} Testament</div>
        <div class="hint">It begins: “${esc(first.verses.map((v) => v.text).join(' ').slice(0, 220))}…”</div></section>`);
      if (events.length) parts.push(`<section><h4>Events (from the timeline)</h4><ul class="sm-ev">${events.slice(0, 18).map((e) => `<li><span class="hint">${esc(e.date || '')}</span> ${esc(e.title)}</li>`).join('')}</ul></section>`);
      if (topPlaces.length) parts.push(`<section><h4>Places named most</h4><div class="sm-chips">${topPlaces.map(([n, k]) => `<span>${esc(n)} <i>${k}</i></span>`).join('')}</div><div class="hint">Number of chapters each is named in.</div></section>`);
    }
  }
  if (v39.study !== st || !$('#modal .sm-aids-body')) return;
  $('#modal .sm-aids-body').innerHTML = parts.join('');
}

function studyAnswers() {
  const out = {};
  for (const ta of $$('#modal [data-smf]')) if (ta.value.trim()) out[ta.dataset.smf] = ta.value.trim();
  return out;
}

async function saveStudy() {
  const st = v39.study;
  st.answers = { ...st.answers, ...studyAnswers() };
  const filled = Object.entries(st.answers).filter(([k, v]) => v && v.trim() && !(k === 'Scripture' && st.method === 'soap' && Object.keys(st.answers).length === 1));
  if (!filled.length) return toast('Write something first.');
  const loc = await tsk.locate(st.s);
  const entry = {
    id: st.entryId || newId(),
    date: todayStr(),
    time: new Date().toTimeString().slice(0, 5),
    kind: 'study',
    method: st.method,
    read: `${METHODS[st.method].name}: ${st.method === 'overview' ? bookName(loc.book) : st.label}`,
    chapters: loc ? [[loc.book, loc.ch]] : [],
    answers: Object.fromEntries(filled),
  };
  if (st.entryId) state.journal = state.journal.filter((x) => x.id !== st.entryId);
  st.entryId = entry.id;
  state.journal.push(entry);
  saveUser(['journal']);
  toast('Saved in Notes › Journal');
}

async function printStudy() {
  const st = v39.study;
  st.answers = { ...st.answers, ...studyAnswers() };
  const m = METHODS[st.method];
  const pas = await tsk.passage(st.s, st.e);
  const html = sheetPage(`${m.name}: ${pas.label}`, `<div class="k">Study method · ${esc(m.name)}</div><h1>${esc(pas.label)}</h1>
    ${st.method === 'overview' ? '' : `<p>${pas.verses.map((v) => `<sup>${v.vs}</sup>${esc(v.text)}`).join(' ')}</p>`}
    ${m.fields.map(([k, hint]) => `<h2>${esc(k)}</h2><p style="color:#5b6476;font-size:10pt;margin:0 0 4pt">${esc(hint)}</p>${st.answers[k] ? `<p style="white-space:pre-wrap">${esc(st.answers[k])}</p>` : '<div style="height:1.1in;border-bottom:1px solid #ccc"></div>'}`).join('')}`);
  await tsk.printSheet(html);
}

// ===================================================================== Today, commands, tour, quick start
{
  COMMANDS.unshift(
    ['Study methods', 'inductive observe interpret apply soap word character topical verse mapping book overview worksheet', () => openStudyChooser()],
  );
  const i = TOUR.findIndex((t) => t.el === '#btnToday');
  if (i >= 0) TOUR[i] = { ...TOUR[i], text: `${TOUR[i].text}${' Study methods start here too.'}` };
  const prevQS = window.openQuickStart;
  window.openQuickStart = () => {
    prevQS();
    const walk = $$('#modal .qs section').find((s) => /Your daily walk/.test(s.textContent));
    if (walk) $('ul', walk).insertAdjacentHTML('beforeend', `<li><b>Study methods</b> (Today, or Ctrl+K): Observe–Interpret–Apply, SOAP, word study, character study, topical study, verse mapping and book overview, with study aids filled in for you. Saved in Notes › Journal.</li>`);
  };
}

// ===================================================================== events
function wireV39() {
  const modal = $('#modal');
  modal.addEventListener('click', async (e) => {
    const t = e.target;
    const td2 = t.closest('[data-td2]');
    if (td2) return openStudyChooser();
    // study methods
    const sm = t.closest('[data-sm]');
    if (sm) return openStudy(sm.dataset.sm, v39.pickCtx || {});
    const smx = t.closest('[data-smx]');
    if (smx && v39.study) {
      v39.study.answers = { ...v39.study.answers, ...studyAnswers() };
      if (smx.dataset.smx === 'save') return saveStudy();
      if (smx.dataset.smx === 'print') return printStudy();
      if (smx.dataset.smx === 'methods') return openStudyChooser({ s: v39.study.s, e: v39.study.e });
    }
    const pick = t.closest('[data-smword],[data-smpid],[data-smtopic]');
    if (pick && v39.study) {
      v39.study.answers = { ...v39.study.answers, ...studyAnswers() };
      v39.study.pick = { ...(v39.study.pick || {}), strongs: pick.dataset.smword || (v39.study.pick || {}).strongs, pid: pick.dataset.smpid || (v39.study.pick || {}).pid, topic: pick.dataset.smtopic ? Number(pick.dataset.smtopic) : (v39.study.pick || {}).topic };
      return fillAids(await tsk.passage(v39.study.s, v39.study.e), (await tsk.locate(v39.study.s)).book);
    }
    const vsp = t.closest('.sm-text [data-id]');
    if (vsp && v39.study) {
      v39.study.pick = { ...(v39.study.pick || {}), verse: Number(vsp.dataset.id), strongs: null };
      $$('#modal .sm-text .on').forEach((x) => x.classList.remove('on'));
      vsp.classList.add('on');
      return fillAids(await tsk.passage(v39.study.s, v39.study.e), (await tsk.locate(v39.study.s)).book);
    }
    const ref = t.closest('[data-smref]');
    if (ref) {
      const [a, b] = ref.dataset.smref.split('-').map(Number);
      const pas = await tsk.passage(a, b);
      const sec = ref.closest('section');
      let box = $('.sm-show', sec);
      if (!box) {
        sec.insertAdjacentHTML('beforeend', '<div class="sm-show"></div>');
        box = $('.sm-show', sec);
      }
      box.innerHTML = `<b>${esc(pas.label)}</b> ${esc(pas.verses.map((v) => v.text).join(' '))}`;
      return;
    }
  });
  modal.addEventListener('input', (e) => {
    const f = e.target.closest('[data-smf]');
    if (f && v39.study) v39.study.answers[f.dataset.smf] = f.value;
  });
  modal.addEventListener('submit', async (e) => {
    const f = e.target.closest('[data-sm-form]');
    if (!f || !v39.study) return;
    e.preventDefault();
    const val = $('input', f).value.trim();
    if (!val) return;
    v39.study.answers = { ...v39.study.answers, ...studyAnswers() };
    const kind = f.dataset.smForm;
    if (kind === 'ref') {
      let r = await resolvePassage(v39.study.method === 'overview' && !/\d/.test(val) ? `${val} 1` : val);
      if (!r) return toast('Type a passage such as John 15:1-11, or a book such as Ruth');
      if (v39.study.method === 'overview') r = { ...r, e: r.s };
      Object.assign(v39.study, { s: r.s, e: r.e, pick: null });
      const pas = await tsk.passage(r.s, r.e);
      v39.study.label = pas.label;
      return renderStudy(pas);
    }
    if (kind === 'person') {
      const rs = await tsk.personSearch(val);
      if (!rs.length) return toast('No one by that name.');
      v39.study.pick = { ...(v39.study.pick || {}), pid: rs[0].pid };
      return fillAids(await tsk.passage(v39.study.s, v39.study.e), (await tsk.locate(v39.study.s)).book);
    }
    if (kind === 'topic') {
      const rs = await tsk.naveSearch(val);
      const box = $('.sm-found', f.closest('section'));
      if (box) box.innerHTML = rs.length ? `<div class="sm-chips">${rs.slice(0, 16).map((t) => `<button data-smtopic="${t.id}">${esc(t.subject)}</button>`).join('')}</div>` : '<div class="hint">No topic by that name.</div>';
    }
  });
  tsk.onMenu((cmd) => {
    if (cmd === 'study') openStudyChooser();
  });
}

wireV39();
