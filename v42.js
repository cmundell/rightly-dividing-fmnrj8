'use strict';
/* v3.13: gentle reminders set aside; Morning and Evening moved off the toolbar (it stays on Today, in the Go menu
   and in the phone's Menu). Switches for the Today screen and the prayer list (FEATURES.today, FEATURES.prayer).
   Loaded after v41.js. */
/* global tsk, state, $, $$, FEATURES, COMMANDS, TOUR, beginWalk, switchTab, v32, renderMarks */

const dropCommand = (label) => {
  for (let i = COMMANDS.length - 1; i >= 0; i--) if (COMMANDS[i][0] === label) COMMANDS.splice(i, 1);
};

// ---------------------------------------------------------------- Morning and Evening: no toolbar button (still on Today)
{
  const b = $('#btnDaily');
  if (b) b.hidden = true;
  const t = TOUR.find((x) => x.el === '#btnDaily');
  if (t) Object.assign(t, { el: '#btnTimeline', title: 'Timeline', text: 'Timeline shows Bible history in order, with the chapter you are reading marked. Spurgeon\'s Morning and Evening is on Today and in the Go menu. Press Ctrl+K anywhere to jump to any feature, person, journey or note.' });
  const prevQS = window.openQuickStart;
  window.openQuickStart = () => {
    prevQS();
    for (const li of $$('#modal .qs li')) if (/^Devotional:/.test(li.textContent)) li.innerHTML = li.innerHTML.replace('<b>Devotional</b>:', `<b>Devotional</b> (Today, or ${tsk.web ? 'Menu' : 'Go menu'}):`);
  };
}

// ---------------------------------------------------------------- gentle reminders set aside
if (!FEATURES.reminders) {
  dropCommand('Gentle reminders');
  // nothing left switched on from before: the app no longer opens itself at sign-in
  tsk.openAtLogin(false).catch(() => {});
}

// ---------------------------------------------------------------- prayer list switch
if (FEATURES.prayer === false) {
  dropCommand('Prayer list');
  const prevSwitch = window.marksSwitch;
  window.marksSwitch = () => prevSwitch().replace(/<button data-mv="prayer"[^]*?<\/button>/, '');
  tsk.onMenu((cmd) => {
    if (cmd === 'prayers') switchTab('marks');
  });
}

// ---------------------------------------------------------------- Today, with what is switched off taken out
{
  const prevToday = window.openToday;
  window.openToday = async function () {
    await prevToday();
    if (!FEATURES.reminders) $$('#modal [data-td="remind"]').forEach((e) => e.remove());
    if (FEATURES.prayer === false) $$('#modal [data-td="prayers"]').forEach((e) => e.remove());
  };
  // Time with God: no prayer list in the Pray step when it is switched off
  const prevWalk = window.renderWalk;
  window.renderWalk = async function () {
    await prevWalk();
    if (FEATURES.prayer === false) {
      $$('#modal .wk-plist, #modal [data-wk-form="prayer"]').forEach((e) => e.remove());
      $$('#modal .section-title').forEach((e) => /prayer list/i.test(e.textContent) && e.remove());
      $$('#modal .hint').forEach((e) => /prayer list is empty/i.test(e.textContent) && e.remove());
    }
  };
}

// ---------------------------------------------------------------- Today screen switch: Time with God opens directly
if (FEATURES.today === false) {
  const t = $('#btnToday');
  if (t) t.hidden = true;
  window.openToday = () => beginWalk();
  dropCommand('Today — time with God');
  for (let i = TOUR.length - 1; i >= 0; i--) if (TOUR[i].el === '#btnToday') TOUR.splice(i, 1);
}
