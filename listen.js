'use strict';
/* Listen (1.6): the chapter read aloud by "George" (Kokoro, an open-source voice), one recording per chapter.
   A Listen button sits in the chapter heading; a small player bar appears at the bottom with play/pause,
   previous/next chapter and speed. The verse being read is marked and kept in view, and reading carries on
   into the next chapter. Works the same on Windows and on the phone; tsk.audioGet fetches and keeps the files. */
/* global $, $$, state, go, toast, esc, saveUser, tsk, openModal */

const SPEEDS = [0.8, 0.9, 1, 1.1, 1.25, 1.5];
const SILENT = 'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYwLjE2LjEwMAAAAAAAAAAAAAAA//OEwAAAAAAAAAAAAEluZm8AAAAPAAAACQAABCAARUVFRUVFRUVFRUVdXV1dXV1dXV1dXXR0dHR0dHR0dHR0i4uLi4uLi4uLi4uioqKioqKioqKiorq6urq6urq6urq60dHR0dHR0dHR0dHo6Ojo6Ojo6Ojo6P//////////////AAAAAExhdmM2MC4zMQAAAAAAAAAAAAAAACQD8AAAAAAAAAQgDeb0IwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//NExAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMu//NExFMAAANIAAAAADEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMu//NExKYAAANIAAAAADEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMu//NExKwAAANIAAAAADEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMu//NExKwAAANIAAAAADEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMu//NExKwAAANIAAAAADEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NExKwAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NExKwAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';

const ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.5h4v15H6zM14 4.5h4v15h-4z"/></svg>',
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h2.5v14H6zM19 5v14L9.5 12z"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 5H18v14h-2.5zM5 5v14l9.5-7z"/></svg>',
  spinner: '<svg class="pl-spin" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-dasharray="34 20" stroke-linecap="round"/></svg>',
  listen: '<svg class="vi" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13a8 8 0 0 1 16 0"/><path d="M4 13v4a2 2 0 0 0 2 2h1v-7H6a2 2 0 0 0-2 2zM20 13v4a2 2 0 0 1-2 2h-1v-7h1a2 2 0 0 1 2 2z"/></svg>',
};

const pl = {
  audio: new Audio(),
  cur: null,        // {book, ch} being played
  timings: null,    // [[vs, startSeconds], ...]
  loading: false,
  unlocked: false,
  verseEl: null,
  seq: 0,
};
pl.audio.preload = 'auto';

const plBookName = (b) => {
  const bk = state.books && state.books[b - 1];
  return bk ? (bk.id === 19 ? 'Psalm' : bk.name) : '';
};
const refLabel = (b, c) => `${plBookName(b)}${state.books && state.books[b - 1].chapters > 1 ? ` ${c}` : ''}`;
const fmtTime = (s) => {
  s = Math.max(0, Math.round(s || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const speedOf = () => Number(state.settings.listenSpeed) || 1;
const isSame = (a, b) => !!a && !!b && a.book === b.book && a.ch === b.ch;

document.body.insertAdjacentHTML('beforeend', `<div id="player" class="player" hidden role="region" aria-label="Listen">
  <div class="pl-prog" data-pl="seek" title="Jump"><div class="pl-fill"></div></div>
  <div class="pl-row">
    <button class="pl-btn" data-pl="prev" aria-label="Previous chapter" title="Previous chapter">${ICON.prev}</button>
    <button class="pl-btn pl-play" data-pl="play" aria-label="Play" title="Play">${ICON.play}</button>
    <button class="pl-btn" data-pl="next" aria-label="Next chapter" title="Next chapter">${ICON.next}</button>
    <div class="pl-info"><span class="pl-ref"></span><span class="pl-status"></span></div>
    <button class="pl-speed" data-pl="speed" title="Reading speed">1×</button>
    <button class="pl-btn pl-x" data-pl="close" aria-label="Close" title="Stop listening">&times;</button>
  </div></div>`);
const playerEl = $('#player');

function paintPlayer() {
  const a = pl.audio;
  playerEl.hidden = !pl.cur;
  document.body.classList.toggle('has-player', !!pl.cur);
  if (!pl.cur) return;
  $('.pl-ref', playerEl).textContent = refLabel(pl.cur.book, pl.cur.ch);
  const playBtn = $('.pl-play', playerEl);
  if (pl.loading) {
    playBtn.innerHTML = ICON.spinner;
    $('.pl-status', playerEl).textContent = 'Loading…';
  } else {
    playBtn.innerHTML = a.paused ? ICON.play : ICON.pause;
    playBtn.setAttribute('aria-label', a.paused ? 'Play' : 'Pause');
    playBtn.title = a.paused ? 'Play' : 'Pause';
    $('.pl-status', playerEl).textContent = pl.missing ? 'Not recorded yet' : `${fmtTime(a.currentTime)} / ${fmtTime(a.duration)}`;
  }
  $('.pl-speed', playerEl).textContent = `${speedOf()}×`;
  $('.pl-fill', playerEl).style.width = a.duration ? `${(100 * a.currentTime) / a.duration}%` : '0';
  $('[data-pl="prev"]', playerEl).disabled = pl.cur.book === 1 && pl.cur.ch === 1;
  $('[data-pl="next"]', playerEl).disabled = pl.cur.book === 66 && pl.cur.ch === 22;
  paintListenButton();
}

/** The Listen button in the chapter heading reflects whether this chapter is the one playing. */
function paintListenButton() {
  const btn = $('.listen-btn');
  if (!btn) return;
  const here = isSame(pl.cur, state.cur);
  const playing = here && !pl.audio.paused && !pl.loading;
  btn.classList.toggle('on', here);
  btn.innerHTML = `${playing ? ICON.pause : ICON.listen}<span>${playing ? 'Pause' : 'Listen'}</span>`;
  btn.title = playing ? 'Pause' : 'Listen to this chapter';
}

/** Mark the verse being read; keep it in view when the chapter on screen is the one playing. */
function followVerse() {
  if (!pl.cur || !pl.timings || !isSame(pl.cur, state.cur) || !state.chapter) return clearVerseMark();
  const t = pl.audio.currentTime + 0.15;
  let vs = null;
  for (const [v, start] of pl.timings) {
    if (start <= t) vs = v;
    else break;
  }
  if (vs == null) return clearVerseMark();
  const v = state.chapter.verses.find((x) => x.vs === vs);
  const el = v && document.getElementById(`v${v.id}`);
  if (el === pl.verseEl) return;
  clearVerseMark();
  if (!el) return;
  el.classList.add('playing');
  pl.verseEl = el;
  const r = el.getBoundingClientRect();
  const box = $('#reader').getBoundingClientRect();
  const bottomPad = playerEl.getBoundingClientRect().height + 24;
  if (r.top < box.top + 8 || r.bottom > box.bottom - bottomPad) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
function clearVerseMark() {
  if (pl.verseEl) pl.verseEl.classList.remove('playing');
  pl.verseEl = null;
}

/** Load and play a chapter. Called from a tap, which also unlocks audio on the phone. */
async function listenChapter(book, ch, { play = true } = {}) {
  const a = pl.audio;
  if (!pl.unlocked) {
    // phones only allow sound after a tap: play a moment of silence now, so the real audio can start later
    try {
      a.src = SILENT;
      await a.play().catch(() => {});
    } catch {}
    pl.unlocked = true;
  }
  const seq = ++pl.seq;
  pl.cur = { book, ch };
  pl.timings = null;
  pl.missing = false;
  pl.loading = true;
  clearVerseMark();
  paintPlayer();
  let r;
  try {
    r = await tsk.audioGet(book, ch);
  } catch (e) {
    if (seq !== pl.seq) return;
    pl.loading = false;
    paintPlayer();
    toast(navigator.onLine === false ? 'Not connected — this chapter has not been heard on this device yet' : "Couldn't load the audio. Check your connection and try again");
    return;
  }
  if (seq !== pl.seq) return;
  pl.loading = false;
  if (r.missing) {
    pl.missing = true;
    a.removeAttribute('src');
    a.load();
    paintPlayer();
    toast(`${refLabel(book, ch)} has not been recorded yet`);
    return;
  }
  pl.timings = r.timings.verses;
  if (/^blob:/.test(a.src)) URL.revokeObjectURL(a.src); // the phone keeps the previous chapter in memory until released
  a.src = r.mp3;
  a.playbackRate = speedOf();
  if (play) a.play().catch(() => paintPlayer());
  paintPlayer();
  setMediaSession();
  saveUser(['settings']);
}

function stopListening() {
  pl.seq += 1;
  pl.audio.pause();
  pl.audio.removeAttribute('src');
  pl.audio.load();
  pl.cur = null;
  pl.timings = null;
  clearVerseMark();
  paintPlayer();
}

async function stepListen(d) {
  if (!pl.cur) return;
  let { book, ch } = pl.cur;
  ch += d;
  if (ch < 1) {
    if (book === 1) return;
    book -= 1;
    ch = state.books[book - 1].chapters;
  } else if (ch > state.books[book - 1].chapters) {
    if (book === 66) return;
    book += 1;
    ch = 1;
  }
  await go({ book, ch });
  listenChapter(book, ch);
}

function plToggle() {
  const a = pl.audio;
  if (!pl.cur) return listenChapter(state.cur.book, state.cur.ch);
  if (pl.missing) return listenChapter(pl.cur.book, pl.cur.ch);
  if (a.paused) a.play().catch(() => {});
  else a.pause();
}

function cycleSpeed() {
  const i = SPEEDS.indexOf(speedOf());
  state.settings.listenSpeed = SPEEDS[(i + 1) % SPEEDS.length];
  pl.audio.playbackRate = speedOf();
  saveUser(['settings']);
  paintPlayer();
}

function setMediaSession() {
  if (!('mediaSession' in navigator) || !pl.cur) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title: refLabel(pl.cur.book, pl.cur.ch), artist: 'Rightly Dividing · King James Version', album: 'Read by George' });
    navigator.mediaSession.setActionHandler('play', () => pl.audio.play());
    navigator.mediaSession.setActionHandler('pause', () => pl.audio.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => stepListen(-1));
    navigator.mediaSession.setActionHandler('nexttrack', () => stepListen(1));
  } catch {}
}

pl.audio.addEventListener('timeupdate', () => {
  if (!pl.cur) return;
  paintPlayer();
  followVerse();
});
pl.audio.addEventListener('play', paintPlayer);
pl.audio.addEventListener('pause', paintPlayer);
pl.audio.addEventListener('ended', () => {
  if (!pl.cur || pl.audio.src === SILENT) return;
  if (pl.cur.book === 66 && pl.cur.ch === 22) return paintPlayer();
  stepListen(1);
});
pl.audio.addEventListener('error', () => {
  if (!pl.cur || pl.audio.src === SILENT || !pl.audio.getAttribute('src')) return;
  pl.loading = false;
  paintPlayer();
  toast("Couldn't play this chapter's audio");
});

playerEl.addEventListener('click', (e) => {
  const t = e.target.closest('[data-pl]');
  if (!t) return;
  const k = t.dataset.pl;
  if (k === 'play') plToggle();
  else if (k === 'prev') stepListen(-1);
  else if (k === 'next') stepListen(1);
  else if (k === 'speed') cycleSpeed();
  else if (k === 'close') stopListening();
  else if (k === 'seek' && pl.audio.duration) {
    const r = t.getBoundingClientRect();
    pl.audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * pl.audio.duration;
    followVerse();
  }
});

// the Listen button in every chapter heading
document.addEventListener('click', (e) => {
  const b = e.target.closest('.listen-btn');
  if (!b) return;
  e.preventDefault();
  if (isSame(pl.cur, state.cur) && !pl.missing) plToggle();
  else listenChapter(state.cur.book, state.cur.ch);
});
{
  const prevAfter = window.v3AfterChapter;
  window.v3AfterChapter = () => {
    if (prevAfter) prevAfter();
    const head = $('.chapter-head');
    if (head && !$('.listen-btn', head)) head.insertAdjacentHTML('beforeend', '<button class="listen-btn" title="Listen to this chapter"></button>');
    pl.verseEl = null;
    paintListenButton();
    followVerse();
  };
}

// ---------------------------------------------------------------- Settings: audio kept on this device
const fmtBytes = (n) => (n > 9e8 ? `${(n / 1e9).toFixed(2)} GB` : `${Math.round(n / 1e6)} MB`);
let dlProgress = null;
async function paintAudioSettings() {
  const box = $('#stAudio');
  if (!box) return;
  const s = await tsk.audioStats();
  const desktop = !!tsk.audioDownloadAll;
  const total = 1189;
  let html = '';
  if (dlProgress && !dlProgress.finished) {
    html = `<div class="st-audio-line">Downloading… ${dlProgress.done} of ${dlProgress.total} chapters</div>
      <div class="st-audio-bar"><div style="width:${(100 * dlProgress.done) / dlProgress.total}%"></div></div>
      <div class="ro-btns"><button data-au="cancel">Stop</button></div>`;
  } else {
    const have = s.chapters ? `${s.chapters} of ${total} chapters kept on this ${desktop ? 'computer' : 'phone'} (${fmtBytes(s.bytes)})` : `No chapters kept on this ${desktop ? 'computer' : 'phone'} yet`;
    html = `<div class="st-audio-line">${have}</div>
      <div class="ro-hint">Every chapter you listen to is kept, so it plays again without a connection.${desktop ? '' : ' Chapters are downloaded as you listen.'}</div>
      <div class="ro-btns">${desktop && s.chapters < total ? '<button data-au="all">Download the whole Bible (about 1.3 GB)</button>' : ''}${s.chapters ? '<button data-au="clear">Remove kept audio</button>' : ''}</div>`;
  }
  box.innerHTML = html;
}
if (tsk.onAudioProgress) tsk.onAudioProgress((p) => {
  dlProgress = p;
  if (p.finished) {
    dlProgress = null;
    if (!p.cancelled) toast(p.missing ? `Downloaded — ${p.missing} chapters are not recorded yet` : 'The whole Bible is on this computer');
  }
  paintAudioSettings();
});
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-au]');
  if (!t) return;
  if (t.dataset.au === 'all') {
    dlProgress = { done: 0, total: 1189 };
    paintAudioSettings();
    tsk.audioDownloadAll();
  } else if (t.dataset.au === 'cancel') {
    tsk.audioCancel();
  } else if (t.dataset.au === 'clear') {
    await tsk.audioClear();
    toast('Kept audio removed');
    paintAudioSettings();
  }
});
{
  const prevOpen = window.openReadingOptions;
  window.openReadingOptions = function () {
    prevOpen();
    const notes = $$('#modal .section-title').find((el) => el.textContent.trim() === 'Your notes');
    if (notes) notes.insertAdjacentHTML('beforebegin', '<div class="section-title">Listening</div><div class="st-audio" id="stAudio"></div>');
    paintAudioSettings();
  };
}

// a command for the palette, when it exists
if (typeof COMMANDS !== 'undefined') COMMANDS.push(['Listen to this chapter', 'audio read aloud voice play speak', () => listenChapter(state.cur.book, state.cur.ch)]);

window.listenChapter = listenChapter;
window.stopListening = stopListening;
