'use strict';
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
