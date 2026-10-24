'use strict';
/* v3.14: Easton's Bible Dictionary in the word card; an introduction to every book of the Bible; one Settings page
   (the text, your name, the start screen and your notes). Loaded after v43.js. */
/* global tsk, state, $, $$, esc, openModal, closeModal, saveUser, toast, go, hideWordCard, COMMANDS, TOUR, isPhone, setView */

const onPhone = () => typeof isPhone === 'function' && isPhone();
const toReading = () => typeof setView === 'function' && onPhone() && setView('read');

// ---------------------------------------------------------------- Easton's Bible Dictionary, in the word card
const eastonHtml = (entry, all) => {
  const paras = all ? entry.p : entry.p.slice(0, 1);
  return paras.map((p) => `<p>${p}</p>`).join(''); // Easton's own text; references are links (built by tools/build_easton.py)
};
{
  const prevCard = window.showWordCard;
  window.showWordCard = async (word, rect, verseId, ti, tc) => {
    await prevCard(word, rect, verseId, ti, tc);
    const card = $('#wordcard');
    if (card.hidden || $('.wc-easton', card)) return;
    const entry = await tsk.easton(word).catch(() => null);
    if (!entry || card.hidden || $('.wc-easton', card) || $('h4', card).textContent !== word) return;
    const more = entry.p.length > 1;
    const sec = `<div class="wc-label">Easton's Bible Dictionary</div>
      <div class="wc-easton" data-key="${esc(entry.key)}">${entry.t.toLowerCase() !== word.toLowerCase() ? `<div class="hint">Entry: ${esc(entry.t.toUpperCase())}</div>` : ''}
      <div class="eb-body">${eastonHtml(entry, false)}</div>${more ? '<button class="linkish" data-eb="more">Read the whole entry</button>' : ''}</div>`;
    const more1828 = $('.more', card);
    if (more1828) more1828.insertAdjacentHTML('beforebegin', sec);
    else card.insertAdjacentHTML('beforeend', sec);
    if (!onPhone()) {
      const r = card.getBoundingClientRect();
      if (r.bottom > window.innerHeight - 12) card.style.top = `${Math.max(12, window.innerHeight - r.height - 12)}px`;
    }
  };
  $('#wordcard').addEventListener('click', async (e) => {
    if (e.target.closest('[data-eb="more"]')) {
      const box = e.target.closest('.wc-easton');
      const entry = await tsk.eastonEntry(box.dataset.key);
      if (entry) $('.eb-body', box).innerHTML = eastonHtml(entry, true);
      e.target.remove();
      return;
    }
    const r = e.target.closest('.wc-easton .ref');
    if (r) {
      hideWordCard();
      toReading();
      go({ id: Number(r.dataset.s), endId: Number(r.dataset.e) });
    }
  });
}

// ---------------------------------------------------------------- About this book
async function openBookIntro(bookId) {
  const d = await tsk.bookIntro(bookId);
  const bk = state.books[bookId - 1];
  if (!d || !bk) return;
  const [kv] = d.k ? await tsk.versesByIds([d.k]) : [];
  const ch = (a, b) => (a === b ? `${a}` : `${a}–${b}`);
  const single = bk.chapters === 1;
  openModal(`<div class="kicker">About this book</div><h2 class="m-title">${esc(bk.name)}</h2>
    <dl class="bi-facts">
      <dt>Written by</dt><dd>${esc(d.a)}</dd>
      <dt>When</dt><dd>${esc(d.w)}</dd>
      <dt>Written to</dt><dd>${esc(d.to)}</dd>
      <dt>Theme</dt><dd>${esc(d.th)}</dd>
    </dl>
    ${kv ? `<blockquote class="td-invite bi-key">“${esc(kv.text)}” <span><button class="linkish" data-bi-go="${kv.id}">${esc(kv.label)}</button></span></blockquote>` : ''}
    <div class="section-title">Outline</div>
    <ol class="bi-outline">${d.o.map(([a, b, t]) => `<li><button data-bi-ch="${a}">${single ? '' : `<span class="bi-ch">${bookId === 19 ? (a === b ? 'Psalm' : 'Psalms') : a === b ? 'Chapter' : 'Chapters'} ${ch(a, b)}</span>`}${esc(t)}</button></li>`).join('')}</ol>
    ${d.e ? `<details class="bi-easton"><summary>Read more in Easton's Bible Dictionary</summary><div class="eb-body" data-key="${esc(d.e)}"><p class="hint">Loading…</p></div></details>` : ''}
    <p class="hint bi-note">Where Scripture does not name the writer, this says so and gives the traditional view.</p>`, 'm-bookintro');
  $('#modal').dataset.book = bookId;
}
$('#modal').addEventListener('click', (e) => {
  if (!$('#modal').classList.contains('m-bookintro')) return;
  const book = Number($('#modal').dataset.book);
  const c = e.target.closest('[data-bi-ch]');
  const v = e.target.closest('[data-bi-go]');
  const r = e.target.closest('.bi-easton .ref');
  if (!c && !v && !r) return;
  closeModal();
  toReading();
  if (c) go({ book, ch: Number(c.dataset.biCh) });
  else if (v) go({ id: Number(v.dataset.biGo) });
  else go({ id: Number(r.dataset.s), endId: Number(r.dataset.e) });
});
$('#modal').addEventListener('toggle', async (e) => {
  const det = e.target.closest && e.target.closest('.bi-easton');
  if (!det || !det.open) return;
  const body = $('.eb-body', det);
  if (body.dataset.done) return;
  const entry = await tsk.eastonEntry(body.dataset.key);
  body.innerHTML = entry ? eastonHtml(entry, true) : '<p class="hint">Not found.</p>';
  body.dataset.done = '1';
}, true);
// a quiet link under each chapter heading
new MutationObserver(() => {
  const head = $('#readerInner .chapter-head');
  if (!head || head.nextElementSibling && head.nextElementSibling.classList.contains('bi-link')) return;
  const bk = state.books[(state.cur.book || 1) - 1];
  if (!bk) return;
  head.insertAdjacentHTML('afterend', `<button class="bi-link" data-bi-open="${bk.id}">About ${esc(bk.name)} ›</button>`);
}).observe($('#readerInner'), { childList: true });
$('#readerInner').addEventListener('click', (e) => {
  const b = e.target.closest('[data-bi-open]');
  if (b) openBookIntro(Number(b.dataset.biOpen));
});
COMMANDS.push(['About this book', 'introduction author date theme outline book', () => openBookIntro(state.cur.book)]);
window.openBookIntro = openBookIntro;

// ---------------------------------------------------------------- one Settings page
{
  const prevRO = window.openReadingOptions;
  window.openReadingOptions = function () {
    prevRO();
    const card = $('#modal .modal-card') || $('#modal');
    const kick = $('#modal .kicker');
    if (kick) kick.textContent = 'Search the Scriptures';
    const h = $('#modal .m-title');
    if (h) h.textContent = 'Settings';
    const grid = $('#modal .ro-grid');
    if (!grid) return;
    grid.insertAdjacentHTML('beforebegin', '<div class="section-title st-first">The text</div>');
    // you: your name and the start screen
    const you = document.createElement('div');
    you.className = 'ro-grid st-grid';
    you.innerHTML = `<label for="stName">Your name</label>
      <div class="st-name"><input id="stName" type="text" maxlength="40" autocomplete="given-name" placeholder="For the daily greeting" value="${esc(state.settings.name || '')}" /></div>`;
    const startLab = [...grid.children].find((el) => el.tagName === 'LABEL' && el.textContent === 'Start screen');
    if (startLab) {
      const box = startLab.nextElementSibling;
      you.append(startLab, box);
    }
    const sample = $('#modal .ro-sample');
    (sample || grid).insertAdjacentHTML('afterend', '<div class="section-title">You</div><div id="stYou"></div><div class="section-title">Your notes</div><div class="st-notes" id="stNotes"></div>');
    $('#stYou').replaceWith(you);
    paintNotesSection();
    if (card) card.scrollTop = 0;
  };
  async function paintNotesSection() {
    const box = $('#stNotes');
    if (!box) return;
    if (tsk.web) {
      box.innerHTML = `<p class="hint">Your notes are kept on this device. Save a backup file now and then, somewhere safe.</p>
        <div class="st-btns"><button data-st="backup">Back up my notes</button><button data-st="restore">Restore from a backup…</button></div>`;
      return;
    }
    const b = await tsk.backupInfo().catch(() => ({}));
    box.innerHTML = `<p class="hint">${b.dir ? `Backed up automatically to <b>${esc(b.dir)}</b>${b.last ? ` · last ${esc(new Date(b.last).toLocaleString())}` : ''}.` : 'No backup folder is set. Choose one (for example inside OneDrive) and your notes are copied there automatically.'}</p>
      <div class="st-btns"><button data-st="choose">${b.dir ? 'Change backup folder…' : 'Choose a backup folder…'}</button>${b.dir ? '<button data-st="now">Back up now</button>' : ''}</div>`;
  }
  const saveName = (v) => {
    state.settings.name = String(v || '').trim().slice(0, 40);
    state.settings.nameAsked = true;
    saveUser(['settings']);
  };
  $('#modal').addEventListener('change', (e) => {
    if (e.target.id === 'stName') {
      saveName(e.target.value);
      toast(state.settings.name ? `Thank you, ${state.settings.name}` : 'Name cleared');
    }
  });
  $('#modal').addEventListener('keydown', (e) => {
    if (e.target.id === 'stName' && e.key === 'Enter') e.target.blur();
  });
  $('#modal').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-st]');
    if (!b) return;
    const k = b.dataset.st;
    if (k === 'backup') tsk.backup().then(() => toast('Saved. Keep the file somewhere safe.'));
    else if (k === 'restore') $('#restoreFile') && $('#restoreFile').click();
    else if (k === 'choose') {
      await tsk.backupChoose();
      paintNotesSection();
    } else if (k === 'now') {
      await tsk.backupNow();
      paintNotesSection();
    }
  });
  window.openSettings = () => window.openReadingOptions();
  for (const c of COMMANDS) if (c[0] === 'Reading options') c[0] = 'Settings';
  COMMANDS.push(['Your name', 'name greeting settings', () => window.openReadingOptions()]);
}
// the Aa button opens Settings: the tour, its tooltip and the quick start say so
{
  const t = TOUR.find((x) => x.el === '#btnRead');
  if (t) Object.assign(t, { title: 'Settings', text: 'Aa opens Settings: the font, text size, spacing and a light, sepia or dark theme; the KJV’s italic words, red letters and ¶ marks; your name; the start screen; and backing up your notes.' });
  const b = $('#btnRead');
  if (b) b.title = 'Settings: text, theme, your name, start screen, backups (Ctrl+,)';
  const prevQS = window.openQuickStart;
  window.openQuickStart = () => {
    prevQS();
    for (const li of $$('#modal .qs li')) {
      if (/^Aa \(/.test(li.textContent)) li.innerHTML = li.innerHTML.replace(/ — font, spacing.*$/, ' — Settings: font, size, spacing, light / sepia / dark, the KJV’s <i>italic</i> words, red letters and ¶ marks, your name, the start screen and backups.');
      // on a phone, words are double-tapped
      if (onPhone() && /Double-click/.test(li.textContent)) li.innerHTML = li.innerHTML.replace('Double-click', 'Double-tap');
    }
  };
}
