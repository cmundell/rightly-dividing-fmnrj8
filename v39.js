'use strict';
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
  const prevToday = window.openToday;
  window.openToday = async function () {
    await prevToday();
    const tiles = $('#modal .td-tiles');
    if (!tiles) return;
    const paths = await loadPaths().catch(() => []);
    const going = paths.find((p) => Object.keys(pathProgress(p.id).done).length && Object.keys(pathProgress(p.id).done).length < p.steps.length);
    tiles.insertAdjacentHTML('afterbegin', `<button data-td2="paths"><b>Discipleship paths</b><span>${going ? `${esc(going.title)}: step ${pathProgress(going.id).cur}` : 'First Steps, Growing in Christ, Leading Your Family'}</span></button>
      <button data-td2="study"><b>Study methods</b><span>Guided worksheets: observe, words, people, topics</span></button>`);
  };
  COMMANDS.unshift(
    ['Discipleship paths', 'disciple mentor first steps growing family new believer', () => openPaths()],
    ['Study methods', 'inductive observe interpret apply soap word character topical verse mapping book overview worksheet', () => openStudyChooser()],
  );
  const i = TOUR.findIndex((t) => t.el === '#btnToday');
  if (i >= 0) TOUR[i] = { ...TOUR[i], text: `${TOUR[i].text} Discipleship paths and study methods start here too.` };
  const prevQS = window.openQuickStart;
  window.openQuickStart = () => {
    prevQS();
    const walk = $$('#modal .qs section').find((s) => /Your daily walk/.test(s.textContent));
    if (walk) $('ul', walk).insertAdjacentHTML('beforeend', `<li><b>Discipleship paths</b> (Today): First Steps, Growing in Christ and Leading Your Family — eight steps each, to go through alone or with someone. <i>Print</i> a step to meet with a friend.</li>
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
    if (cmd === 'paths') openPaths();
    else if (cmd === 'study') openStudyChooser();
  });
}

wireV39();
