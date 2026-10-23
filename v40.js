'use strict';
/* v3.10: section headings above the text, swipe left or right to change chapters, and What's New shown
   inside the app (with a close button) on desktop and phone alike. Loaded after v39.js. */
/* global tsk, state, $, $$, esc, openModal, closeModal, stepChapter, saveUser, openReadingOptions, COMMANDS */

const v40 = { headings: null };

// ===================================================================== section headings
async function loadHeadings() {
  if (!v40.headings) v40.headings = (await tsk.headings().catch(() => null)) || {};
  return v40.headings;
}
async function paintHeadings() {
  $$('#readerInner .sec-head').forEach((el) => el.remove());
  if (state.settings.headings === 'off') return;
  const h = await loadHeadings();
  for (const v of $$('#readerInner .verse[data-id]')) {
    const hs = h[v.dataset.id];
    if (!hs) continue;
    v.insertAdjacentHTML('beforebegin', hs.map((t, i) => `<div class="sec-head${i ? ' sub' : ''}" aria-hidden="false">${esc(t)}</div>`).join(''));
  }
}
{
  const prevAfter = window.v3AfterChapter;
  window.v3AfterChapter = () => {
    if (prevAfter) prevAfter();
    paintHeadings();
  };
  const prevRO = window.openReadingOptions;
  window.openReadingOptions = function () {
    prevRO();
    const box = $$('#modal input[data-ro="paras"]')[0];
    if (box) box.closest('label').insertAdjacentHTML('afterend', `<label><input type="checkbox" data-ro40="headings" ${state.settings.headings !== 'off' ? 'checked' : ''}/> <span>Section headings <span class="hint">(not part of the KJV text)</span></span></label>`);
  };
  document.addEventListener('change', (e) => {
    const c = e.target.closest('[data-ro40="headings"]');
    if (!c) return;
    state.settings.headings = c.checked ? 'on' : 'off';
    saveUser(['settings']);
    paintHeadings();
  });
}

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
