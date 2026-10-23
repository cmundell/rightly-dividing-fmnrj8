'use strict';
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

// ---------------------------------------------------------------- Today: your name in the greeting, and "Open your Bible"
{
  const prevToday = window.openToday;
  window.openToday = async function () {
    await prevToday();
    const h = $('#modal .m-title');
    const name = state.settings.name;
    if (h && name && !h.textContent.includes(',')) h.textContent = `${h.textContent}, ${name}`;
    const begin = $('#modal .td-begin');
    const bk = state.books[(state.cur.book || 1) - 1];
    if (begin && bk) {
      begin.insertAdjacentHTML('beforebegin', `<button class="td-open" data-td4="open">Open your Bible<span>Continue in ${esc(bk.name)} ${state.cur.ch}</span></button>`);
    }
  };
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

// ---------------------------------------------------------------- Reading options: switch the start screen on or off
{
  const prevRO = window.openReadingOptions;
  window.openReadingOptions = function () {
    prevRO();
    const checks = $('#modal .ro-checks');
    if (!checks || FEATURES.today === false) return;
    checks.parentElement.insertAdjacentHTML('beforeend', `<label>Start screen</label>
      <div class="ro-checks"><label><input type="checkbox" data-ro4="startToday" ${state.settings.startToday !== false ? 'checked' : ''}/> <span>Start with Today the first time you open the app each day</span></label></div>`);
  };
  $('#modal').addEventListener('change', (e) => {
    const c = e.target.closest('[data-ro4="startToday"]');
    if (!c) return;
    state.settings.startToday = c.checked;
    saveUser(['settings']);
  });
}
