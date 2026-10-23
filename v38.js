'use strict';
/* v3.8: Daily walk and family — Today, Time with God, family devotions (52 Bible stories), the gospel,
   prayer list, journal, more ways to practise memory verses, and gentle reminders.
   Loaded after v37.js; overrides use window.X so earlier code picks them up. */
/* global tsk, state, $, $$, esc, go, toast, switchTab, saveUser, openModal, closeModal, todayStr, renderMarks, setTags,
   openPlan, planStatus, openDaily, openProgress, readingStats, markRead, v32, v33, startPractice, showPracticeCard,
   gradePractice, toggleMemory, MEMO_DAYS, WORD_RE, marksSwitch, newId, TOUR, openQuickStart, COMMANDS, bookName */

const v38 = {
  family: null, // { stories }
  gospel: null,
  walkStep: 0,
  session: null, // the Time with God in progress
  famStep: 'read',
  journalQ: '',
};
const dkey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const curly = (t) => String(t).replace(/"([^"]*)"/g, '“$1”');
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
const REFLECT = [
  ['god', 'What does this passage show me about God?', 'His character, His works, His promises…'],
  ['respond', 'Is there a command to obey, a promise to trust, a sin to turn from, or an example to follow?', ''],
  ['apply', 'How will I live this out today?', 'One small, concrete step'],
];

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
      family: Object.assign({ cur: 1, done: {}, age: 'both' }, w.family || {}),
      remind: Object.assign({ on: false, time: '07:00' }, w.remind || {}),
      lastRemind: w.lastRemind || '',
    };
  };
}
state.journal = state.journal || [];
state.prayers = state.prayers || [];
state.walk = state.walk || { days: {}, family: { cur: 1, done: {}, age: 'both' }, remind: { on: false, time: '07:00' }, lastRemind: '' };

async function loadFamily() {
  if (!v38.family) v38.family = await tsk.family();
  return v38.family;
}
async function loadGospel() {
  if (!v38.gospel) v38.gospel = await tsk.gospel();
  return v38.gospel;
}

// ===================================================================== gentle progress (no pressure)
function walkedOn(k) {
  return !!(state.walk.days[k] || (state.readlog && state.readlog.days[k]) || Object.values(state.walk.family.done).includes(k));
}
/** Days in a row with God's Word, with grace: one missed day in any seven doesn't break the walk. */
function graceStreak() {
  const d = new Date();
  if (!walkedOn(dkey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  const misses = [];
  for (let i = 0; i < 3650; i++) {
    const k = dkey(d);
    if (walkedOn(k)) n += 1;
    else {
      misses.push(i);
      if (misses.length > 1 && misses[misses.length - 1] - misses[misses.length - 2] < 7) break;
      if (i === 0) break;
    }
    d.setDate(d.getDate() - 1);
  }
  return n;
}
function weekSummary() {
  const d = new Date();
  let days = 0, chapters = 0, family = 0;
  const famDays = Object.values(state.walk.family.done);
  for (let i = 0; i < 7; i++) {
    const k = dkey(d);
    if (walkedOn(k)) days += 1;
    chapters += (state.readlog && state.readlog.days[k]) || 0;
    family += famDays.filter((x) => x === k).length;
    d.setDate(d.getDate() - 1);
  }
  return { days, chapters, family };
}
const inviteFor = (k) => INVITES[[...k].reduce((a, c) => a + c.charCodeAt(0), 0) % INVITES.length];

// ===================================================================== Today
async function openToday() {
  const today = todayStr();
  const w = weekSummary();
  const streak = graceStreak();
  const [ref, text] = inviteFor(today);
  const due = Object.values(state.memory || {}).filter((m) => m.due <= today).length;
  const open = state.prayers.filter((p) => !p.answered).length;
  const fam = FEATURES.family ? await loadFamily() : { stories: [] };
  const st = fam.stories[(state.walk.family.cur || 1) - 1] || fam.stories[0];
  const done = !!state.walk.days[today];
  const hr = new Date().getHours();
  const hello = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  const ps = typeof planStatus === 'function' ? planStatus() : null;
  const planToday = ps && !ps.finished ? ps.days[ps.today] || [] : [];
  openModal(`<div class="kicker">${esc(longDate(today))}</div>
    <h2 class="m-title">${hello}</h2>
    <blockquote class="td-invite">“${esc(text)}” <span>${esc(ref)}</span></blockquote>
    <button class="td-begin primary-btn" data-wk="begin">${done ? 'Spend more time with God' : 'Begin time with God'}<span>Pray · Read · Reflect · Pray · Remember</span></button>
    <div class="td-tiles">
      ${st ? `<button data-td="family"><b>Family devotions</b><span>Story ${st.n} of 52: ${esc(st.title)}</span></button>` : ''}
      <button data-td="prayers"><b>Prayer list</b><span>${open ? `${open} request${open === 1 ? '' : 's'} you are praying for` : 'Keep a list of what you are praying for'}</span></button>
      <button data-td="memory"><b>Memory verses</b><span>${due ? `${due} to practise today` : `${Object.keys(state.memory || {}).length || 'No'} verse${Object.keys(state.memory || {}).length === 1 ? '' : 's'} hidden in your heart`}</span></button>
      <button data-td="plan"><b>Reading plan</b><span>${planToday.length ? `Today: ${esc(planLabel(planToday))}` : ps && ps.finished ? 'Plan finished — well done' : 'Choose a plan to read through the Bible'}</span></button>
      <button data-td="daily"><b>Devotional</b><span>Spurgeon's Morning and Evening for today</span></button>
      <button data-td="journal"><b>Journal</b><span>${state.journal.length ? `${state.journal.length} entr${state.journal.length === 1 ? 'y' : 'ies'}` : 'Your time with God, written down'}</span></button>
      <button data-td="gospel"><b>The gospel</b><span>How to be saved — to read, print or share</span></button>
    </div>
    <div class="td-quiet" title="Days with God's Word: Time with God, or a chapter read">
      This week: ${w.days} day${w.days === 1 ? '' : 's'} in the Word · ${w.chapters} chapter${w.chapters === 1 ? '' : 's'} ${FEATURES.family ? `· ${w.family} family devotion${w.family === 1 ? '' : 's'}` : ''}${streak > 1 ? ` · walking ${streak} days` : ''}
      <button class="linkish" data-td="remind">Gentle reminders…</button>
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

// ===================================================================== Time with God
const WALK_STEPS = ['Prepare', 'Read', 'Reflect', 'Pray', 'Remember'];

function beginWalk() {
  const ps = typeof planStatus === 'function' ? planStatus() : null;
  const planToday = ps && !ps.finished ? ps.days[ps.today] || [] : [];
  v38.session = { step: 0, started: Date.now(), plan: planToday, chapters: [], answers: {}, prayer: '', prayed: [], carry: null, choice: planToday.length ? 'plan' : 'continue' };
  renderWalk();
}

function nextChapterToRead() {
  // the chapter after the one you most recently read; otherwise where you are now
  let best = null;
  for (const [k, c] of Object.entries(state.readlog.chapters || {})) if (!best || c.last > best.last || (c.last === best.last && k > best.k)) best = { k, last: c.last };
  if (!best) return [state.cur.book, state.cur.ch];
  const [b, c] = best.k.split(':').map(Number);
  const bk = state.books[b - 1];
  if (c < bk.chapters) return [b, c + 1];
  return b < 66 ? [b + 1, 1] : [1, 1];
}

async function renderWalk() {
  const s = v38.session;
  const bar = `<ol class="wk-steps">${WALK_STEPS.map((t, i) => `<li class="${i === s.step ? 'on' : i < s.step ? 'done' : ''}">${t}</li>`).join('')}</ol>`;
  let body = '';
  if (s.step === 0) {
    const [v] = await tsk.versesByIds([await tsk.verseId(19, 119, 18)]);
    body = `<p class="wk-lead">Before you read, ask the Lord to speak to you through His Word.</p>
      <blockquote class="wk-verse">“${esc(v.text)}” <span>Psalm 119:18</span></blockquote>
      <p class="hint">Take a moment. Put away distractions, quiet your heart, and pray this verse in your own words.</p>`;
  } else if (s.step === 1) {
    const cont = nextChapterToRead();
    const opts = [];
    if (s.plan.length) opts.push(['plan', `Today's plan: ${planLabel(s.plan)}`]);
    opts.push(['continue', `Continue reading: ${bookName(cont[0])} ${cont[1]}`]);
    opts.push(['here', `The chapter open now: ${bookName(state.cur.book)} ${state.cur.ch}`]);
    if (!s.chapters.length) s.chapters = s.choice === 'plan' && s.plan.length ? s.plan.slice() : s.choice === 'here' ? [[state.cur.book, state.cur.ch]] : [cont];
    const chs = await Promise.all(s.chapters.slice(0, 4).map(([b, c]) => tsk.chapter(b, c)));
    body = `<div class="wk-choose" role="radiogroup" aria-label="What to read">${opts.map(([k, t]) => `<button role="radio" aria-checked="${s.choice === k}" class="${s.choice === k ? 'on' : ''}" data-wkc="${k}">${esc(t)}</button>`).join('')}
        <form class="wk-other" data-wk-form="ref"><input placeholder="Or type a passage, e.g. Psalm 1" aria-label="Another passage" /><button>Read</button></form></div>
      <p class="hint">Read slowly. Click a verse that speaks to you to carry it with you today.</p>
      <div class="wk-read">${chs.map((ch) => `<h3>${esc(ch.name)} ${ch.ch}</h3>${ch.verses.map((v) => `<span class="wk-v${s.carry === v.id ? ' carry' : ''}" data-wkv="${v.id}"><sup>${v.vs}</sup>${esc(v.text)} </span>`).join('')}`).join('')}
        ${s.chapters.length > 4 ? `<p class="hint">…and ${s.chapters.length - 4} more chapter${s.chapters.length - 4 === 1 ? '' : 's'} in today's plan.</p>` : ''}</div>`;
  } else if (s.step === 2) {
    const carry = s.carry ? (await tsk.versesByIds([s.carry]))[0] : null;
    body = `${carry ? `<blockquote class="wk-verse sm">“${esc(carry.text)}” <span>${esc(carry.label)}</span></blockquote>` : ''}
      ${REFLECT.map(([k, q, ph]) => `<label class="wk-q">${esc(q)}<textarea data-wka="${k}" rows="3" placeholder="${esc(ph)}">${esc(s.answers[k] || '')}</textarea></label>`).join('')}
      <p class="hint">Write as much or as little as you like. It is saved in your journal when you finish.</p>`;
  } else if (s.step === 3) {
    const open = state.prayers.filter((p) => !p.answered);
    body = `<div class="wk-pray">
        <p><b>Praise</b> God for who He is — think of what you just read about Him.</p>
        <p><b>Confess</b> any sin He has shown you. “If we confess our sins, he is faithful and just to forgive us our sins” (1 John 1:9).</p>
        <p><b>Thank</b> Him for what He has done.</p>
        <p><b>Ask</b> for others and for yourself.</p></div>
      ${open.length ? `<div class="section-title">Your prayer list</div><div class="wk-plist">${open.map((p) => `<label><input type="checkbox" data-wkp="${p.id}" ${s.prayed.includes(p.id) ? 'checked' : ''}/> <span>${esc(p.text)}</span> <i>${esc(p.cat)}</i></label>`).join('')}</div>` : '<p class="hint">Your prayer list is empty. Add requests from Today › Prayer list.</p>'}
      <form class="wk-other" data-wk-form="prayer"><input placeholder="Add a prayer request" aria-label="Add a prayer request" /><button>Add</button></form>
      <label class="wk-q">Your prayer (optional)<textarea data-wka="prayer" rows="3">${esc(s.prayer || '')}</textarea></label>`;
  } else if (s.step === 4) {
    const due = Object.values(state.memory || {}).filter((m) => m.due <= todayStr()).length;
    const carry = s.carry ? (await tsk.versesByIds([s.carry]))[0] : null;
    body = `<p class="wk-lead">“Thy word have I hid in mine heart, that I might not sin against thee.” <span class="hint">Psalm 119:11</span></p>
      ${due ? `<p>You have <b>${due}</b> memory verse${due === 1 ? '' : 's'} to practise today.</p><button class="primary-btn" data-wk="practice">Practise now</button>` : '<p>No memory verses are due today.</p>'}
      ${carry ? `<div class="wk-carry"><blockquote class="wk-verse sm">“${esc(carry.text)}” <span>${esc(carry.label)}</span></blockquote>
        ${state.memory && state.memory[carry.id] ? '<p class="hint">This verse is already in your memory verses.</p>' : `<button data-wk="memorize" data-id="${carry.id}">Memorize this verse</button>`}</div>` : ''}`;
  } else {
    const w = weekSummary();
    body = `<div class="wk-done"><h3>Amen.</h3>
      <p>“The grass withereth, the flower fadeth: but the word of our God shall stand for ever.” <span class="hint">Isaiah 40:8</span></p>
      <p>Your time with God is saved in your journal. This week you have spent ${w.days} day${w.days === 1 ? '' : 's'} in the Word.</p>
      <div class="plan-foot"><button data-td="journal">Open journal</button><button class="primary-btn" data-wk="close">Done</button></div></div>`;
  }
  const nav = s.step <= 4 ? `<div class="wk-nav">${s.step ? '<button data-wk="back">Back</button>' : '<span></span>'}<button class="primary-btn" data-wk="next">${s.step === 4 ? 'Finish' : 'Next'}</button></div>` : '';
  openModal(`<div class="kicker">Time with God</div>${s.step <= 4 ? bar : ''}<div class="wk-body">${body}</div>${nav}`, 'm-walk');
  const first = $('#modal .wk-body textarea');
  if (first && s.step === 2) first.focus();
}

function finishWalk() {
  const s = v38.session;
  const today = todayStr();
  for (const [b, c] of s.chapters) markRead(b, c);
  const entry = {
    id: newId(),
    date: today,
    time: new Date().toTimeString().slice(0, 5),
    minutes: Math.max(1, Math.round((Date.now() - s.started) / 60000)),
    read: planLabel(s.chapters),
    chapters: s.chapters,
    carry: s.carry || null,
    answers: Object.fromEntries(Object.entries(s.answers).filter(([, v]) => v && v.trim())),
    prayer: (s.prayer || '').trim(),
    prayed: s.prayed.slice(),
  };
  state.journal.push(entry);
  state.walk.days[today] = (state.walk.days[today] || 0) + 1;
  for (const id of s.prayed) {
    const p = state.prayers.find((x) => x.id === id);
    if (p) p.lastPrayed = today;
  }
  saveUser(['journal', 'walk', 'prayers']);
  s.step = 5;
  renderWalk();
}

// ===================================================================== family devotions
async function openFamily(n) {
  const fam = await loadFamily();
  const f = state.walk.family;
  if (n) f.cur = Math.min(Math.max(1, n), fam.stories.length);
  const st = fam.stories[f.cur - 1];
  const step = v38.famStep;
  const doneOn = f.done[st.n];
  const ages = f.age;
  const tabs = [['read', 'Read'], ['talk', 'Talk'], ['remember', 'Remember'], ['pray', 'Pray']];
  let body = '';
  if (step === 'read') {
    body = `<div class="fm-ref">${esc(st.passage.ref)}</div><div class="fm-text">${st.passage.verses.map((v) => `<span><sup>${v.v}</sup>${esc(v.t)} </span>`).join('')}</div>
      <p class="fm-truth"><b>The big truth:</b> ${esc(st.truth)}</p>`;
  } else if (step === 'talk') {
    const q = (list, who) => `<div class="fm-qs"><h3>${who}</h3><ol>${list.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div>`;
    body = `<div class="ro-seg fm-age" role="group" aria-label="Questions for">${[['little', 'Little ones'], ['older', 'Older children'], ['both', 'Both']].map(([k, t]) => `<button data-fage="${k}" class="${ages === k ? 'on' : ''}">${t}</button>`).join('')}</div>
      ${ages !== 'older' ? q(st.little, 'For little ones') : ''}${ages !== 'little' ? q(st.older, 'For older children') : ''}
      <p class="hint">There is no need to ask every question. Let the children talk, and keep pointing back to what the verses say.</p>`;
  } else if (step === 'remember') {
    const v = st.memory.verses[0];
    v38.famHide = v38.famHide || 0;
    const words = v.t.split(/\s+/);
    const hideOrder = words.map((_, i) => i).sort((a, b) => ((a * 7919) % 13) - ((b * 7919) % 13) || a - b);
    const hidden = new Set(hideOrder.slice(0, v38.famHide));
    body = `<div class="fm-ref">Memory verse · ${esc(st.memory.ref)}</div>
      <div class="fm-text fm-mem">${words.map((w, i) => (hidden.has(i) ? `<span class="fm-blank">${'_'.repeat(Math.max(2, w.replace(/[^A-Za-z]/g, '').length))}${w.replace(/[A-Za-z']/g, '')}</span>` : esc(w))).join(' ')}</div>
      <div class="fm-btns"><button data-fm="hide" ${v38.famHide >= words.length ? 'disabled' : ''}>Hide a word</button><button data-fm="hide3" ${v38.famHide >= words.length ? 'disabled' : ''}>Hide three</button><button data-fm="show">Show all</button>
      ${state.memory && state.memory[v.id] ? '' : `<button data-fm="memorize" data-id="${v.id}">Add to my memory verses</button>`}</div>
      <p class="hint">Say it together, then hide a word and say it again — until you can say it with every word hidden. Practise it all week.</p>`;
  } else {
    body = `<p class="fm-pray">${esc(st.prayer)}</p>
      <p class="hint">Let each person pray a short sentence. Little ones can repeat after a parent.</p>
      <div class="fm-finish">${doneOn ? `<p>You read this together on ${esc(shortDate(doneOn))}.</p>` : ''}<button class="primary-btn" data-fm="done">${doneOn ? 'We did it again today' : 'We did this together'}</button></div>`;
  }
  openModal(`<div class="fm-head"><div><div class="kicker">Family devotions · story ${st.n} of ${fam.stories.length}</div><h2 class="m-title">${esc(st.title)}</h2></div>
      <div class="dv-nav"><button data-fm="prev" ${st.n > 1 ? '' : 'disabled'} aria-label="Previous story">&#8249;</button><button data-fm="list">All stories</button><button data-fm="next" ${st.n < fam.stories.length ? '' : 'disabled'} aria-label="Next story">&#8250;</button></div></div>
    <div class="vswitch fm-tabs" role="tablist">${tabs.map(([k, t]) => `<button role="tab" aria-selected="${step === k}" data-fstep="${k}" class="${step === k ? 'on' : ''}">${t}</button>`).join('')}</div>
    <div class="fm-body">${body}</div>
    <div class="fm-foot"><button data-fm="big" title="Fill the window — good for reading together">Large view</button><button data-fm="print" title="Print this devotion for the table or the fridge">Print</button>
      ${step !== 'pray' ? `<button class="primary-btn" data-fm="step">Next: ${tabs[tabs.findIndex(([k]) => k === step) + 1][1]}</button>` : ''}</div>`, `m-family${v38.famBig ? ' big' : ''}`);
}

async function openFamilyList() {
  const fam = await loadFamily();
  const f = state.walk.family;
  const nOT = fam.stories.filter((s) => s.passage.b <= 39).length;
  const item = (s) => `<button class="fl-item${s.n === f.cur ? ' here' : ''}${f.done[s.n] ? ' done' : ''}" data-fstory="${s.n}"><span class="fl-n">${s.n}</span><span class="fl-t">${esc(s.title)}</span><span class="fl-r">${esc(s.passage.ref)}</span>${f.done[s.n] ? '<span class="fl-d" title="Read together">✓</span>' : ''}</button>`;
  openModal(`<div class="kicker">Family devotions</div><h2 class="m-title">52 Bible stories — one a week for a year</h2>
    <p class="hint">Each story has a short passage to read together, questions for little ones and older children, a memory verse for the week, and a prayer. Everything is read from the King James text.</p>
    <div class="section-title">Old Testament</div><div class="fl-grid">${fam.stories.slice(0, nOT).map(item).join('')}</div>
    <div class="section-title">New Testament</div><div class="fl-grid">${fam.stories.slice(nOT).map(item).join('')}</div>`, 'm-family-list');
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
    @media print{body{margin:0 auto}}</style></head><body>${inner}<div class="f">Scripture from the King James Version. Made with Search the Scriptures.</div></body></html>`;
}

async function printFamily() {
  const fam = await loadFamily();
  const st = fam.stories[state.walk.family.cur - 1];
  const html = sheetPage(st.title, `<div class="k">Family devotions · story ${st.n}</div><h1>${esc(st.title)}</h1>
    <h2>Read together · ${esc(st.passage.ref)}</h2><p>${st.passage.verses.map((v) => `<sup>${v.v}</sup>${esc(v.t)}`).join(' ')}</p>
    <p><b>The big truth:</b> ${esc(st.truth)}</p>
    <h2>Talk about it</h2><b>For little ones</b><ol>${st.little.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
    <b>For older children</b><ol>${st.older.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
    <h2>Memory verse for the week</h2><blockquote>${esc(st.memory.verses[0].t)}<cite>${esc(st.memory.ref)}</cite></blockquote>
    <h2>Pray</h2><p>${esc(st.prayer)}</p>`);
  await tsk.printSheet(html);
}

// ===================================================================== the gospel
async function openGospel() {
  const g = await loadGospel();
  const vs = (x) => `<blockquote class="gs-verse">${x.verses.map((v) => esc(v.t)).join(' ')} <span>${esc(x.ref)}</span></blockquote>`;
  openModal(`<div class="kicker">The gospel</div><h2 class="m-title">How can I be saved?</h2>
    <p class="wk-lead">The Bible's good news, in God's own words.</p>
    <ol class="gs-steps">${g.steps.map((s) => `<li><h3>${esc(s.title)}</h3>${vs(s)}<p>${esc(curly(s.text))}</p></li>`).join('')}</ol>
    <div class="gs-pray"><h3>Will you trust Him?</h3><p>Words alone do not save; God looks at the heart that turns from sin and trusts Christ. If you are ready, you could pray something like this:</p>
      <p class="gs-prayer">“Lord Jesus, I know that I am a sinner and cannot save myself. I believe You died on the cross for my sins and rose again. I turn from my sin and trust You alone to save me. Thank You for Your gift of eternal life. Amen.”</p></div>
    <h3 class="gs-next-h">Next steps</h3>
    <ul class="gs-next">${g.next.map((s) => `<li><b>${esc(s.title)}.</b> ${esc(s.text)} <button class="pl-vs" data-dvgo="${s.s}">${esc(s.ref)}</button></li>`).join('')}</ul>
    <div class="fm-foot"><button data-gs="print">Print</button><button data-gs="pdf">Save as PDF</button><button data-gs="html" title="A web page anyone can open — to email or put on a USB stick">Save to share</button></div>`, 'm-gospel');
}

async function gospelPage() {
  const g = await loadGospel();
  return sheetPage('How can I be saved?', `<div class="k">The gospel</div><h1>How can I be saved?</h1><p>The Bible's good news, in God's own words.</p>
    ${g.steps.map((s, i) => `<h2>${i + 1}. ${esc(s.title)}</h2><blockquote>${s.verses.map((v) => esc(v.t)).join(' ')}<cite>${esc(s.ref)}</cite></blockquote><p>${esc(curly(s.text))}</p>`).join('')}
    <h2>Will you trust Him?</h2><p>Words alone do not save; God looks at the heart that turns from sin and trusts Christ. If you are ready, you could pray something like this:</p>
    <blockquote>Lord Jesus, I know that I am a sinner and cannot save myself. I believe You died on the cross for my sins and rose again. I turn from my sin and trust You alone to save me. Thank You for Your gift of eternal life. Amen.</blockquote>
    <h2>Next steps</h2><ul>${g.next.map((s) => `<li><b>${esc(s.title)}.</b> ${esc(s.text)} <i>(${esc(s.ref)}: “${esc(s.verses.map((v) => v.t).join(' '))}”)</i></li>`).join('')}</ul>`);
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
      <button data-jr="new">New entry</button><button class="primary-btn" data-wk="begin">Time with God</button></div>
    ${state.journal.length ? '' : '<div class="empty">Your journal fills in as you spend time with God: what you read, what it showed you, and what you prayed. You can also write a free entry any day.</div>'}
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
  const prevSwitch = window.marksSwitch;
  window.marksSwitch = () => {
    const v = v32.marksView;
    const open = state.prayers.filter((p) => !p.answered).length;
    return prevSwitch().replace(/(<\/div><button class="linkbtn")/, `<button data-mv="prayer" class="${v === 'prayer' ? 'on' : ''}">Prayer <span>${open || ''}</span></button><button data-mv="journal" class="${v === 'journal' ? 'on' : ''}">Journal <span>${state.journal.length || ''}</span></button>$1`);
  };
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

// ===================================================================== gentle reminders
function openReminders() {
  const r = state.walk.remind;
  openModal(`<div class="kicker">Gentle reminders</div><h2 class="m-title">A quiet nudge, never a nag</h2>
    <p class="hint">Search the Scriptures will never send you streak warnings or count what you missed. If you like, it can remind you once a day.</p>
    <div class="ro-grid">
      <label>Daily reminder</label><div class="ro-seg"><button data-rm="off" class="${r.on ? '' : 'on'}">Off</button><button data-rm="on" class="${r.on ? 'on' : ''}">On</button></div>
      <label for="rmTime">At</label><div><input id="rmTime" type="time" value="${esc(r.time)}" ${r.on ? '' : 'disabled'} /></div>
      <label>When I sign in to Windows</label><div class="ro-seg"><button data-login="off">Don't open</button><button data-login="on">Open the app</button></div>
    </div>
    <p class="hint">The reminder shows while the app is open (it can sit minimized), and only on days you haven't yet opened the Word. If it is off, nothing is sent.</p>`, 'm-remind');
  tsk.openAtLogin().then((on) => $$('#modal [data-login]').forEach((b) => b.classList.toggle('on', (b.dataset.login === 'on') === !!on)));
}

function checkReminder() {
  const r = state.walk.remind;
  if (!r.on) return;
  const now = new Date();
  const today = dkey(now);
  if (state.walk.lastRemind === today || walkedOn(today)) return;
  const [h, m] = String(r.time || '07:00').split(':').map(Number);
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return;
  state.walk.lastRemind = today;
  saveUser(['walk']);
  const [ref, text] = inviteFor(today);
  tsk.notify('Time with God', `“${text}” — ${ref}`);
  toast(`“${text}” — ${ref}`);
}

// ===================================================================== tour, quick start, commands
{
  const i = TOUR.findIndex((t) => t.el === '#btnDaily');
  TOUR.splice(i >= 0 ? i : TOUR.length - 1, 0, { el: '#btnToday', title: 'Today', text: `Start here each day. Time with God walks you through prayer, reading, reflecting, praying for others and remembering a verse — and saves it in your journal.${FEATURES.family ? ' Family devotions, your' : ' Your'} prayer list and the gospel are here too.` });
  const prevQS = window.openQuickStart;
  window.openQuickStart = () => {
    prevQS();
    const first = $('#modal .qs section');
    if (first) first.insertAdjacentHTML('afterend', `<section><h3>Your daily walk</h3><ul>
      <li><b>Today</b> (Ctrl+Shift+W): <i>Time with God</i> — prepare, read, reflect, pray and remember. It is saved in Notes › Journal.</li>
      ${FEATURES.family ? '<li><b>Family devotions</b> (Ctrl+Shift+Y): 52 Bible stories, one a week, with questions for little ones and older children, a memory verse and a prayer. <i>Large view</i> for reading together; <i>Print</i> for the table.</li>' : ''}
      <li><b>Notes › Prayer</b>: your prayer list by category; mark requests answered and keep a record of God's faithfulness.</li>
      <li><b>Memory verses</b>: practise with first letters, fill in the blanks, or type it out.</li>
      <li><b>The gospel</b>: how to be saved, in Scripture's own words — print it or save it to share.</li></ul></section>`);
  };
  if (FEATURES.family) COMMANDS.unshift(['Family devotions', 'children kids family stories', () => openFamily()]);
  COMMANDS.unshift(
    ['Today — time with God', 'walk devotion quiet time pray', () => openToday()],
    ['Time with God (guided)', 'quiet time devotion pray read reflect', () => beginWalk()],
    ['Prayer list', 'requests answered', () => showMarksView('prayer')],
    ['Journal', 'diary entries', () => showMarksView('journal')],
    ['The gospel — how to be saved', 'salvation saved romans road share', () => openGospel()],
    ['Gentle reminders', 'notification reminder login', () => openReminders()],
  );
}

// ===================================================================== events
function wireV38() {
  $('#btnDaily').insertAdjacentHTML('beforebegin', '<button id="btnToday" class="icon text" title="Today: time with God, prayer list, memory verses (Ctrl+Shift+W)">Today</button>');
  $('#btnToday').addEventListener('click', () => openToday());
  const modal = $('#modal');
  modal.addEventListener('click', async (e) => {
    const t = e.target;
    const td = t.closest('[data-td]');
    if (td) {
      const k = td.dataset.td;
      if (k === 'family') return openFamily();
      if (k === 'prayers') return showMarksView('prayer');
      if (k === 'journal') return showMarksView('journal');
      if (k === 'memory') return showMarksView('memory');
      if (k === 'plan') return openPlan();
      if (k === 'daily') return openDaily(0, null);
      if (k === 'gospel') return openGospel();
      if (k === 'remind') return openReminders();
    }
    const wk = t.closest('[data-wk]');
    if (wk) {
      const k = wk.dataset.wk;
      const s = v38.session;
      if (k === 'begin') return beginWalk();
      if (k === 'close') return closeModal();
      if (k === 'practice') return startPractice(false);
      if (k === 'memorize') {
        toggleMemory(Number(wk.dataset.id));
        return renderWalk();
      }
      if (!s) return;
      if (k === 'back') s.step = Math.max(0, s.step - 1);
      if (k === 'next') {
        if (s.step === 4) return finishWalk();
        s.step += 1;
      }
      return renderWalk();
    }
    const wkc = t.closest('[data-wkc]');
    if (wkc && v38.session) {
      v38.session.choice = wkc.dataset.wkc;
      v38.session.chapters = [];
      v38.session.carry = null;
      return renderWalk();
    }
    const wkv = t.closest('[data-wkv]');
    if (wkv && v38.session) {
      const id = Number(wkv.dataset.wkv);
      v38.session.carry = v38.session.carry === id ? null : id;
      $$('#modal .wk-v').forEach((el) => el.classList.toggle('carry', Number(el.dataset.wkv) === v38.session.carry));
      return;
    }
    const wkp = t.closest('[data-wkp]');
    if (wkp && v38.session) {
      const s = v38.session;
      s.prayed = wkp.checked ? [...new Set([...s.prayed, wkp.dataset.wkp])] : s.prayed.filter((x) => x !== wkp.dataset.wkp);
      return;
    }
    // family devotions
    const fs = t.closest('[data-fstep]');
    if (fs) {
      v38.famStep = fs.dataset.fstep;
      return openFamily();
    }
    const fage = t.closest('[data-fage]');
    if (fage) {
      state.walk.family.age = fage.dataset.fage;
      saveUser(['walk']);
      return openFamily();
    }
    const fstory = t.closest('[data-fstory]');
    if (fstory) {
      v38.famStep = 'read';
      v38.famHide = 0;
      state.walk.family.cur = Number(fstory.dataset.fstory);
      saveUser(['walk']);
      return openFamily();
    }
    const fm = t.closest('[data-fm]');
    if (fm) {
      const k = fm.dataset.fm;
      const f = state.walk.family;
      const order = ['read', 'talk', 'remember', 'pray'];
      if (k === 'prev' || k === 'next') {
        f.cur += k === 'next' ? 1 : -1;
        v38.famStep = 'read';
        v38.famHide = 0;
        saveUser(['walk']);
        return openFamily();
      }
      if (k === 'list') return openFamilyList();
      if (k === 'step') {
        v38.famStep = order[order.indexOf(v38.famStep) + 1] || 'pray';
        return openFamily();
      }
      if (k === 'hide' || k === 'hide3') {
        v38.famHide = (v38.famHide || 0) + (k === 'hide' ? 1 : 3);
        return openFamily();
      }
      if (k === 'show') {
        v38.famHide = 0;
        return openFamily();
      }
      if (k === 'memorize') {
        toggleMemory(Number(fm.dataset.id));
        return openFamily();
      }
      if (k === 'big') {
        v38.famBig = !v38.famBig;
        return openFamily();
      }
      if (k === 'print') return printFamily();
      if (k === 'done') {
        const fam = await loadFamily();
        f.done[f.cur] = todayStr();
        const finished = f.cur;
        if (f.cur < fam.stories.length) f.cur += 1;
        v38.famStep = 'read';
        v38.famHide = 0;
        saveUser(['walk']);
        toast(f.cur !== finished ? `Well done. Next time: ${fam.stories[f.cur - 1].title}` : 'You have read all 52 stories together. Praise the Lord!');
        return openFamily();
      }
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
    // reminders
    const rm = t.closest('[data-rm]');
    if (rm) {
      state.walk.remind.on = rm.dataset.rm === 'on';
      saveUser(['walk']);
      return openReminders();
    }
    const lg = t.closest('[data-login]');
    if (lg) {
      const on = await tsk.openAtLogin(lg.dataset.login === 'on');
      $$('#modal [data-login]').forEach((b) => b.classList.toggle('on', (b.dataset.login === 'on') === !!on));
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
  modal.addEventListener('input', (e) => {
    const a = e.target.closest('[data-wka]');
    if (a && v38.session) {
      if (a.dataset.wka === 'prayer') v38.session.prayer = a.value;
      else v38.session.answers[a.dataset.wka] = a.value;
    }
    if (e.target.id === 'rmTime') {
      state.walk.remind.time = e.target.value || '07:00';
      state.walk.lastRemind = '';
      saveUser(['walk']);
    }
  });
  modal.addEventListener('submit', async (e) => {
    const f = e.target.closest('[data-wk-form]');
    if (!f) return;
    e.preventDefault();
    const inp = $('input', f);
    const val = inp.value.trim();
    if (!val || !v38.session) return;
    if (f.dataset.wkForm === 'ref') {
      const r = state.parse(val);
      if (!r) return toast('Type a passage such as Psalm 1 or John 15');
      v38.session.choice = 'other';
      v38.session.chapters = [[r.book, r.ch]];
      v38.session.carry = null;
      return renderWalk();
    }
    const p = { id: newId(), text: val, cat: 'Myself', added: todayStr(), answered: null };
    state.prayers.push(p);
    v38.session.prayed.push(p.id);
    saveUser(['prayers']);
    renderWalk();
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
    const wk = e.target.closest('[data-wk="begin"]');
    if (wk) return beginWalk();
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
    else if (cmd === 'family' && FEATURES.family) openFamily();
    else if (cmd === 'prayers') showMarksView('prayer');
    else if (cmd === 'journal') showMarksView('journal');
    else if (cmd === 'gospel') openGospel();
  });
  setInterval(checkReminder, 60000);
  setTimeout(checkReminder, 5000);
}

wireV38();
