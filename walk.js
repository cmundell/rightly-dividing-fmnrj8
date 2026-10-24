'use strict';
/* Today, Time with God, the gospel, the prayer list and journal, ways to practise memory verses; family devotions, reminders and Listen (set aside for now, see features.js); study methods and discipleship paths.
   Merged in 3.15 from the per-release layers (v38.js, v381.js, v39.js), kept in their original order: later
   sections still extend earlier ones by wrapping window.X. */

// =====================================================================================================
// from v38.js
// =====================================================================================================
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
  const name = state.settings.name;
  const bk = state.books[(state.cur.book || 1) - 1];
  const paths = FEATURES.paths ? await loadPaths().catch(() => []) : [];
  const going = paths.find((p) => Object.keys(pathProgress(p.id).done).length && Object.keys(pathProgress(p.id).done).length < p.steps.length);
  const badges = Object.keys((state.walk && state.walk.badges) || {}).length;
  openModal(`<div class="kicker">${esc(longDate(today))}</div>
    <h2 class="m-title">${hello}${name ? `, ${esc(name)}` : ''}</h2>
    <blockquote class="td-invite">“${esc(text)}” <span>${esc(ref)}</span></blockquote>
    ${bk ? `<button class="td-open" data-td4="open">Open your Bible<span>Continue in ${esc(bk.name)} ${state.cur.ch}</span></button>` : ''}
    ${typeof showcaseHtml === 'function' ? showcaseHtml() : ''}
    <button class="td-begin primary-btn" data-wk="begin">${done ? 'Spend more time with God' : 'Begin time with God'}<span>Pray · Read · Reflect · Pray · Remember</span></button>
    <div class="td-tiles">
      ${FEATURES.paths ? `<button data-td2="paths"><b>Discipleship paths</b><span>${going ? `${esc(going.title)}: step ${pathProgress(going.id).cur}` : 'First Steps, Growing in Christ, Leading Your Family'}</span></button>` : ''}
      <button data-td2="study"><b>Study methods</b><span>Guided worksheets: observe, words, people, topics</span></button>
      ${st ? `<button data-td="family"><b>Family devotions</b><span>Story ${st.n} of 52: ${esc(st.title)}</span></button>` : ''}
      ${FEATURES.prayer === false ? '' : `<button data-td="prayers"><b>Prayer list</b><span>${open ? `${open} request${open === 1 ? '' : 's'} you are praying for` : 'Keep a list of what you are praying for'}</span></button>`}
      <button data-td="memory"><b>Memory verses</b><span>${due ? `${due} to practise today` : `${Object.keys(state.memory || {}).length || 'No'} verse${Object.keys(state.memory || {}).length === 1 ? '' : 's'} hidden in your heart`}</span></button>
      <button data-td="plan"><b>Reading plan</b><span>${planToday.length ? `Today: ${esc(planLabel(planToday))}` : ps && ps.finished ? 'Plan finished — well done' : 'Choose a plan to read through the Bible'}</span></button>
      <button data-td="daily"><b>Devotional</b><span>Spurgeon's Morning and Evening for today</span></button>
      <button data-td="journal"><b>Journal</b><span>${state.journal.length ? `${state.journal.length} entr${state.journal.length === 1 ? 'y' : 'ies'}` : 'Your time with God, written down'}</span></button>
      <button data-td="gospel"><b>The gospel</b><span>How to be saved — to read, print or share</span></button>
      <button data-td3="badges"><b>Medallions</b><span>${badges ? `${badges} collected` : 'Milestones in memorizing and reading'}</span></button>
    </div>
    <div class="td-quiet" title="Days with God's Word: Time with God, or a chapter read">
      This week: ${w.days} day${w.days === 1 ? '' : 's'} in the Word · ${w.chapters} chapter${w.chapters === 1 ? '' : 's'} ${FEATURES.family ? `· ${w.family} family devotion${w.family === 1 ? '' : 's'}` : ''}
      ${FEATURES.reminders ? '<button class="linkish" data-td="remind">Gentle reminders…</button>' : ''}
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
  if (!FEATURES.reminders) return;
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
  const i = TOUR.findIndex((t) => t.el === '#btnTimeline');
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

// =====================================================================================================
// from v381.js
// =====================================================================================================
/* v3.8.1: Listen — the KJV read aloud by an offline British voice, verse by verse, with the verse being read
   highlighted. Works in the reader, in family devotions and in Time with God. Loaded after v38.js. */
/* global tsk, state, $, $$, esc, go, toast, saveUser, todayStr, markRead, v38, bookName, COMMANDS, TOUR, openQuickStart */

const listen = {
  ok: null, // is the voice installed?
  ctx: null,
  list: [], // [{ id, text, label }]
  i: 0,
  playing: false,
  paused: false,
  src: null,
  cache: new Map(), // verse id -> Promise<AudioBuffer>
  token: 0, // bumps when playback is restarted, so stale callbacks stop
  where: null, // { kind: 'chapter', book, ch } | { kind: 'passage', title }
  scope: null, // element to highlight within (reader or a dialog)
};
const LISTEN_SPEEDS = [0.8, 0.9, 1, 1.1, 1.25];
const BASE_SPEED = 0.92; // a measured pace for Scripture
const lsSpeed = () => Number(state.settings.listenSpeed) || 1;

async function listenAvailable() {
  if (listen.ok === null) listen.ok = !!(await tsk.speechAvailable().catch(() => false));
  return listen.ok;
}

function audioFor(v) {
  const key = `${v.id}@${lsSpeed()}`;
  if (!listen.cache.has(key)) {
    // the model's speed: larger is faster; our setting is "how fast", so divide the length
    const p = tsk.speak(v.text, BASE_SPEED * lsSpeed()).then((a) => {
      const ctx = listen.ctx;
      const buf = ctx.createBuffer(1, a.samples.length, a.sampleRate);
      buf.copyToChannel(a.samples instanceof Float32Array ? a.samples : Float32Array.from(a.samples), 0);
      return buf;
    });
    p.catch(() => listen.cache.delete(key));
    listen.cache.set(key, p);
    if (listen.cache.size > 80) listen.cache.delete(listen.cache.keys().next().value);
  }
  return listen.cache.get(key);
}

function prefetch(from) {
  for (let k = from; k < Math.min(from + 3, listen.list.length); k++) audioFor(listen.list[k]);
}

/** Start reading a list of verses. opts: { start, where, scope } */
async function startListening(list, opts = {}) {
  if (!(await listenAvailable())) return toast('The read-aloud voice is not installed.');
  if (!list.length) return;
  stopListening(true);
  listen.ctx = listen.ctx || new AudioContext();
  if (listen.ctx.state === 'suspended') await listen.ctx.resume();
  listen.list = list;
  listen.i = Math.max(0, Math.min(list.length - 1, opts.start || 0));
  listen.where = opts.where || null;
  listen.scope = opts.scope || '#readerInner';
  listen.playing = true;
  listen.paused = false;
  showPlayer();
  playCurrent();
}

async function playCurrent() {
  const my = ++listen.token;
  const v = listen.list[listen.i];
  if (!v) return finished();
  markSpeaking(v.id);
  updatePlayer(true);
  prefetch(listen.i);
  let buf;
  try {
    buf = await audioFor(v);
  } catch (e) {
    if (my !== listen.token) return;
    stopListening();
    return toast('Could not read this aloud.');
  }
  if (my !== listen.token || !listen.playing) return;
  updatePlayer(false);
  const src = listen.ctx.createBufferSource();
  src.buffer = buf;
  src.connect(listen.ctx.destination);
  src.onended = () => {
    if (my !== listen.token || !listen.playing) return;
    listen.src = null;
    setTimeout(() => {
      if (my !== listen.token || !listen.playing) return;
      listen.i += 1;
      playCurrent();
    }, 380); // a breath between verses
  };
  listen.src = src;
  src.start();
}

async function finished() {
  const w = listen.where;
  if (w && w.kind === 'chapter') {
    markRead(w.book, w.ch);
    const bk = state.books[w.book - 1];
    if (state.settings.listenOn !== 'off' && (w.ch < bk.chapters || w.book < 66)) {
      // carry on into the next chapter
      const nb = w.ch < bk.chapters ? w.book : w.book + 1;
      const nc = w.ch < bk.chapters ? w.ch + 1 : 1;
      await go({ book: nb, ch: nc, vs: 1 });
      return listenToChapter(nb, nc, 0);
    }
  }
  stopListening();
}

function stopListening(quiet) {
  listen.token += 1;
  listen.playing = false;
  listen.paused = false;
  if (listen.src) {
    try {
      listen.src.onended = null;
      listen.src.stop();
    } catch {
      /* already stopped */
    }
  }
  listen.src = null;
  if (listen.ctx && listen.ctx.state === 'suspended') listen.ctx.resume();
  markSpeaking(null);
  if (!quiet) hidePlayer();
}

function togglePause() {
  if (!listen.playing || !listen.ctx) return;
  if (listen.paused) {
    listen.ctx.resume();
    listen.paused = false;
  } else {
    listen.ctx.suspend();
    listen.paused = true;
  }
  updatePlayer(false);
}

function skip(d) {
  if (!listen.list.length) return;
  const i = Math.max(0, Math.min(listen.list.length - 1, listen.i + d));
  const keep = { list: listen.list, where: listen.where, scope: listen.scope };
  stopListening(true);
  Object.assign(listen, keep, { i, playing: true, paused: false });
  playCurrent();
}

function setListenSpeed(s) {
  state.settings.listenSpeed = s;
  saveUser(['settings']);
  if (listen.playing) skip(0); // re-read the current verse at the new pace
  else updatePlayer(false);
}

function markSpeaking(id) {
  $$('.speaking').forEach((el) => el.classList.remove('speaking'));
  if (id == null) return;
  const scope = $(listen.scope) || document;
  const el = $(`[data-id="${id}"]`, scope) || $(`[data-wkv="${id}"]`, scope);
  if (!el) return;
  el.classList.add('speaking');
  const box = el.getBoundingClientRect();
  if (box.top < 90 || box.bottom > window.innerHeight - 80) el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

// ---------------------------------------------------------------- what to read
async function listenToChapter(book = state.cur.book, ch = state.cur.ch, start = null) {
  const c = await tsk.chapter(book, ch);
  const nm = c.name.replace(/^Psalms$/, 'Psalm');
  const list = c.verses.map((v) => ({ id: v.id, text: v.text, label: `${nm} ${ch}:${v.vs}` }));
  if (start === null) {
    const sel = state.cur.sel && state.cur.book === book && state.cur.ch === ch ? list.findIndex((v) => v.id === state.cur.sel) : -1;
    start = sel >= 0 ? sel : 0;
  }
  // say where we are at the start of each chapter
  if (start === 0) list[0] = { ...list[0], text: `${nm}, chapter ${ch}. ${list[0].text}` };
  return startListening(list, { start, where: { kind: 'chapter', book, ch }, scope: '#readerInner' });
}

function listenToVerses(verses, title, scope) {
  const list = verses.map((v) => ({ id: v.id, text: v.t || v.text, label: v.label || title }));
  return startListening(list, { where: { kind: 'passage', title }, scope });
}

// ---------------------------------------------------------------- player bar
function showPlayer() {
  let bar = $('#lsBar');
  if (!bar) {
    document.body.insertAdjacentHTML('beforeend', `<div id="lsBar" class="ls-bar" role="region" aria-label="Read aloud">
      <button data-ls="prev" title="Previous verse" aria-label="Previous verse">&#9198;</button>
      <button data-ls="play" class="ls-play" title="Pause (Space)" aria-label="Pause">&#10074;&#10074;</button>
      <button data-ls="next" title="Next verse" aria-label="Next verse">&#9197;</button>
      <button data-ls="stop" title="Stop" aria-label="Stop">&#9632;</button>
      <span class="ls-where" aria-live="polite"></span>
      <span class="ls-spin" hidden>preparing…</span>
      <label class="ls-speed">Pace <select data-ls="speed" aria-label="Reading pace">${LISTEN_SPEEDS.map((s) => `<option value="${s}">${s === 1 ? 'Normal' : s < 1 ? (s === 0.8 ? 'Slowest' : 'Slower') : s === 1.1 ? 'Faster' : 'Fastest'}</option>`).join('')}</select></label>
      <label class="ls-on" title="When a chapter ends, go on to the next"><input type="checkbox" data-ls="on" /> Keep going</label>
    </div>`);
    bar = $('#lsBar');
  }
  bar.hidden = false;
  document.body.classList.add('listening');
  updatePlayer(false);
}
function hidePlayer() {
  const bar = $('#lsBar');
  if (bar) bar.hidden = true;
  document.body.classList.remove('listening');
}
function updatePlayer(preparing) {
  const bar = $('#lsBar');
  if (!bar) return;
  const v = listen.list[listen.i];
  $('.ls-where', bar).textContent = v ? v.label : '';
  $('.ls-spin', bar).hidden = !preparing;
  const p = $('.ls-play', bar);
  p.innerHTML = listen.paused ? '&#9654;' : '&#10074;&#10074;';
  p.title = listen.paused ? 'Play (Space)' : 'Pause (Space)';
  p.setAttribute('aria-label', listen.paused ? 'Play' : 'Pause');
  $('[data-ls="speed"]', bar).value = String(lsSpeed());
  $('[data-ls="on"]', bar).checked = state.settings.listenOn !== 'off';
  $('.ls-on', bar).hidden = !(listen.where && listen.where.kind === 'chapter');
  $('#btnListen') && $('#btnListen').classList.toggle('on', listen.playing);
}

// ---------------------------------------------------------------- buttons in other places
function addListenButtons() {
  // family devotions: read the passage or the memory verse aloud
  const fm = $('#modal.m-family .fm-body');
  if (fm && !$('[data-lsx]', fm) && listen.ok) {
    const ref = $('.fm-ref', fm);
    if (ref) ref.insertAdjacentHTML('beforeend', ' <button class="ls-inline" data-lsx="family" title="Read it aloud">&#128266; Listen</button>');
  }
  const wk = $('#modal.m-walk .wk-read');
  if (wk && !$('[data-lsx]', $('#modal.m-walk')) && listen.ok) {
    wk.insertAdjacentHTML('beforebegin', '<button class="ls-inline" data-lsx="walk" title="Hear it read aloud">&#128266; Listen</button>');
  }
}

async function familyListenList() {
  const fam = await (window.loadFamily ? loadFamily() : tsk.family());
  const st = fam.stories[state.walk.family.cur - 1];
  const step = v38.famStep;
  if (step === 'remember') return [{ ...st.memory.verses[0], label: `Memory verse · ${st.memory.ref}` }];
  return st.passage.verses.map((v) => ({ ...v, label: `${st.passage.ref.replace(/:.*/, '')}:${v.v}` }));
}

// ---------------------------------------------------------------- wiring
function wireListen() {
  $('#btnToday').insertAdjacentHTML('afterend', '<button id="btnListen" class="icon text" title="Listen: hear this chapter read aloud (Ctrl+Shift+L)">Listen</button>');
  listenAvailable().then((ok) => {
    if (!ok) $('#btnListen').hidden = true;
  });
  $('#btnListen').addEventListener('click', () => (listen.playing ? stopListening() : listenToChapter()));
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('#lsBar [data-ls]');
    if (b) {
      const k = b.dataset.ls;
      if (k === 'play') return togglePause();
      if (k === 'stop') return stopListening();
      if (k === 'prev') return skip(-1);
      if (k === 'next') return skip(1);
      return;
    }
    const x = e.target.closest('[data-lsx]');
    if (x) {
      if (x.dataset.lsx === 'family') {
        const list = await familyListenList();
        // the family passage spans are not tagged; tag them so the verse being read is highlighted
        $$('#modal .fm-text > span').forEach((sp, k) => list[k] && sp.setAttribute('data-id', list[k].id));
        return listenToVerses(list, 'Family devotions', '#modal');
      }
      if (x.dataset.lsx === 'walk') {
        const ids = $$('#modal .wk-v').map((el) => Number(el.dataset.wkv));
        const vs = await tsk.versesByIds(ids);
        return listenToVerses(vs.map((v) => ({ id: v.id, text: v.text, label: v.label })), 'Time with God', '#modal');
      }
    }
  });
  document.addEventListener('change', (e) => {
    const s = e.target.closest('#lsBar [data-ls="speed"]');
    if (s) return setListenSpeed(Number(s.value));
    const on = e.target.closest('#lsBar [data-ls="on"]');
    if (on) {
      state.settings.listenOn = on.checked ? 'on' : 'off';
      saveUser(['settings']);
    }
  });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      return listen.playing ? stopListening() : listenToChapter();
    }
    // Space pauses while listening, unless typing
    if (e.key === ' ' && listen.playing && !e.target.closest('input, textarea, select, [contenteditable], button')) {
      e.preventDefault();
      togglePause();
    }
  });
  // the dialogs re-render; put the Listen buttons back each time, and stop reading a dialog that closes
  new MutationObserver(() => {
    addListenButtons();
    if (listen.playing && listen.scope === '#modal' && $('#modal').hidden) stopListening();
  }).observe($('#modal'), { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] });
  tsk.onMenu((cmd) => {
    if (cmd === 'listen') listen.playing ? stopListening() : listenToChapter();
  });
  const i = TOUR.findIndex((t) => t.el === '#btnToday');
  // only mention Listen where the voice is installed (it is set aside in current releases)
  listenAvailable().then((ok) => {
    if (!ok) return;
    COMMANDS.unshift(['Listen to this chapter', 'read aloud audio voice speak hear', () => listenToChapter()]);
    TOUR.splice(i >= 0 ? i + 1 : TOUR.length - 1, 0, { el: '#btnListen', title: 'Listen', text: 'Hear the chapter read aloud by a British voice, verse by verse, with the verse being read highlighted. It all happens on your computer — no internet needed. Choose the pace, and whether to keep going into the next chapter.' });
  });
  const prevQS = window.openQuickStart;
  window.openQuickStart = () => {
    prevQS();
    if (!listen.ok) return;
    const ul = $('#modal .qs section ul');
    const walk = $$('#modal .qs section').find((s) => /Your daily walk/.test(s.textContent));
    if (walk) $('ul', walk).insertAdjacentHTML('beforeend', '<li><b>Listen</b> (Ctrl+Shift+L): the chapter read aloud from the verse you have selected; Space pauses. Time with God has a Listen button too.</li>');
    else if (ul) ul.insertAdjacentHTML('beforeend', '<li><b>Listen</b> (Ctrl+Shift+L): the chapter read aloud.</li>');
  };
}

wireListen();

// =====================================================================================================
// from v39.js
// =====================================================================================================
/* v3.9: Study methods (guided worksheets that teach how to study a passage, using the app's own study data)
   and discipleship paths (First Steps, Growing in Christ, Leading Your Family). Loaded after v381.js. */
/* global tsk, state, $, $$, esc, go, toast, saveUser, openModal, closeModal, todayStr, newId, v32, v38, switchTab,
   renderMarks, toggleMemory, COMMANDS, TOUR, openQuickStart, listenToVerses, listen, showMarksView, sheetPage, bookName */

const v39 = { paths: null, study: null, pathTab: 'read' };

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
  const saveKeys = ['journal'];
  if (st.from) {
    const pp = pathProgress(st.from.path);
    pp.studied = pp.studied || {};
    pp.studied[st.from.step] = todayStr();
    saveKeys.push('walk');
  }
  saveUser(saveKeys);
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

// ===================================================================== discipleship paths
async function loadPaths() {
  if (!v39.paths) v39.paths = (await tsk.paths()).paths;
  return v39.paths;
}
function pathProgress(pid) {
  state.walk.paths = state.walk.paths || {};
  state.walk.paths[pid] = state.walk.paths[pid] || { cur: 1, done: {} };
  return state.walk.paths[pid];
}

async function openPaths() {
  const paths = await loadPaths();
  openModal(`<div class="kicker">Discipleship paths</div><h2 class="m-title">Grow step by step</h2>
    <p class="hint">Each path has eight steps. Every step has a passage to read, a short teaching, a study method to practise, questions to talk over together, and one thing to do. Go through it on your own, or better, with someone else — a mentor, a friend, your husband or wife.</p>
    <div class="pt-list">${paths.map((p) => {
      const pp = pathProgress(p.id);
      const n = Object.keys(pp.done).length;
      return `<button class="pt-card" data-pt="${p.id}"><b>${esc(p.title)}</b><span>${esc(p.who)}</span>
        <span class="pt-bar" aria-label="${n} of ${p.steps.length} steps done"><i style="width:${(n / p.steps.length) * 100}%"></i></span>
        <span class="pt-next">${n >= p.steps.length ? 'Completed — well done' : n ? `Continue: step ${pp.cur}, ${esc(p.steps[pp.cur - 1].title)}` : 'Begin'}</span></button>`;
    }).join('')}</div>`, 'm-paths');
}

async function openPathStep(pid, n, tab) {
  const paths = await loadPaths();
  const p = paths.find((x) => x.id === pid);
  const pp = pathProgress(pid);
  if (n) pp.cur = Math.min(Math.max(1, n), p.steps.length);
  if (tab) v39.pathTab = tab;
  v39.pathId = pid;
  saveUser(['walk']);
  const s = p.steps[pp.cur - 1];
  const t = v39.pathTab;
  const tabs = [['read', 'Read'], ['learn', 'Learn'], ['study', 'Study'], ['talk', 'Talk'], ['do', 'Do']];
  const m = METHODS[s.method];
  let body = '';
  if (t === 'read') {
    body = s.passages.map((x) => `<div class="fm-ref">${esc(x.ref)}${listen && listen.ok ? ' <button class="ls-inline" data-ptlisten="1" title="Hear it read aloud">&#128266; Listen</button>' : ''}</div><div class="pt-text">${x.verses.map((v) => `<span data-id="${v.id}"><sup>${v.v}</sup>${esc(v.t)} </span>`).join('')}</div>`).join('');
  } else if (t === 'learn') {
    const mv = s.memory.verses[0];
    body = `<p class="pt-teach">${esc(s.teach).replace(/&quot;([^&]+)&quot;/g, '“$1”')}</p>
      <div class="section-title">Memory verse</div><blockquote class="wk-verse sm">“${esc(mv.t)}” <span>${esc(s.memory.ref)}</span></blockquote>
      ${state.memory && state.memory[mv.id] ? '<p class="hint">This verse is in your memory verses.</p>' : `<button data-ptmem="${mv.id}">Add to my memory verses</button>`}`;
  } else if (t === 'study') {
    body = `<p>This step practises <b>${esc(m.name)}</b>: ${esc(m.blurb)}</p>
      <ol class="pt-how">${m.how.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
      <button class="primary-btn" data-ptstudy="1">Open the ${esc(m.name)} worksheet for ${esc(s.passages[0].ref)}</button>
      ${pp.studied && pp.studied[pp.cur] ? `<p class="hint">You saved a worksheet for this step on ${new Date(`${pp.studied[pp.cur]}T00:00`).toLocaleDateString()}.</p>` : ''}`;
  } else if (t === 'talk') {
    body = `<ol class="pt-qs">${s.questions.map((q) => `<li>${esc(q)}</li>`).join('')}</ol>
      <div class="section-title">Together</div><p class="pt-together">${esc(s.together).replace(/&quot;([^&]+)&quot;/g, '“$1”')}</p>`;
  } else {
    const done = pp.done[pp.cur];
    body = `<div class="section-title">This week</div><p class="pt-action">${esc(s.action)}</p>
      <div class="fm-finish">${done ? `<p>You completed this step on ${new Date(`${done}T00:00`).toLocaleDateString()}.</p>` : ''}<button class="primary-btn" data-ptdone="1">${done ? 'Go on to the next step' : 'Mark this step complete'}</button></div>`;
  }
  openModal(`<div class="fm-head"><div><div class="kicker">${esc(p.title)} · step ${pp.cur} of ${p.steps.length}</div><h2 class="m-title">${esc(s.title)}</h2></div>
      <div class="dv-nav"><button data-ptnav="prev" ${pp.cur > 1 ? '' : 'disabled'} aria-label="Previous step">&#8249;</button><button data-ptnav="list">All steps</button><button data-ptnav="next" ${pp.cur < p.steps.length ? '' : 'disabled'} aria-label="Next step">&#8250;</button></div></div>
    <div class="vswitch fm-tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${t === k}" data-pttab="${k}" class="${t === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="pt-body">${body}</div>
    <div class="fm-foot"><button data-ptnav="paths">All paths</button><button data-ptprint="1" title="Print this step to meet with someone">Print</button>${t !== 'do' ? `<button class="primary-btn" data-ptnext="1">Next: ${tabs[tabs.findIndex(([k]) => k === t) + 1][1]}</button>` : ''}</div>`, 'm-path');
}

async function openPathSteps(pid) {
  const p = (await loadPaths()).find((x) => x.id === pid);
  const pp = pathProgress(pid);
  openModal(`<div class="kicker">Discipleship paths</div><h2 class="m-title">${esc(p.title)}</h2><p class="hint">${esc(p.who)}</p>
    <div class="fl-grid">${p.steps.map((s) => `<button class="fl-item${s.n === pp.cur ? ' here' : ''}${pp.done[s.n] ? ' done' : ''}" data-ptstep="${s.n}"><span class="fl-n">${s.n}</span><span class="fl-t">${esc(s.title)}</span><span class="fl-r">${esc(s.passages.map((x) => x.ref).join('; '))}</span>${pp.done[s.n] ? '<span class="fl-d" title="Completed">✓</span>' : ''}</button>`).join('')}</div>
    <div class="fm-foot"><button data-ptnav="paths">All paths</button></div>`, 'm-family-list');
}

async function printPathStep() {
  const p = (await loadPaths()).find((x) => x.id === v39.pathId);
  const pp = pathProgress(p.id);
  const s = p.steps[pp.cur - 1];
  const q = (t) => esc(t).replace(/&quot;([^&]+)&quot;/g, '“$1”');
  const html = sheetPage(`${p.title}: ${s.title}`, `<div class="k">${esc(p.title)} · step ${s.n} of ${p.steps.length}</div><h1>${esc(s.title)}</h1>
    ${s.passages.map((x) => `<h2>Read · ${esc(x.ref)}</h2><p>${x.verses.map((v) => `<sup>${v.v}</sup>${esc(v.t)}`).join(' ')}</p>`).join('')}
    <h2>Learn</h2><p>${q(s.teach)}</p><blockquote>${esc(s.memory.verses[0].t)}<cite>Memory verse · ${esc(s.memory.ref)}</cite></blockquote>
    <h2>Talk about it</h2><ol>${s.questions.map((x) => `<li>${esc(x)}<div style="height:.45in"></div></li>`).join('')}</ol>
    <p><b>Together:</b> ${q(s.together)}</p><h2>This week</h2><p>${esc(s.action)}</p>
    <p style="color:#5b6476">Study method to practise: ${esc(METHODS[s.method].name)}.</p>`);
  await tsk.printSheet(html);
}

// ===================================================================== Today, commands, tour, quick start
{
  if (FEATURES.paths) COMMANDS.unshift(['Discipleship paths', 'disciple mentor first steps growing family new believer', () => openPaths()]);
  COMMANDS.unshift(
    ['Study methods', 'inductive observe interpret apply soap word character topical verse mapping book overview worksheet', () => openStudyChooser()],
  );
  const i = TOUR.findIndex((t) => t.el === '#btnToday');
  if (i >= 0) TOUR[i] = { ...TOUR[i], text: `${TOUR[i].text}${FEATURES.paths ? ' Discipleship paths and study methods start here too.' : ' Study methods start here too.'}` };
  const prevQS = window.openQuickStart;
  window.openQuickStart = () => {
    prevQS();
    const walk = $$('#modal .qs section').find((s) => /Your daily walk/.test(s.textContent));
    if (walk) $('ul', walk).insertAdjacentHTML('beforeend', `${FEATURES.paths ? '' : '<!--'}<li><b>Discipleship paths</b> (Today): First Steps, Growing in Christ and Leading Your Family — eight steps each, to go through alone or with someone. <i>Print</i> a step to meet with a friend.</li>${FEATURES.paths ? '' : '-->'}
      <li><b>Study methods</b> (Today, or Ctrl+K): Observe–Interpret–Apply, SOAP, word study, character study, topical study, verse mapping and book overview, with study aids filled in for you. Saved in Notes › Journal.</li>`);
  };
}

// ===================================================================== events
function wireV39() {
  const modal = $('#modal');
  modal.addEventListener('click', async (e) => {
    const t = e.target;
    const td2 = t.closest('[data-td2]');
    if (td2) return td2.dataset.td2 === 'paths' ? openPaths() : openStudyChooser();
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
    // paths
    const pt = t.closest('[data-pt]');
    if (pt) {
      v39.pathTab = 'read';
      return openPathStep(pt.dataset.pt, pathProgress(pt.dataset.pt).cur);
    }
    const ptstep = t.closest('[data-ptstep]');
    if (ptstep) {
      v39.pathTab = 'read';
      return openPathStep(v39.pathId, Number(ptstep.dataset.ptstep));
    }
    const pttab = t.closest('[data-pttab]');
    if (pttab) return openPathStep(v39.pathId, null, pttab.dataset.pttab);
    if (t.closest('[data-ptnext]')) {
      const order = ['read', 'learn', 'study', 'talk', 'do'];
      return openPathStep(v39.pathId, null, order[order.indexOf(v39.pathTab) + 1] || 'do');
    }
    const nav = t.closest('[data-ptnav]');
    if (nav) {
      const k = nav.dataset.ptnav;
      if (k === 'paths') return openPaths();
      if (k === 'list') return openPathSteps(v39.pathId);
      const pp = pathProgress(v39.pathId);
      v39.pathTab = 'read';
      return openPathStep(v39.pathId, pp.cur + (k === 'next' ? 1 : -1));
    }
    const mem = t.closest('[data-ptmem]');
    if (mem) {
      toggleMemory(Number(mem.dataset.ptmem));
      return openPathStep(v39.pathId);
    }
    if (t.closest('[data-ptstudy]')) {
      const p = (await loadPaths()).find((x) => x.id === v39.pathId);
      const s = p.steps[pathProgress(p.id).cur - 1];
      const x = s.passages[0];
      return openStudy(s.method, { s: x.s, e: s.method === 'versemap' || s.method === 'word' ? s.memory.verses[0].id : x.e, from: { path: p.id, step: s.n, title: `${p.title}, step ${s.n}` } });
    }
    if (t.closest('[data-ptdone]')) {
      const p = (await loadPaths()).find((x) => x.id === v39.pathId);
      const pp = pathProgress(p.id);
      if (!pp.done[pp.cur]) {
        pp.done[pp.cur] = todayStr();
        state.walk.days[todayStr()] = state.walk.days[todayStr()] || 1;
        saveUser(['walk']);
        toast(pp.cur < p.steps.length ? 'Step complete. Well done.' : `You have finished ${p.title}. Praise the Lord!`);
        return openPathStep(p.id, pp.cur, 'do');
      }
      v39.pathTab = 'read';
      return pp.cur < p.steps.length ? openPathStep(p.id, pp.cur + 1) : openPaths();
    }
    if (t.closest('[data-ptprint]')) return printPathStep();
    if (t.closest('[data-ptlisten]')) {
      const p = (await loadPaths()).find((x) => x.id === v39.pathId);
      const s = p.steps[pathProgress(p.id).cur - 1];
      const list = s.passages.flatMap((x) => x.verses.map((v) => ({ id: v.id, t: v.t, label: `${x.ref.replace(/:.*/, '')}:${v.v}` })));
      return listenToVerses(list, 'Discipleship', '#modal');
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
    if (cmd === 'paths' && FEATURES.paths) openPaths();
    else if (cmd === 'study') openStudyChooser();
  });
}

wireV39();
