'use strict';
/* Morning and Evening, Gospel parallels and Old Testament quotations, People, the Timeline, smarter notes, reading progress, the command box (Ctrl+K) and accessibility.
   Merged in 3.15 from the per-release layers (v37.js), kept in their original order: later
   sections still extend earlier ones by wrapping window.X. */

// =====================================================================================================
// from v37.js
// =====================================================================================================
/* v3.7: Morning and Evening; Gospel parallels and Old Testament quotations; People (family tree);
   Timeline; smarter notes (linked references, backlinks, SOAP and prayer templates); reading progress;
   command box (Ctrl+K); accessibility (interface size, high contrast, reduced motion, labels).
   Loaded after v36.js; overrides use window.X so earlier code picks them up. */
/* global tsk, state, $, $$, esc, go, toast, switchTab, saveUser, openModal, closeModal, todayStr, renderMarks, setTags,
   runSearch, openPlan, openReadingOptions, applySettings, toggleTheme, v35, loadJourneys, selectJourney, renderJourneys,
   TOUR, planStatus, openQuickStart, startTour, setFocus */

const v37 = {
  people: [], // people in the selected verse
  person: null, // person shown in the family tree
  personBack: [],
  line: null, // line of descent being shown
  timeline: null,
  noteRefs: new Map(), // note verse id -> [{s, e}] references written in that note
  dwell: null,
  dayOffset: 0,
  period: null,
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const bookName = (b) => (state.books[b - 1] || {}).name || '';

// ===================================================================== hooks
{
  const prevInit = window.v3Init;
  window.v3Init = (u) => {
    if (prevInit) prevInit(u);
    const r = u.readlog && typeof u.readlog === 'object' ? u.readlog : {};
    state.readlog = { chapters: r.chapters || {}, days: r.days || {} };
  };
  const prevOnVerse = window.v3OnVerse;
  window.v3OnVerse = (id, x) => {
    if (prevOnVerse) prevOnVerse(id, x);
    renderParallels(id);
    decorateNote(id);
    peopleForVerse(id);
  };
  const prevAfter = window.v3AfterChapter;
  window.v3AfterChapter = () => {
    if (prevAfter) prevAfter();
    chapterExtras();
  };
  const prevApply = window.applySettings;
  window.applySettings = function () {
    prevApply();
    applyAccessibility();
  };
  const prevSwitch = window.switchTab;
  window.switchTab = function (name) {
    prevSwitch(name);
    $$('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    if (name === 'people') renderPeople();
  };
}
state.readlog = state.readlog || { chapters: {}, days: {} };

// ===================================================================== Morning and Evening
async function openDaily(offset = v37.dayOffset, period = v37.period) {
  v37.dayOffset = offset;
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const key = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const rows = await tsk.devotional(key);
  const p = period || (new Date().getHours() < 15 ? 'morning' : 'evening');
  v37.period = p;
  const r = rows.find((x) => x.period === p) || rows[0];
  if (!r) return toast('No reading found for this day.');
  const body = r.body.split(/\n+/).filter((x) => x.trim()).map((x) => `<p>${esc(x.trim())}</p>`).join('');
  openModal(`<div class="kicker">Morning and Evening</div>
    <div class="dv-head"><h2 class="m-title">${d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
      <div class="dv-nav"><button data-dv="prev" title="Previous day" aria-label="Previous day">&#8249;</button><button data-dv="today" class="${offset ? '' : 'on'}">Today</button><button data-dv="next" title="Next day" aria-label="Next day">&#8250;</button></div></div>
    <div class="vswitch" role="group" aria-label="Morning or evening"><button data-dvp="morning" class="${p === 'morning' ? 'on' : ''}">Morning</button><button data-dvp="evening" class="${p === 'evening' ? 'on' : ''}">Evening</button></div>
    <blockquote class="dv-verse">“${esc(r.headline)}”${r.verseId ? ` <button class="pl-vs" data-dvgo="${r.verseId}" title="Open in the reading pane">${esc(r.ref)}</button>` : ` <span class="hint">${esc(r.ref)}</span>`}</blockquote>
    <div class="dv-body">${body}</div>
    <div class="hint dv-credit">C. H. Spurgeon, <i>Morning and Evening: Daily Readings</i> (1866), public domain.</div>`, 'm-daily');
}

// ===================================================================== parallels and quotations (Refs tab)
const PAR_TITLES = {
  gospel: 'Also told in the other Gospels',
  quote_nt: 'Quotes the Old Testament',
  quote_ot: 'Quoted in the New Testament',
  quote_also: 'The same words are also quoted in',
  ot: 'Parallel account',
  nt: 'Parallel passage',
};

async function renderParallels(id) {
  const groups = await tsk.parallels(id);
  if (!state.xref || state.xref.verse.id !== id) return;
  const box = document.createElement('div');
  box.className = 'par-box';
  if (!groups.length) return;
  const sections = new Map(); // title -> Map(label -> member)
  const add = (title, m, gid) => {
    if (!sections.has(title)) sections.set(title, new Map());
    if (!sections.get(title).has(m.label)) sections.get(title).set(m.label, { ...m, gid });
  };
  const sideBySide = new Set();
  for (const g of groups) {
    const self = g.members.find((m) => m.self);
    const others = g.members.filter((m) => !m.self);
    if (g.kind === 'gospel') {
      others.forEach((m) => add('gospel', m, g.gid));
      sideBySide.add(g.gid);
    } else if (g.kind === 'quote') {
      if (self && self.lang === 'G') {
        others.filter((m) => m.lang === 'H').forEach((m) => add('quote_nt', m, g.gid));
        others.filter((m) => m.lang === 'G').forEach((m) => add('quote_also', m, g.gid));
      } else others.filter((m) => m.lang === 'G').forEach((m) => add('quote_ot', m, g.gid));
      sideBySide.add(g.gid);
    } else {
      others.forEach((m) => add(g.kind, m, g.gid));
      sideBySide.add(g.gid);
    }
  }
  const order = ['quote_nt', 'gospel', 'quote_ot', 'quote_also', 'ot', 'nt'];
  const html = order
    .filter((k) => sections.has(k))
    .map((k) => `<div class="par-sec par-${k}"><div class="par-title">${PAR_TITLES[k]}</div>${[...sections.get(k).values()]
      .map((m) => `<div class="par-item"><span class="ref" data-s="${m.s}" data-e="${m.e}">${esc(m.label)}</span> <span class="par-text">${esc(m.text.length > 220 ? `${m.text.slice(0, 220)}…` : m.text)}</span></div>`)
      .join('')}</div>`)
    .join('');
  box.innerHTML = `${html}<div class="par-foot"><button class="par-sbs" data-sbs="${[...sideBySide].join(',')}">Side by side</button>
    <span class="hint">From the UBS Parallel Passages Database.</span></div>`;
  const head = $('#pane-refs .xhead');
  if (head && !$('#pane-refs .par-box')) head.insertAdjacentElement('afterend', box);
}

async function openSideBySide(gids, focusId) {
  const groups = await tsk.parallels(focusId);
  const want = groups.filter((g) => gids.includes(g.gid));
  // merge members of the chosen groups into one set of passages
  const members = new Map();
  for (const g of want) for (const m of g.members) {
    const k = `${m.s}-${m.e}`;
    if (!members.has(k)) members.set(k, m);
  }
  // one column per book: overlapping UBS groups (Matthew 14:19 sits in two) would otherwise repeat a Gospel
  const byBook = new Map();
  for (const m of members.values()) {
    const b = m.label.replace(/\s+\d+:.*$/, '');
    const cur = byBook.get(b);
    if (!cur) byBook.set(b, { ...m });
    else {
      cur.s = Math.min(cur.s, m.s);
      cur.e = Math.max(cur.e, m.e);
      cur.self = cur.self || m.self;
      cur.label = `${b} …`;
    }
  }
  for (const m of byBook.values()) {
    if (!m.label.endsWith('…')) continue;
    const [a, z] = await tsk.versesByIds([m.s, m.e]); // labels like "Mark 6:39"
    const [, ca, va] = a.label.match(/(\d+):(\d+)$/);
    const [, cz, vz] = z.label.match(/(\d+):(\d+)$/);
    m.label = `${a.label}${ca === cz ? `–${vz}` : `–${cz}:${vz}`}`;
  }
  const list = [...byBook.values()].sort((a, b) => a.s - b.s);
  const cols = await Promise.all(list.map(async (m) => ({ m, vs: await tsk.passageVerses(m.s, m.e, 2) })));
  const kindWord = want.some((g) => g.kind === 'gospel') ? 'Gospel parallels' : want.some((g) => g.kind === 'quote') ? 'Quotation' : 'Parallel passages';
  openModal(`<div class="kicker">${kindWord}</div><h2 class="m-title">Side by side</h2>
    <div class="sbs" style="--cols:${Math.min(cols.length, 4)}">${cols
      .map(({ m, vs }) => `<div class="sbs-col${m.self ? ' self' : ''}"><div class="sbs-h"><button class="pl-vs" data-dvgo="${m.s}">${esc(m.label)}</button>${m.lang === 'H' ? '<span class="sbs-tag">Old Testament</span>' : ''}</div>
        <div class="sbs-t">${vs.map((v) => `<p class="${v.inRange ? 'in' : 'ctx'}"><sup>${v.ch}:${v.vs}</sup> ${esc(v.text)}</p>`).join('')}</div></div>`)
      .join('')}</div>
    <div class="hint">Highlighted verses are the parallel; the faded verses around them give the context. Click a reference to open it.</div>`, 'm-sbs');
}

// margin marks in the reading pane, the chapter's place in history, and reading progress
async function chapterExtras() {
  const { book, ch } = state.cur;
  const [pars, evs] = await Promise.all([tsk.parallelsInChapter(book, ch), tsk.eventsForChapter(book, ch)]);
  if (state.cur.book !== book || state.cur.ch !== ch) return;
  for (const p of pars) {
    const vn = $(`#v${p.id} .vn`);
    if (!vn || vn.parentElement.querySelector('.pmark')) continue;
    const kinds = p.kinds.split(',');
    const quote = kinds.includes('quote');
    vn.insertAdjacentHTML('afterend', `<span class="pmark${quote ? ' q' : ''}" title="${quote ? 'Old Testament quotation' : 'Parallel passage'} — see Related verses" aria-hidden="true">${quote ? '“' : '∥'}</span>`);
  }
  const head = $('#readerInner .chapter-head');
  if (head && evs.length && !$('.ch-date', head)) {
    const e = evs[0];
    ($('.tr', head) || head.lastChild).insertAdjacentHTML('beforebegin', `<button class="ch-date" data-tl="${e.eid}" title="See this on the timeline">${esc(e.date)} · ${esc(e.title)}${evs.length > 1 ? ` <span>+${evs.length - 1}</span>` : ''}</button>`);
  }
  startDwell(book, ch);
}

function startDwell(book, ch) {
  clearTimeout(v37.dwell);
  const t0 = Date.now();
  v37.dwell = setTimeout(() => markRead(book, ch), 45000); // a chapter you stay with for 45 seconds counts as read
  const last = $('#readerInner .verse:last-of-type');
  if (last && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((ents) => {
      if (ents.some((x) => x.isIntersecting) && Date.now() - t0 > 8000 && state.cur.book === book && state.cur.ch === ch) {
        markRead(book, ch); // or one you read to the end
        io.disconnect();
      }
    });
    io.observe(last);
    setTimeout(() => io.disconnect(), 30 * 60000);
  }
}

function markRead(book, ch, quiet = true) {
  const k = `${book}:${ch}`;
  const today = todayStr();
  const c = state.readlog.chapters[k] || { n: 0, first: today };
  if (c.last === today) return; // count each chapter once a day
  c.n += 1;
  c.last = today;
  state.readlog.chapters[k] = c;
  state.readlog.days[today] = (state.readlog.days[today] || 0) + 1;
  saveUser(['readlog']);
  if (!quiet) toast(`${bookName(book)} ${ch} marked as read`);
}

// ===================================================================== reading progress
function readingStats() {
  const chs = state.readlog.chapters;
  let ot = 0, nt = 0;
  for (const k of Object.keys(chs)) (Number(k.split(':')[0]) <= 39 ? (ot += 1) : (nt += 1));
  const days = state.readlog.days;
  let streak = 0;
  const d = new Date();
  if (!days[todayStr()]) d.setDate(d.getDate() - 1); // today not read yet: the streak runs to yesterday
  for (;;) {
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!days[k]) break;
    streak += 1;
    d.setDate(d.getDate() - 1);
  }
  const month = todayStr().slice(0, 7);
  const thisMonth = Object.entries(days).filter(([k]) => k.startsWith(month)).reduce((a, [, n]) => a + n, 0);
  return { ot, nt, total: ot + nt, streak, thisMonth };
}

function openProgress() {
  const s = readingStats();
  const chs = state.readlog.chapters;
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const row = (b) => `<div class="pg-row"><span class="pg-b" title="${esc(b.name)}">${esc(b.abbr)}</span><span class="pg-cells">${Array.from({ length: b.chapters }, (_, i) => {
    const c = chs[`${b.id}:${i + 1}`];
    const cls = !c ? '' : c.n >= 3 ? 'r3' : c.n === 2 ? 'r2' : 'r1';
    const recent = c && c.last >= weekAgo ? ' wk' : '';
    const here = state.cur.book === b.id && state.cur.ch === i + 1 ? ' here' : '';
    return `<button class="pg-c ${cls}${recent}${here}" data-pgb="${b.id}" data-pgc="${i + 1}" title="${esc(b.name)} ${i + 1}${c ? ` — read ${c.n} time${c.n === 1 ? '' : 's'}, last ${new Date(`${c.last}T00:00`).toLocaleDateString()}` : ' — not read yet'}" aria-label="${esc(b.name)} ${i + 1}${c ? ', read' : ''}"></button>`;
  }).join('')}</span></div>`;
  const pct = (n, of) => Math.round((n / of) * 100);
  openModal(`<div class="kicker">Reading progress</div><h2 class="m-title">${s.total.toLocaleString()} of 1,189 chapters read (${pct(s.total, 1189)}%)</h2>
    <div class="pg-stats">
      <div><b>${s.ot}</b><span>of 929 Old Testament chapters</span></div>
      <div><b>${s.nt}</b><span>of 260 New Testament chapters</span></div>
      <div><b>${s.thisMonth}</b><span>chapters this month</span></div>
      <div><b>${s.streak}</b><span>day${s.streak === 1 ? '' : 's'} in a row</span></div>
    </div>
    <div class="pg-legend"><span><i class="pg-c"></i>not yet</span><span><i class="pg-c r1"></i>read once</span><span><i class="pg-c r2"></i>twice</span><span><i class="pg-c r3"></i>3+ times</span><span><i class="pg-c r1 wk"></i>this week</span>
      <button class="pg-mark" data-pgmark="1">Mark ${esc(bookName(state.cur.book))} ${state.cur.ch} as read</button></div>
    <div class="section-title">Old Testament</div><div class="pg-grid">${state.books.filter((b) => b.id <= 39).map(row).join('')}</div>
    <div class="section-title">New Testament</div><div class="pg-grid">${state.books.filter((b) => b.id >= 40).map(row).join('')}</div>
    <div class="hint">A chapter counts as read when you read it to the end, stay with it for 45 seconds, or tick it off in your reading plan. Click any square to open that chapter.</div>`, 'm-prog');
}

// ===================================================================== timeline
const ERAS = [
  { name: 'Creation to the Flood', from: -4003, to: -2348 },
  { name: 'The patriarchs', from: -2347, to: -1706 },
  { name: 'Israel in Egypt', from: -1705, to: -1491 },
  { name: 'The Exodus and the wilderness', from: -1490, to: -1452 },
  { name: 'Conquest and the judges', from: -1451, to: -1096 },
  { name: 'The united kingdom', from: -1095, to: -975 },
  { name: 'The divided kingdom', from: -974, to: -586 },
  { name: 'Exile and return', from: -585, to: -400 },
  { name: 'Between the Testaments', from: -399, to: -5 },
  { name: 'The life of Christ', from: -4, to: 30 },
  { name: 'The early church', from: 31, to: 200 },
];
const eraOf = (y) => ERAS.findIndex((e) => y >= e.from && y <= e.to);

async function openTimeline(focusEid) {
  if (!v37.timeline) v37.timeline = await tsk.timeline();
  const here = new Set((await tsk.eventsForChapter(state.cur.book, state.cur.ch)).map((e) => e.eid));
  const byEra = ERAS.map(() => []);
  for (const e of v37.timeline) {
    const i = eraOf(e.year);
    if (i >= 0) byEra[i].push(e);
  }
  openModal(`<div class="kicker">Timeline</div><h2 class="m-title">Bible history</h2>
    <p class="hint">Dates follow the chronology of Floyd Nolen Jones, worked out from the ages, reigns and periods the KJV gives (close to Archbishop Ussher's). They are a traditional reckoning; dates before Abraham and some reigns are debated.</p>
    <div class="tl-bar">${ERAS.map((e, i) => `<button data-era="${i}" title="${esc(e.name)}" style="flex:${Math.max(1, byEra[i].length)}">${esc(e.name)}</button>`).join('')}</div>
    <input id="tlFilter" class="tl-filter" placeholder="Find an event (e.g. Exodus, David, Pentecost)" aria-label="Find an event" />
    <div class="tl-list">${byEra
      .map((evs, i) => (evs.length ? `<section class="tl-era" id="era${i}"><h3>${esc(ERAS[i].name)}</h3>${evs
        .map((e) => `<div class="tl-ev${here.has(e.eid) ? ' here' : ''}" id="ev${e.eid}" data-ev="${e.eid}" tabindex="0">
          <span class="tl-date">${esc(e.date)}</span><span class="tl-dot" aria-hidden="true"></span>
          <span class="tl-title">${esc(e.title)}${here.has(e.eid) ? ' <span class="tl-here">this chapter</span>' : ''}</span>
          ${e.verseId ? `<span class="tl-ref">${esc(e.label)}</span>` : ''}<div class="tl-more"></div></div>`)
        .join('')}</section>` : ''))
      .join('')}</div>
    <div class="hint">Timeline from Theographic Bible Metadata (Robert Rouse, CC BY-SA 4.0). Click an event for its passages.</div>`, 'm-tl');
  const target = focusEid ? $(`#ev${focusEid}`) : $('.tl-ev.here') || null;
  if (target) {
    target.classList.add('focus');
    target.scrollIntoView({ block: 'center' });
    toggleEvent(target);
  }
}

async function toggleEvent(row) {
  const more = $('.tl-more', row);
  if (more.innerHTML) {
    more.innerHTML = '';
    row.classList.remove('open');
    return;
  }
  const ps = await tsk.eventVerses(Number(row.dataset.ev));
  row.classList.add('open');
  more.innerHTML = ps.length ? ps.map((p) => `<button class="pl-vs" data-dvgo="${p.s}">${esc(p.label)}</button>`).join('') : '<span class="hint">No passage listed.</span>';
}

// ===================================================================== People (family tree)
async function peopleForVerse(id) {
  v37.people = await tsk.peopleInVerse(id);
  if (!v37.person || !v37.people.some((p) => p.pid === v37.person)) {
    if (v37.people.length) {
      v37.person = v37.people[0].pid;
      v37.line = null;
    }
  }
  if (state.tab === 'people') renderPeople();
}

const shortNote = (s, n = 70) => (s && s.length > n ? `${s.slice(0, n)}…` : s || '');
function pcard(p, cls = '', self = null) {
  const co = p.coparent ? `<i>${p.sex === 'female' ? 'mother' : 'father'} of ${self && self.sex === 'female' ? 'her' : 'his'} children</i>`
    : { husband: 'wife', wife: 'husband', concubinator: 'concubine', concubine: 'she was his concubine' }[p.rel] ? `<i>${{ husband: 'wife', wife: 'husband', concubinator: 'concubine', concubine: 'she was his concubine' }[p.rel]}</i>` : '';
  return `<button class="pcard ${cls}" data-pid="${esc(p.pid)}" title="${esc(p.note || '')}"><b>${esc(p.name)}</b>${p.supposed ? '<i>as was supposed</i>' : ''}${co}<span>${esc(shortNote(p.note, 54))}</span>${p.ref ? `<em class="pref">${esc(p.ref)}</em>` : ''}</button>`;
}

async function renderPeople() {
  const pane = $('#pane-people');
  if (!pane) return;
  if (!v37.person) v37.person = state.settings.person || 'Jesus';
  const p = await tsk.person(v37.person);
  if (!p) {
    pane.innerHTML = '<div class="empty">Person not found.</div>';
    return;
  }
  state.settings.person = p.pid;
  const kids = p.children.slice(0, 30);
  pane.innerHTML = `
    <div class="pp-top"><input id="pplSearch" placeholder="Find anyone in the Bible (e.g. Ruth, Jacob)" aria-label="Find a person" autocomplete="off" /><div id="pplResults" class="ppl-results" hidden></div></div>
    ${v37.people.length ? `<div class="pp-verse"><span class="lbl">In this verse</span>${v37.people.map((x) => `<button class="tagchip${x.pid === p.pid ? ' on' : ''}" data-pid="${esc(x.pid)}">${esc(x.name)}</button>`).join('')}</div>` : ''}
    ${v37.personBack.length ? `<button class="backlink" data-act="pplBack">&#8592; Back</button>` : ''}
    <div class="kicker">People · family</div>
    <h2 class="pp-name">${esc(p.name)}</h2>
    ${p.aka && p.aka.length ? `<div class="pp-aka">Also called ${p.aka.slice(0, 6).map(esc).join(', ')}</div>` : ''}
    <div class="sub">${esc(p.note || '')}${p.tribe ? ` · tribe of ${esc(p.tribe)}` : ''}</div>
    <div class="pp-actions">${p.firstVerse ? `<button class="pl-vs" data-dvgo="${p.firstVerse}">First named: ${esc(p.firstRef)}</button>` : ''}
      <button class="linkish" data-act="pplVerses">${p.verses.toLocaleString()} verse${p.verses === 1 ? '' : 's'} name ${p.sex === 'female' ? 'her' : 'him'}</button>
      <button class="linkish" data-act="pplLine">Line from Adam</button></div>
    <div class="tree">
      <div class="tree-row parents">${p.parents.length ? p.parents.map((x) => pcard(x, 'parent')).join('') : '<span class="tree-none">Parents not named</span>'}</div>
      <div class="tree-link" aria-hidden="true"></div>
      <div class="tree-row middle">${p.spouses.slice(0, 10).map((x) => pcard(x, 'spouse', p)).join('')}<div class="pcard self"><b>${esc(p.name)}</b><span>${esc(shortNote(p.note, 60))}</span></div></div>
      ${kids.length ? `<div class="tree-link" aria-hidden="true"></div><div class="tree-row children">${kids.map((x) => pcard(x, 'child')).join('')}${p.children.length > kids.length ? `<span class="tree-none">…and ${p.children.length - kids.length} more</span>` : ''}</div>` : '<div class="tree-none" style="text-align:center">No children named</div>'}
      ${p.siblings.length ? `<div class="tree-sib"><span class="lbl">Brothers and sisters</span>${p.siblings.slice(0, 30).map((x) => `<button class="tagchip" data-pid="${esc(x.pid)}" title="${esc(x.note || '')}">${esc(x.name)}</button>`).join('')}</div>` : ''}
    </div>
    <div id="pplExtra"></div>
    <div class="hint" style="margin-top:12px">Family links from BibleData (Brady Stephenson, CC BY 4.0); the small reference under a name is the verse that states the relationship. Click anyone to see their family.</div>`;
  if (v37.line === p.pid) showLine(p.pid);
}

async function showLine(pid) {
  const line = await tsk.personLine(pid);
  v37.line = pid;
  const box = $('#pplExtra');
  if (!line.length) {
    box.innerHTML = '<div class="empty">No line to Adam is recorded for this person.</div>';
    return;
  }
  box.innerHTML = `<div class="section-title">The line from Adam — ${line.length} generations</div>
    <ol class="pp-line" reversed>${line.slice().reverse().map((x) => `<li><button class="linkish" data-pid="${esc(x.pid)}">${esc(x.name)}</button> <span class="hint">${esc(shortNote(x.note, 80))}</span></li>`).join('')}</ol>`;
  box.scrollIntoView({ block: 'nearest' });
}

async function showPersonVerses(pid) {
  const vs = await tsk.personVerses(pid, 400);
  $('#pplExtra').innerHTML = `<div class="section-title">Verses that name ${esc(($('.pp-name') || {}).textContent || '')}${vs.length >= 400 ? ' (first 400)' : ''}</div>
    <div class="results">${vs.map((v) => `<div class="hit" data-id="${v.id}"><div class="lab">${esc(v.label)}</div><div class="t">${esc(v.text)}</div></div>`).join('')}</div>`;
}

function showPerson(pid) {
  if (v37.person && v37.person !== pid) v37.personBack.push(v37.person);
  v37.person = pid;
  v37.line = null;
  saveUser(['settings']);
  renderPeople().then(() => ($('#pane-people').scrollTop = 0));
}

// ===================================================================== smarter notes: linked references, backlinks, templates
let refRe = null;
function refRegex() {
  if (refRe) return refRe;
  const names = new Set();
  for (const b of state.books) {
    names.add(b.name);
    names.add(b.abbr);
  }
  ['Jn', 'Ps', 'Psalm', 'Mt', 'Mk', 'Lk', 'Rom', 'Gen', 'Ex', 'Deut', 'Isa', 'Jer', 'Heb', 'Rev', 'Prov', 'Eccl', 'Matt', 'Phil', 'Col', 'Eph', 'Gal', 'Jas'].forEach((n) => names.add(n));
  const alt = [...names].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s?')).join('|');
  refRe = new RegExp(`\\b(${alt})\\.?\\s*(\\d{1,3}):(\\d{1,3})(?:\\s*[-–]\\s*(\\d{1,3}))?`, 'gi');
  return refRe;
}

async function findRefs(text) {
  const out = [];
  const re = refRegex();
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text))) {
    const r = state.parse(`${m[1]} ${m[2]}:${m[3]}`);
    if (!r || !r.vs) continue;
    const s = await tsk.verseId(r.book, r.ch, r.vs);
    if (!s) continue;
    const e = m[4] ? (await tsk.verseId(r.book, r.ch, Number(m[4]))) || s : s;
    out.push({ s, e: Math.max(s, e), index: m.index, len: m[0].length, text: m[0] });
  }
  return out;
}

async function indexNote(id) {
  const t = state.notes[id];
  if (!t) v37.noteRefs.delete(Number(id));
  else v37.noteRefs.set(Number(id), (await findRefs(t)).map(({ s, e }) => ({ s, e })));
}
async function indexAllNotes() {
  for (const k of Object.keys(state.notes || {})) await indexNote(k);
}

async function linkify(text) {
  const refs = await findRefs(text);
  let html = '';
  let at = 0;
  for (const r of refs) {
    html += esc(text.slice(at, r.index)) + `<span class="ref nref" data-s="${r.s}" data-e="${r.e}">${esc(r.text)}</span>`;
    at = r.index + r.len;
  }
  return html + esc(text.slice(at));
}

const TEMPLATES = {
  soap: (label) => `S — Scripture: ${label}\nO — Observation: \nA — Application: \nP — Prayer: `,
  prayer: (label) => `Prayer — ${new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}\nRequest: \nPraying this verse: ${label}\nAnswered: `,
};

function decorateNote(id) {
  const note = $('#pane-refs textarea.note');
  if (!note || $('#pane-refs .note-tools')) return;
  note.insertAdjacentHTML('afterend', `<div class="note-tools">
      <span class="lbl">Templates</span>
      <button data-tpl="soap" title="Scripture, Observation, Application, Prayer">SOAP study</button>
      <button data-tpl="prayer" title="A prayer entry with today's date; mark it answered later">Prayer journal</button>
      <button data-act="answered" class="ans" hidden>Mark prayer answered</button>
      <span class="note-links"></span></div>
    <div class="note-back"></div>`);
  refreshNoteLinks(id);
  updateAnsweredButton();
  growNote(note);
}

async function refreshNoteLinks(id) {
  const t = state.notes[id] || '';
  const refs = (await findRefs(t)).filter((r) => r.s !== id);
  const links = $('#pane-refs .note-links');
  if (links) links.innerHTML = refs.length ? `<span class="lbl">Linked</span>${refs.map((r) => `<span class="ref" data-s="${r.s}" data-e="${r.e}">${esc(r.text)}</span>`).join('')}` : '';
  // backlinks: your other notes that mention this verse
  if (!v37.noteIndexed) {
    v37.noteIndexed = true;
    await indexAllNotes();
  }
  const back = [];
  for (const [nid, rs] of v37.noteRefs) if (nid !== id && rs.some((r) => r.s <= id && r.e >= id)) back.push(nid);
  const box = $('#pane-refs .note-back');
  if (!box || !state.xref || state.xref.verse.id !== id) return;
  if (!back.length) {
    box.innerHTML = '';
    return;
  }
  const vs = await tsk.versesByIds(back.sort((a, b) => a - b));
  box.innerHTML = `<span class="lbl">Mentioned in your notes on</span>${vs.map((v) => `<span class="ref" data-s="${v.id}" data-e="${v.id}" title="${esc((state.notes[v.id] || '').slice(0, 160))}">${esc(v.label)}</span>`).join('')}`;
}

function growNote(ta) {
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = `${Math.min(320, Math.max(64, ta.scrollHeight + 4))}px`;
}

function updateAnsweredButton() {
  const t = ($('#pane-refs textarea.note') || {}).value || '';
  const b = $('#pane-refs [data-act="answered"]');
  if (b) b.hidden = !/^Answered:\s*$/m.test(t);
}

function applyTemplate(kind) {
  const ta = $('#pane-refs textarea.note');
  if (!ta || !state.xref) return;
  const v = state.xref.verse;
  const tpl = TEMPLATES[kind](`${v.label} — “${v.text.length > 90 ? `${v.text.slice(0, 90)}…` : v.text}”`);
  ta.value = ta.value.trim() ? `${ta.value.replace(/\s+$/, '')}\n\n${tpl}` : tpl;
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  growNote(ta);
  // put the cursor on the first line to fill in
  const pos = ta.value.indexOf(kind === 'soap' ? 'O — Observation: ' : 'Request: ', ta.value.length - tpl.length);
  ta.focus();
  const at = pos + (kind === 'soap' ? 'O — Observation: '.length : 'Request: '.length);
  ta.setSelectionRange(at, at);
  const tags = new Set(state.tags[v.id] || []);
  tags.add(kind === 'soap' ? 'soap' : 'prayer');
  setTags(v.id, [...tags].join(', '));
  const tin = $('#pane-refs .tagin');
  if (tin) tin.value = [...tags].join(', ');
}

function markAnswered() {
  const ta = $('#pane-refs textarea.note');
  if (!ta) return;
  const stamp = `Answered: ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} — `;
  ta.value = ta.value.replace(/^Answered:\s*$/m, stamp);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  const at = ta.value.indexOf(stamp) + stamp.length;
  ta.focus();
  ta.setSelectionRange(at, at);
  const id = state.xref.verse.id;
  const tags = new Set(state.tags[id] || []);
  tags.add('answered');
  setTags(id, [...tags].join(', '));
  const tin = $('#pane-refs .tagin');
  if (tin) tin.value = [...tags].join(', ');
}

// references in the Notes tab become links; answered prayers get a badge
{
  const prevMarks = window.renderMarks;
  window.renderMarks = async function () {
    await prevMarks();
    for (const el of $$('#pane-marks .nt')) {
      if (el.dataset.linked) continue;
      el.dataset.linked = '1';
      const t = el.textContent;
      el.innerHTML = await linkify(t);
      if (/^Answered:\s*\S/m.test(t)) el.insertAdjacentHTML('afterbegin', '<span class="answered-badge">Answered</span>');
    }
  };
}

// ===================================================================== command box (Ctrl+K)
const COMMANDS = [
  ['Devotional — Morning and Evening', 'devotional spurgeon today', () => openDaily(0, null)],
  ['Timeline of Bible history', 'dates history chronology', () => openTimeline()],
  ['Reading progress', 'chapters read heat map stats', () => openProgress()],
  ['Reading plan', 'schedule today', () => openPlan()],
  ['Cross-references tab', 'refs tsk', () => switchTab('refs')],
  ['Word study tab', 'hebrew greek strongs interlinear', () => switchTab('words')],
  ['Commentary tab', 'matthew henry', () => switchTab('comm')],
  ['Topics tab', 'naves', () => switchTab('topics')],
  ['Places tab (maps)', 'map', () => document.querySelector('.tabs [data-tab="places"]').click()],
  ['Journeys (maps)', 'paul jesus exodus routes', async () => {
    state.settings.placesView = 'journeys';
    document.querySelector('.tabs [data-tab="places"]').click();
  }],
  ['People and family tree', 'genealogy family', () => switchTab('people')],
  ['Notes', 'notes tags highlights bookmarks lessons', () => switchTab('marks')],
  ['Reading options', 'font size spacing', () => openReadingOptions()],
  ['Light / sepia / dark', 'theme night', () => toggleTheme()],
  ['High contrast on or off', 'accessibility contrast', () => setContrast(state.settings.contrast !== 'on')],
  ['Larger interface', 'zoom accessibility bigger', () => stepUi(1)],
  ['Smaller interface', 'zoom accessibility', () => stepUi(-1)],
  ['Focus mode', 'just the text', () => typeof setFocus === 'function' && setFocus(!document.body.classList.contains('focus'))],
  ['Quick start guide', 'help', () => openQuickStart()],
  ['Take the tour', 'help', () => typeof startTour === 'function' && startTour()],
];

function openCmdk() {
  const box = $('#cmdk');
  box.hidden = false;
  const inp = $('#cmdkInput');
  inp.value = '';
  v37.cmdSel = 0;
  renderCmdk();
  inp.focus();
}
const closeCmdk = () => ($('#cmdk').hidden = true);

async function renderCmdk() {
  const q = $('#cmdkInput').value.trim();
  const ql = q.toLowerCase();
  const items = [];
  if (q) {
    const r = state.parse(q);
    if (r) {
      const label = `${bookName(r.book)} ${r.ch}${r.vs ? `:${r.vs}` : ''}`;
      items.push({ kind: 'Go to', label, run: () => go({ book: r.book, ch: r.ch, vs: r.vs || undefined }) });
    }
  }
  const score = (t, k) => {
    const s = `${t} ${k}`.toLowerCase();
    if (!ql) return 1;
    if (t.toLowerCase().startsWith(ql)) return 3;
    if (s.split(/\s+/).some((w) => w.startsWith(ql))) return 2;
    return s.includes(ql) ? 1 : 0;
  };
  COMMANDS.map(([t, k, run]) => ({ kind: 'Open', label: t, run, sc: score(t, k) }))
    .filter((x) => x.sc)
    .sort((a, b) => b.sc - a.sc)
    .slice(0, q ? 6 : 12)
    .forEach((x) => items.push(x));
  if (q.length >= 2) {
    const [people, journeys] = await Promise.all([tsk.personSearch(q), loadJourneys()]);
    if ($('#cmdkInput').value.trim() !== q) return; // typed on
    people.slice(0, 4).forEach((p) => items.push({ kind: 'Person', label: p.name, sub: shortNote(p.note, 60), run: () => { switchTab('people'); showPerson(p.pid); } }));
    (journeys || []).filter((j) => `${j.title} ${j.who}`.toLowerCase().includes(ql)).slice(0, 4).forEach((j) => items.push({
      kind: 'Journey', label: `${j.who === j.title ? '' : `${j.who}: `}${j.title}`, sub: j.scripture,
      run: () => { state.settings.placesView = 'journeys'; selectJourney(j.id); document.querySelector('.tabs [data-tab="places"]').click(); renderJourneys(null); },
    }));
    if (!v37.timeline) v37.timeline = await tsk.timeline();
    v37.timeline.filter((e) => e.title.toLowerCase().includes(ql)).slice(0, 3).forEach((e) => items.push({ kind: 'Event', label: e.title, sub: e.date, run: () => openTimeline(e.eid) }));
    const notes = Object.entries(state.notes || {}).filter(([, t]) => t.toLowerCase().includes(ql)).slice(0, 4);
    if (notes.length) {
      const vs = await tsk.versesByIds(notes.map(([k]) => Number(k)));
      vs.forEach((v) => items.push({ kind: 'Your note', label: v.label, sub: shortNote(state.notes[v.id], 70), run: () => go({ id: v.id }) }));
    }
    items.push({ kind: 'Search', label: `Search the Bible for “${q}”`, run: () => { $('#searchInput').value = q; runSearch(q); switchTab('search'); } });
  }
  v37.cmdItems = items;
  v37.cmdSel = Math.min(v37.cmdSel || 0, Math.max(0, items.length - 1));
  $('#cmdkList').innerHTML = items.length
    ? items.map((it, i) => `<div class="cmdk-item${i === v37.cmdSel ? ' on' : ''}" data-ci="${i}" role="option" aria-selected="${i === v37.cmdSel}"><span class="cmdk-kind">${esc(it.kind)}</span><span class="cmdk-label">${esc(it.label)}</span>${it.sub ? `<span class="cmdk-sub">${esc(it.sub)}</span>` : ''}</div>`).join('')
    : '<div class="cmdk-empty">Nothing found.</div>';
}

function runCmd(i) {
  const it = (v37.cmdItems || [])[i];
  if (!it) return;
  closeCmdk();
  closeModal();
  Promise.resolve(it.run()).catch(() => {});
}

// ===================================================================== accessibility
const UI_STEPS = [0.9, 1, 1.1, 1.25, 1.4, 1.6];
function applyAccessibility() {
  const s = state.settings;
  const z = Number(s.uiScale) || 1;
  if (v37.zoom !== z) {
    v37.zoom = z;
    tsk.uiZoom(z);
  }
  document.body.classList.toggle('hc', s.contrast === 'on');
  document.body.classList.toggle('reduce-motion', reduceMotion());
}
function stepUi(d) {
  const cur = Number(state.settings.uiScale) || 1;
  const i = UI_STEPS.reduce((best, v, k) => (Math.abs(v - cur) < Math.abs(UI_STEPS[best] - cur) ? k : best), 1);
  state.settings.uiScale = UI_STEPS[Math.min(UI_STEPS.length - 1, Math.max(0, i + d))];
  applySettings();
  saveUser(['settings']);
  toast(`Interface size ${Math.round(state.settings.uiScale * 100)}%`);
}
function setContrast(on) {
  state.settings.contrast = on ? 'on' : 'off';
  applySettings();
  saveUser(['settings']);
  toast(on ? 'High contrast on' : 'High contrast off');
}
// (interface size and contrast are on the Settings page, built in study.js)
// labels for icon-only buttons; tabs as a tab list
function labelControls() {
  for (const b of $$('button[title]')) if (!b.getAttribute('aria-label') && !b.textContent.trim().match(/[a-z]{3}/i)) b.setAttribute('aria-label', b.title.replace(/\s*\(.*\)$/, ''));
  const tabs = $('.tabs');
  if (tabs) {
    tabs.setAttribute('role', 'tablist');
    $$('.tabs button').forEach((b) => {
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(b.classList.contains('on')));
    });
  }
  $('#readerInner') && $('#readerInner').setAttribute('aria-live', 'off');
}

// ===================================================================== tour + quick start
{
  const i = TOUR.findIndex((t) => t.title === 'Your trail');
  TOUR.splice(i >= 0 ? i : TOUR.length - 1, 0,
    { el: '[data-tab="people"]', tab: 'people', title: 'People', text: 'Everyone named in the verse, with their family: parents, husband or wife, children, brothers and sisters — each link with the verse that states it. Follow any line back to Adam.' },
    { el: '#btnTimeline', title: 'Timeline', text: 'Timeline shows Bible history in order, with the chapter you are reading marked. Spurgeon\'s Morning and Evening is on Today and in the Go menu. Press Ctrl+K anywhere to jump to any feature, person, journey or note.' });
  const prevQS = window.openQuickStart;
  window.openQuickStart = () => {
    prevQS();
    const first = $('#modal .qs section');
    if (first) first.insertAdjacentHTML('afterend', `<section><h3>Study tools</h3><ul>
      <li><b>Ctrl+K</b> opens the command box: type a reference, a feature, a person, a journey or words from your notes.</li>
      <li><b>Devotional</b> (Today, or ${tsk.web ? 'Menu' : 'Go menu'}): Spurgeon's <i>Morning and Evening</i> for today. <b>Timeline</b>: Bible history in order; the chapter you are reading is marked.</li>
      <li><b>‖</b> beside a verse number means the same event is told elsewhere; <b>“</b> means the New Testament quotes it or it quotes the Old. See Related verses, and <i>Side by side</i>.</li>
      <li><b>People</b> tab: the family of anyone named in the verse, with the verse for every link.</li>
      <li>Notes: <i>SOAP study</i> and <i>Prayer journal</i> templates; references you type (e.g. Rom 8:28) become links, and a verse shows which of your notes mention it.</li>
      <li><b>Plan › Reading progress</b>: every chapter you have read, as a map of the Bible.</li></ul></section>`);
  };
}

// ===================================================================== events
function wireV37() {
  $('#btnDaily').addEventListener('click', () => openDaily(0, null));
  $('#btnTimeline').addEventListener('click', () => openTimeline());
  $('#readerInner').addEventListener('click', (e) => {
    const d = e.target.closest('.ch-date');
    if (d) openTimeline(Number(d.dataset.tl));
  });
  // modal content (daily, side by side, timeline, progress)
  $('#modal').addEventListener('click', (e) => {
    const t = e.target;
    const dv = t.closest('[data-dv]');
    if (dv) return openDaily(dv.dataset.dv === 'today' ? 0 : v37.dayOffset + (dv.dataset.dv === 'next' ? 1 : -1), v37.period);
    const dvp = t.closest('[data-dvp]');
    if (dvp) return openDaily(v37.dayOffset, dvp.dataset.dvp);
    const g = t.closest('[data-dvgo]');
    if (g) {
      closeModal();
      return go({ id: Number(g.dataset.dvgo) });
    }
    const era = t.closest('[data-era]');
    if (era) return $(`#era${era.dataset.era}`) && $(`#era${era.dataset.era}`).scrollIntoView({ block: 'start', behavior: reduceMotion() ? 'auto' : 'smooth' });
    const ev = t.closest('.tl-ev');
    if (ev) return toggleEvent(ev);
    const pg = t.closest('[data-pgb]');
    if (pg) {
      closeModal();
      return go({ book: Number(pg.dataset.pgb), ch: Number(pg.dataset.pgc), vs: 1 });
    }
    if (t.closest('[data-pgmark]')) {
      markRead(state.cur.book, state.cur.ch, false);
      return openProgress();
    }
    const ui = t.closest('[data-ui]');
    if (ui) {
      state.settings.uiScale = Number(ui.dataset.ui);
      applySettings();
      saveUser(['settings']);
      return openReadingOptions();
    }
    const hc = t.closest('[data-hc]');
    if (hc) {
      setContrast(hc.dataset.hc === 'on');
      return openReadingOptions();
    }
    // ticking off a plan day marks its chapters read
    const day = t.closest('input[data-day]');
    if (day && day.checked) {
      const s = planStatus && planStatus();
      if (s) for (const [b, c] of s.days[Number(day.dataset.day)] || []) markRead(b, c);
    }
  });
  $('#modal').addEventListener('input', (e) => {
    if (e.target.id !== 'tlFilter') return;
    const q = e.target.value.trim().toLowerCase();
    $$('#modal .tl-ev').forEach((r) => (r.hidden = !!q && !$('.tl-title', r).textContent.toLowerCase().includes(q)));
    $$('#modal .tl-era').forEach((s) => (s.hidden = !!q && !$$('.tl-ev', s).some((r) => !r.hidden)));
  });
  $('#modal').addEventListener('keydown', (e) => {
    const ev = e.target.closest && e.target.closest('.tl-ev');
    if (ev && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      toggleEvent(ev);
    }
  });
  // Refs tab: side by side, templates, answered
  $('#pane-refs').addEventListener('click', (e) => {
    const sbs = e.target.closest('[data-sbs]');
    if (sbs && state.xref) return openSideBySide(sbs.dataset.sbs.split(',').map(Number), state.xref.verse.id);
    const tpl = e.target.closest('[data-tpl]');
    if (tpl) return applyTemplate(tpl.dataset.tpl);
    if (e.target.closest('[data-act="answered"]')) return markAnswered();
  });
  $('#pane-refs').addEventListener('input', (e) => {
    if (!e.target.classList.contains('note')) return;
    const id = Number(e.target.dataset.id);
    growNote(e.target);
    updateAnsweredButton();
    clearTimeout(v37.noteTimer);
    v37.noteTimer = setTimeout(async () => {
      await indexNote(id);
      refreshNoteLinks(id);
      for (const el of $$('#pane-marks .nt')) delete el.dataset.linked;
    }, 700);
  });
  // Notes tab: a reference inside a note opens that verse
  $('#pane-marks').addEventListener('click', (e) => {
    const r = e.target.closest('.nref');
    if (!r) return;
    e.stopPropagation();
    go({ id: Number(r.dataset.s) });
  }, true);
  // People tab
  const pp = $('#pane-people');
  pp.addEventListener('click', (e) => {
    const c = e.target.closest('[data-pid]');
    if (c) return showPerson(c.dataset.pid);
    if (e.target.closest('[data-act="pplBack"]')) {
      v37.person = v37.personBack.pop();
      v37.line = null;
      return renderPeople();
    }
    if (e.target.closest('[data-act="pplLine"]')) return showLine(v37.person);
    if (e.target.closest('[data-act="pplVerses"]')) return showPersonVerses(v37.person);
    const g = e.target.closest('[data-dvgo]');
    if (g) return go({ id: Number(g.dataset.dvgo) }).then(() => switchTab('people'));
    const hit = e.target.closest('.hit');
    if (hit) return go({ id: Number(hit.dataset.id) }).then(() => switchTab('people'));
  });
  pp.addEventListener('input', async (e) => {
    if (e.target.id !== 'pplSearch') return;
    const q = e.target.value.trim();
    const box = $('#pplResults');
    if (q.length < 2) {
      box.hidden = true;
      return;
    }
    const rs = await tsk.personSearch(q);
    box.hidden = false;
    box.innerHTML = rs.length ? rs.map((p) => `<button data-pid="${esc(p.pid)}"><b>${esc(p.name)}</b> <span>${esc(shortNote(p.note, 70))}</span></button>`).join('') : '<div class="hint">No one by that name.</div>';
  });
  // command box
  const ck = $('#cmdk');
  $('#cmdkInput').addEventListener('input', () => {
    v37.cmdSel = 0;
    renderCmdk();
  });
  $('#cmdkInput').addEventListener('keydown', (e) => {
    const n = (v37.cmdItems || []).length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      v37.cmdSel = (v37.cmdSel + (e.key === 'ArrowDown' ? 1 : -1) + n) % Math.max(n, 1);
      $$('#cmdkList .cmdk-item').forEach((el, i) => {
        el.classList.toggle('on', i === v37.cmdSel);
        el.setAttribute('aria-selected', String(i === v37.cmdSel));
        if (i === v37.cmdSel) el.scrollIntoView({ block: 'nearest' });
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runCmd(v37.cmdSel);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeCmdk();
    }
  });
  ck.addEventListener('click', (e) => {
    const it = e.target.closest('.cmdk-item');
    if (it) return runCmd(Number(it.dataset.ci));
    if (e.target === ck) closeCmdk();
  });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if ($('#cmdk').hidden) openCmdk();
      else closeCmdk();
    }
  });
  tsk.onMenu((cmd) => {
    if (cmd === 'daily') openDaily(0, null);
    else if (cmd === 'timeline') openTimeline();
    else if (cmd === 'progress') openProgress();
    else if (cmd === 'cmdk') ($('#cmdk').hidden ? openCmdk() : closeCmdk());
    else if (cmd === 'uiUp') stepUi(1);
    else if (cmd === 'uiDown') stepUi(-1);
    else if (cmd === 'contrast') setContrast(state.settings.contrast !== 'on');
    else if (cmd === 'tab:people') renderPeople();
  });
  // the Plan window links to reading progress
  const prevPlan = window.openPlan;
  window.openPlan = function () {
    prevPlan();
    const t = $('#modal .m-title');
    if (t) t.insertAdjacentHTML('afterend', '<button class="linkish pg-link" data-act="openProgress">See your reading progress across the whole Bible</button>');
  };
  $('#modal').addEventListener('click', (e) => {
    if (e.target.closest('[data-act="openProgress"]')) openProgress();
  });
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', applyAccessibility);
  labelControls();
  applyAccessibility();
}

wireV37();
