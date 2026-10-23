'use strict';
/* v3 features: reference trail, highlights & tags, Matthew Henry commentary, Nave's topics,
   grammar parsing, Strong's-aware search results, notes manager, study sheets.
   Loaded after app.js and shares its globals (state, tsk, go, esc, $, $$, ...). */
/* global tsk, state, $, $$, esc, go, toast, switchTab, showPreview, hidePreview, sanitize, saveUser,
   ws, openStrong, alignToken, tokensOf, stems, stemsMatch, STOP, hiliteTerms, hiliteGloss, refreshMarkIcons,
   markSelection, strongChip, wrapWords, dictHtml, renderStrongEntry, hideWordCard, toggleBookmark */

const v3 = {
  comm: null,
  topicsVerse: [],
  topicsFor: null,
  topic: null,
  topicView: 'list',
  topicQuery: '',
  topicResults: [],
  cursor: -1,
  skipTrail: false,
  markTag: null,
  markQuery: '',
};
const HL_COLORS = ['yellow', 'green', 'blue', 'pink', 'purple'];
// Defaults until v3Init receives the saved data (init in app.js is async)
state.highlights = state.highlights || {};
state.tags = state.tags || {};
state.trail = state.trail || [];

// ===================================================================== init + hooks
window.v3Init = (u) => {
  state.highlights = u.highlights || {};
  state.tags = u.tags || {};
  state.trail = Array.isArray(u.trail) ? u.trail : [];
  v3.cursor = state.trail.length - 1;
  if (u.importedFrom) setTimeout(() => toast(`Notes and bookmarks copied from “${u.importedFrom}”`), 1500);
};

window.v3AfterChapter = () => {
  for (const el of $$('.verse')) applyHighlight(el);
};

window.v3OnVerse = (id, x) => {
  pushTrail(id);
  renderTrail();
  injectVerseTools(id);
  loadCommentary(id);
  loadVerseTopics(id, x);
};

// ===================================================================== reference trail
function pushTrail(id) {
  if (v3.skipTrail) {
    v3.skipTrail = false;
    return;
  }
  const t = state.trail;
  if (t[t.length - 1] === id) {
    v3.cursor = t.length - 1;
    return;
  }
  t.push(id);
  if (t.length > 60) t.splice(0, t.length - 60);
  v3.cursor = t.length - 1;
  saveUser(['trail']);
}

async function renderTrail() {
  const box = $('#trailItems');
  const ids = state.trail;
  if (!ids.length) {
    box.innerHTML = '<span class="hint">Verses you study appear here in order, so you can retrace a chain of cross-references.</span>';
    return;
  }
  const rows = await tsk.versesByIds([...new Set(ids)]);
  const label = new Map(rows.map((r) => [r.id, r.label]));
  box.innerHTML = ids
    .map((id, i) => `${i ? '<span class="sep">›</span>' : ''}<button class="crumb${i === v3.cursor ? ' on' : ''}" data-i="${i}" data-id="${id}" title="${esc(label.get(id) || '')}">${esc(shortLabel(label.get(id) || ''))}</button>`)
    .join('');
  const cur = $('.crumb.on', box);
  if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'center' });
}

function shortLabel(full) {
  const b = state.books.find((x) => full.startsWith(x.name + ' '));
  return b ? full.replace(b.name, b.abbr) : full;
}

// ===================================================================== highlights + tags
function applyHighlight(el) {
  const c = state.highlights[el.dataset.id];
  HL_COLORS.forEach((k) => el.classList.remove(`hl-${k}`));
  if (c) el.classList.add(`hl-${c}`);
}

function injectVerseTools(id) {
  const note = $('#pane-refs .note');
  if (!note || $('#pane-refs .v3tools')) return;
  const cur = state.highlights[id] || '';
  const tags = (state.tags[id] || []).join(', ');
  note.insertAdjacentHTML(
    'afterend',
    `<div class="v3tools">
      <span class="lbl">Highlight</span>
      ${HL_COLORS.map((c) => `<button class="dot hl-${c}${cur === c ? ' on' : ''}" data-hl="${c}" title="${c}"></button>`).join('')}
      <button class="dot none${cur ? '' : ' on'}" data-hl="" title="No highlight">&times;</button>
      <input class="tagin" data-id="${id}" placeholder="Tags, e.g. prayer, sermon idea" value="${esc(tags)}" title="Comma-separated tags; press Enter to save" />
    </div>`
  );
}

function setHighlight(id, color) {
  if (color) state.highlights[id] = color;
  else delete state.highlights[id];
  saveUser(['highlights']);
  const el = document.getElementById(`v${id}`);
  if (el) applyHighlight(el);
  $$('#pane-refs .v3tools .dot').forEach((d) => d.classList.toggle('on', d.dataset.hl === (color || '')));
  renderMarks();
}

function setTags(id, text) {
  const tags = [...new Set(String(text).split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))];
  if (tags.length) state.tags[id] = tags;
  else delete state.tags[id];
  saveUser(['tags']);
  renderMarks();
}

// ===================================================================== commentary
async function loadCommentary(id) {
  if (v3.comm && id >= v3.comm.start_id && id <= v3.comm.end_id) return renderComm(id);
  v3.comm = await tsk.commentary(id);
  renderComm(id);
}

/** Sanitize commentary HTML: keep basic formatting, turn scripture links into clickable spans. */
function commHtml(html) {
  const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
  const OK = new Set(['P', 'B', 'I', 'BR', 'H4']);
  const walk = (node) => {
    let out = '';
    for (const n of node.childNodes) {
      if (n.nodeType === 3) out += esc(n.textContent);
      else if (n.nodeType === 1) {
        const inner = walk(n);
        const t = n.tagName;
        if (t === 'A' && n.getAttribute('data-osis')) out += `<span class="cref" data-osis="${esc(n.getAttribute('data-osis'))}">${inner}</span>`;
        else if (t === 'BR') out += '<br>';
        else if (OK.has(t)) out += `<${t.toLowerCase()}>${inner}</${t.toLowerCase()}>`;
        else out += inner;
      }
    }
    return out;
  };
  return walk(doc.body.firstChild);
}

function renderComm(selId) {
  const pane = $('#pane-comm');
  const c = v3.comm;
  if (!c) {
    pane.innerHTML = '<div class="empty">Select a verse to read Matthew Henry’s commentary on its passage.</div>';
    return;
  }
  const label = state.xref && state.xref.verse.id === selId ? state.xref.verse.label : '';
  pane.innerHTML = `
    <div class="comm-head">
      <div><div class="kicker">Matthew Henry · Concise Commentary</div>
      <h2>${esc(c.label)}</h2>
      <div class="sub">${label ? `Commentary on the passage containing ${esc(label)}` : ''}</div></div>
      <div class="comm-nav">
        <button data-act="commPrev" ${c.prev ? '' : 'disabled'} title="Previous section">&#8249; Prev</button>
        <button data-act="commShow" title="Highlight this passage in the reading pane">Show passage</button>
        <button data-act="commNext" ${c.next ? '' : 'disabled'} title="Next section">Next &#8250;</button>
      </div>
    </div>
    <div class="comm-body">${commHtml(c.html)}</div>
    <div class="hint" style="margin-top:14px">Scripture references in the commentary are clickable; hover to preview.</div>`;
}

// ===================================================================== Nave's topics
async function loadVerseTopics(id, x) {
  v3.topicsVerse = await tsk.naveForVerse(id);
  v3.topicsFor = x ? x.verse.label : '';
  $('#topicCount').textContent = v3.topicsVerse.length ? `(${v3.topicsVerse.length})` : '';
  if (v3.topicView === 'list') renderTopicList();
}

function renderTopicList() {
  v3.topicView = 'list';
  const pane = $('#pane-topics');
  const found = v3.topicQuery
    ? v3.topicResults.length
      ? `<div class="topic-grid">${v3.topicResults.map(topicChip).join('')}</div>`
      : `<div class="empty">No topic matches “${esc(v3.topicQuery)}”.</div>`
    : '';
  pane.innerHTML = `
    <div class="kicker">Nave’s Topical Bible</div>
    <form class="lookup" id="topicForm"><input id="topicInput" placeholder="Find a topic, e.g. covenant, prayer, faith" value="${esc(v3.topicQuery)}" /><button>Find</button></form>
    ${found}
    <div class="section-title">${v3.topicsFor ? `Topics that cite ${esc(v3.topicsFor)}` : 'Topics for the selected verse'}</div>
    ${v3.topicsVerse.length ? `<div class="topic-grid">${v3.topicsVerse.map(topicChip).join('')}</div>` : '<div class="empty">No Nave’s topics cite this verse directly.</div>'}`;
}

function topicChip(t) {
  return `<button class="topic" data-topic="${t.id}">${esc(t.subject)}<span>${t.refs}</span></button>`;
}

async function openTopic(id) {
  v3.topic = await tsk.naveTopic(id);
  v3.topicView = 'topic';
  const t = v3.topic;
  const lines = t.lines
    .map((l) => {
      const refs = l.refs.map((r) => `<span class="ref" data-s="${r.start}" data-e="${r.end}">${esc(r.label)}</span>`).join('');
      const head = !l.refs.length;
      return `<div class="tline${head ? ' head' : ''}" style="margin-left:${Math.min(l.depth, 4) * 18}px">
        ${l.text ? `<span class="tt">${esc(l.text)}</span>` : ''}${refs ? `<span class="refs">${refs}</span>` : ''}</div>`;
    })
    .join('');
  $('#pane-topics').innerHTML = `
    <button class="backlink" data-act="topicBack">&#8592; Back to topics</button>
    <div class="kicker">Nave’s Topical Bible</div>
    <h2 class="topic-title">${esc(t.subject)}</h2>
    <div class="sub">${t.refs.toLocaleString()} references · hover to preview, click to read</div>
    <div class="tlines">${lines}</div>`;
  $('#pane-topics').scrollTop = 0;
  switchTab('topics');
}

// ===================================================================== grammar in word study
function shortGrammar(exp) {
  if (!exp) return '';
  const vals = exp
    .split(';')
    .map((p) => p.split('=')[1])
    .filter(Boolean)
    .map((v) => v.replace(/\(hence[^)]*\)/g, '').trim())
    .map((v) => ({ Third: '3rd', Second: '2nd', First: '1st' }[v] || v))
    .filter((v) => v && !/^Common$/i.test(v));
  return vals.join(' · ');
}

// Override: word list with a grammar line per word
function renderWordsPane() {
  const pane = $('#pane-words');
  if (ws.view === 'strong') return renderStrongEntry();
  const x = state.xref;
  if (!x || x.verse.id !== ws.verseId) {
    pane.innerHTML = '<div class="empty">Select a verse to study its Hebrew or Greek words.</div>';
    return;
  }
  const lang = ws.words[0] ? (ws.words[0].lang === 'H' ? 'Hebrew' : 'Greek') : '';
  const html = [`<div class="xhead"><h2>${esc(x.verse.label)}</h2><div class="sub">${ws.words.length} ${lang} words · click an English word or a row</div></div>`];
  html.push(`<div class="ws-verse" id="wsVerse">${wrapWords(x.verse.text)}</div>`);
  if (!ws.words.length) {
    html.push('<div class="empty">No original-language tagging for this verse (it is absent from the Hebrew manuscript used).</div>');
  } else {
    html.push(`<div class="wslist-head"><span>English gloss</span><span>${lang}</span><span>Transliteration</span><span>Strong's</span></div>`);
    for (const w of ws.words) {
      html.push(`<div class="wsrow${ws.selPos === w.pos ? ' on' : ''}" data-pos="${w.pos}" data-sn="${esc(w.strongs || '')}" title="${esc(w.def || '')}">
        <span class="gl">${esc(w.gloss)}</span><span class="og ${w.lang}">${esc(w.word)}</span>
        <span class="tl">${esc(w.translit)}</span>${strongChip(w.strongs)}
        ${w.grammar ? `<span class="gr" title="${esc(w.morph || '')}: ${esc(w.grammar)}">${esc(shortGrammar(w.grammar))}</span>` : ''}</div>`);
    }
  }
  html.push(`<div class="section-title">Webster's 1828 Dictionary</div>
    <form class="lookup" id="dictForm"><input id="dictInput" placeholder="Look up any word, e.g. conversation, prevent, charity" value="${esc(ws.dict ? ws.dict.query : '')}" /><button>Look up</button></form>
    <div id="dictOut">${ws.dict ? dictHtml(ws.dict) : '<div class="hint">KJV forms like “loveth” or “spake” are matched to their headwords.</div>'}</div>`);
  pane.innerHTML = html.join('');
}

// Override: word card with grammar line
async function showWordCard(word, rect, verseId, tokenIndex, tokenCount) {
  const card = $('#wordcard');
  const [d, words] = await Promise.all([tsk.dict(word), verseId === ws.verseId ? ws.words : tsk.words(verseId)]);
  const match = alignToken(word, words, tokenIndex, tokenCount);
  const label = verseId && state.xref && state.xref.verse.id === verseId ? state.xref.verse.label : '';
  card.innerHTML = `
    <div class="wc-head"><h4>${esc(word)}</h4><span class="hint">${esc(label)}</span><button class="x" title="Close (Esc)">&times;</button></div>
    ${match ? `<div class="wc-label">Original word (best match)</div>
      <div class="wc-strong"><span class="og">${esc(match.word)}</span><i>${esc(match.translit)}</i>${strongChip(match.strongs)}
      <span class="d"><b>${esc(match.gloss)}</b> — ${esc(match.def || '')}</span>
      ${match.grammar ? `<span class="d gr2">${esc(shortGrammar(match.grammar))}</span>` : ''}</div>` : ''}
    <div class="wc-label">Webster's 1828</div>
    ${d.headword ? `${d.headword !== word.toLowerCase() ? `<div class="hint">Entry: ${esc(d.headword.toUpperCase())}</div>` : ''}<div class="dict">${sanitize(d.html)}</div>` : `<div class="hint">No 1828 entry for “${esc(word)}”.</div>`}
    ${match && match.strongs ? `<button class="more" data-sn="${esc(match.strongs)}">Open ${esc(match.strongs)} word study</button>` : ''}`;
  card.hidden = false;
  const w = card.offsetWidth, h = card.offsetHeight;
  const left = Math.min(Math.max(12, rect.left), window.innerWidth - w - 12);
  let top = rect.bottom + 8;
  if (top + h > window.innerHeight - 12) top = Math.max(12, rect.top - h - 8);
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
  card.scrollTop = 0;
}

// ===================================================================== search (override)
function renderSearch() {
  const s = state.search;
  $('#searchCount').textContent = s.q ? `(${s.total.toLocaleString()})` : '';
  const sn = (s.strongs || []).length ? ` · Strong's ${s.strongs.join(', ')}` : '';
  $('#searchStatus').textContent = s.error
    ? s.error
    : s.q
    ? `${s.total.toLocaleString()} verse${s.total === 1 ? '' : 's'} for ${s.q.includes('"') ? s.q : `“${s.q}”`}${sn}${s.total > s.results.length ? ` — showing ${s.results.length}` : ''}`
    : '';
  const box = $('#searchResults');
  if (!s.q) {
    box.innerHTML = helpHtml();
    return;
  }
  if (!s.results.length && !s.error) {
    box.innerHTML = '<div class="empty">No verses found.</div>';
    return;
  }
  box.innerHTML =
    s.results
      .map((r) => {
        let t = hiliteTerms(r.text, s.q.replace(/\b[HGhg]\d{1,4}[a-z]?\b/g, ' '));
        if (r.glosses) t = hiliteGloss(r.text, r.glosses, '').replace(/<b>/g, '<b class="sg">');
        return `<div class="hit" data-id="${r.id}"><div class="lab">${esc(r.label)}${r.glosses ? `<span class="gls">${esc(r.glosses)}</span>` : ''}</div><div class="t">${t}</div></div>`;
      })
      .join('') + (s.total > s.results.length ? '<button class="more">Load more results</button>' : '');
}

async function runSearch(q, append = false) {
  q = (q || '').trim();
  if (!q) return;
  const scope = $('#scopeSel').value;
  const offset = append ? state.search.results.length : 0;
  const res = await tsk.search(q, 'kjv', scope, 200, offset);
  state.search = {
    q,
    total: res.total,
    strongs: res.strongs,
    results: append ? state.search.results.concat(res.results) : res.results,
    error: res.error,
  };
  renderSearch();
  switchTab('search');
}

function helpHtml() {
  return `<div class="help hint">
    <p><b>Search tips</b></p>
    <p><code>faith hope charity</code> — verses containing all of the words</p>
    <p><code>"living water"</code> — an exact phrase</p>
    <p><code>shepherd OR sheep</code> — either word</p>
    <p><code>grace -law</code> — leave out verses with a word</p>
    <p><code>redeem*</code> — word beginnings (redeem, redeemed, redeemer…)</p>
    <p><code>G25</code> — every verse using Greek <i>agapaō</i>; <code>H2617 mercy</code> — Hebrew <i>hesed</i> where the KJV says “mercy”</p>
    <p><code>G26 -love</code> — where <i>agapē</i> is translated some other way (e.g. “charity”)</p>
    <p>Word endings are matched loosely, so <code>love</code> also finds <i>loved</i> and <i>loveth</i>.</p>
    <p><b>Go to</b> box: <code>John 3:16</code>, <code>jn 3 16</code>, <code>1 cor 13:4-7</code>, <code>Ps 23</code>.</p>
    <p><b>Keys</b>: ↑/↓ verses · Ctrl+←/→ chapter · Alt+←/→ back/forward · Ctrl+1–6 tabs · Ctrl+P study sheet · double-click a word for its card.</p>
  </div>`;
}

// ===================================================================== notes manager (override)
async function renderMarks() {
  const ids = new Set(state.bookmarks.map((b) => b.id));
  for (const k of Object.keys(state.notes)) if (state.notes[k]) ids.add(Number(k));
  for (const k of Object.keys(state.highlights || {})) ids.add(Number(k));
  for (const k of Object.keys(state.tags || {})) ids.add(Number(k));
  $('#markCount').textContent = ids.size ? `(${ids.size})` : '';

  const tagCounts = {};
  for (const list of Object.values(state.tags || {})) for (const t of list) tagCounts[t] = (tagCounts[t] || 0) + 1;

  let list = [...ids].sort((a, b) => a - b);
  const f = state.markFilter;
  if (f === 'marks') list = list.filter((id) => state.bookmarks.some((b) => b.id === id));
  if (f === 'notes') list = list.filter((id) => state.notes[id]);
  if (f === 'hl') list = list.filter((id) => state.highlights[id]);
  if (v3.markTag) list = list.filter((id) => (state.tags[id] || []).includes(v3.markTag));
  const verses = await tsk.versesByIds(list);
  const q = v3.markQuery.trim().toLowerCase();
  const shown = q
    ? verses.filter((v) => [v.label, v.text, state.notes[v.id] || '', (state.tags[v.id] || []).join(' ')].join(' ').toLowerCase().includes(q))
    : verses;

  const pane = $('#pane-marks');
  const hadFocus = document.activeElement && document.activeElement.id === 'markSearch';
  pane.innerHTML =
    `<div class="filter">
      ${[['all', 'All'], ['marks', 'Bookmarked'], ['notes', 'With notes'], ['hl', 'Highlighted']]
        .map(([k, t]) => `<button data-f="${k}" class="${f === k ? 'on' : ''}">${t}</button>`)
        .join('')}
    </div>
    ${Object.keys(tagCounts).length ? `<div class="tagbar">${Object.entries(tagCounts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([t, n]) => `<button class="tag${v3.markTag === t ? ' on' : ''}" data-tag="${esc(t)}">#${esc(t)} <span>${n}</span></button>`)
      .join('')}</div>` : ''}
    <input id="markSearch" class="marksearch" placeholder="Search your notes and tags" value="${esc(v3.markQuery)}" />` +
    (shown.length
      ? shown
          .map((v) => {
            const isMark = state.bookmarks.some((b) => b.id === v.id);
            const hl = state.highlights[v.id];
            const tags = state.tags[v.id] || [];
            return `<div class="mark${hl ? ` hlbar hl-${hl}` : ''}" data-id="${v.id}"><div class="top"><span class="lab">${isMark ? '&#9733; ' : ''}${esc(v.label)}</span>
            ${isMark ? `<button class="del" data-id="${v.id}" title="Remove bookmark">&times;</button>` : ''}</div>
            <div class="t">${esc(v.text)}</div>
            ${tags.length ? `<div class="mtags">${tags.map((t) => `<span>#${esc(t)}</span>`).join('')}</div>` : ''}
            ${state.notes[v.id] ? `<div class="nt">${esc(state.notes[v.id])}</div>` : ''}</div>`;
          })
          .join('')
      : `<div class="empty">${ids.size ? 'Nothing matches.' : 'Nothing here yet. Bookmark, highlight, tag, or write a note on any verse.'}</div>`);
  if (hadFocus) {
    const inp = $('#markSearch');
    inp.focus();
    inp.setSelectionRange(inp.value.length, inp.value.length);
  }
}

// ===================================================================== study sheet
async function buildSheet(id) {
  const [x, words, comm, topics] = await Promise.all([tsk.xrefs(id), tsk.words(id), tsk.commentary(id), tsk.naveForVerse(id)]);
  const groups = await Promise.all(
    x.groups.map(async (g) => ({
      ...g,
      texts: await Promise.all(g.refs.map((r) => tsk.passage(r.start, Math.min(r.end, r.start + 4)))),
    }))
  );
  const note = state.notes[id];
  const tags = state.tags[id] || [];
  const plainComm = comm ? commHtml(comm.html).replace(/<span class="cref"[^>]*>(.*?)<\/span>/g, '<b>$1</b>') : '';
  const date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(x.verse.label)} — Study sheet</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #1f1b16; font-size: 11pt; line-height: 1.45; }
  h1 { font-size: 20pt; font-weight: normal; margin: 0 0 4pt; }
  h2 { font-size: 12pt; text-transform: uppercase; letter-spacing: .08em; color: #1f3a6b; border-bottom: 1px solid #d6dbe6; padding-bottom: 3pt; margin: 18pt 0 8pt; font-family: 'Segoe UI', Arial, sans-serif; }
  .meta { color: #6b6155; font-size: 9pt; font-family: 'Segoe UI', Arial, sans-serif; }
  .verse { font-size: 14pt; background: #f1f4fa; padding: 10pt 12pt; border-left: 3pt solid #1f3a6b; margin: 10pt 0; }
  .note { white-space: pre-wrap; background: #fffdf9; border: 1px solid #e1dccf; padding: 8pt 10pt; }
  .tags span { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9pt; background: #e4eaf5; padding: 1pt 6pt; border-radius: 8pt; margin-right: 4pt; }
  .kw { font-weight: bold; color: #1f3a6b; margin-top: 8pt; }
  .ref { margin: 2pt 0 2pt 12pt; }
  .ref b { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9pt; color: #8a6414; }
  table { border-collapse: collapse; width: 100%; font-size: 10pt; }
  td, th { border-bottom: 1px solid #e1dccf; padding: 3pt 5pt; text-align: left; vertical-align: top; }
  th { font-family: 'Segoe UI', Arial, sans-serif; font-size: 8pt; text-transform: uppercase; color: #6b6155; }
  .og { font-size: 13pt; }
  .H { direction: rtl; }
  .comm h4 { margin: 6pt 0 2pt; font-size: 11pt; }
  .topics { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9.5pt; }
  .credits { margin-top: 24pt; font-size: 7.5pt; color: #8a8072; font-family: 'Segoe UI', Arial, sans-serif; }
  h2, .kw { page-break-after: avoid; }
</style></head><body>
<h1>${esc(x.verse.label)}</h1>
<div class="meta">King James Version · Study sheet · ${esc(date)}</div>
<div class="verse">${esc(x.verse.text)}</div>
${tags.length ? `<div class="tags">${tags.map((t) => `<span>#${esc(t)}</span>`).join('')}</div>` : ''}
${note ? `<h2>My notes</h2><div class="note">${esc(note)}</div>` : ''}
<h2>Treasury of Scripture Knowledge</h2>
${groups.length ? groups
  .map((g, i) => `<div class="kw">${i + 1}. ${esc(g.anchor || '(whole verse)')}</div>${g.texts
    .map((p, j) => `<div class="ref"><b>${esc(g.refs[j].label)}</b> ${p.verses.map((v) => esc(v.text)).join(' ')}${g.refs[j].end > g.refs[j].start + 4 ? ' …' : ''}</div>`)
    .join('')}`)
  .join('') : '<p>No TSK entries for this verse.</p>'}
${words.length ? `<h2>Word study</h2><table><tr><th>English</th><th>Original</th><th>Translit.</th><th>Strong's</th><th>Grammar</th><th>Definition</th></tr>
${words.map((w) => `<tr><td>${esc(w.gloss)}</td><td class="og ${w.lang}">${esc(w.word)}</td><td><i>${esc(w.translit)}</i></td><td>${esc(w.strongs || '')}</td><td>${esc(shortGrammar(w.grammar))}</td><td>${esc(w.def || '')}</td></tr>`).join('')}</table>` : ''}
${comm ? `<h2>Matthew Henry · Concise Commentary (${esc(comm.label)})</h2><div class="comm">${plainComm}</div>` : ''}
${topics.length ? `<h2>Nave's Topical Bible</h2><div class="topics">Topics that cite this verse: ${topics.map((t) => esc(t.subject)).join(' · ')}</div>` : ''}
<div class="credits">KJV (public domain). Treasury of Scripture Knowledge via CrossReferences.org (CC BY 4.0). Hebrew/Greek data: STEPBible.org, Tyndale House (CC BY 4.0).
Strong's (public domain; Open Scriptures CC BY-SA). Matthew Henry's Concise Commentary (public domain). Nave's Topical Bible (public domain; BibleData CC BY 4.0).</div>
</body></html>`;
  return { html, name: `${x.verse.label} - study sheet` };
}

async function exportSheet(print) {
  const id = state.cur.sel;
  if (!id) return toast('Select a verse first');
  toast(print ? 'Preparing to print…' : 'Building study sheet…');
  const { html, name } = await buildSheet(id);
  if (print) await tsk.printSheet(html);
  else {
    const saved = await tsk.exportSheet(html, name);
    if (saved) toast('Study sheet saved');
  }
}

// ===================================================================== events
function wireV3() {
  // trail
  $('#trailItems').addEventListener('click', (e) => {
    const c = e.target.closest('.crumb');
    if (!c) return;
    v3.skipTrail = true;
    v3.cursor = Number(c.dataset.i);
    go({ id: Number(c.dataset.id) });
  });
  $('#trailClear').addEventListener('click', () => {
    state.trail = state.cur.sel ? [state.cur.sel] : [];
    v3.cursor = state.trail.length - 1;
    saveUser(['trail']);
    renderTrail();
  });

  // highlight + tags (refs pane)
  $('#pane-refs').addEventListener('click', (e) => {
    const d = e.target.closest('.v3tools .dot');
    if (d && state.xref) setHighlight(state.xref.verse.id, d.dataset.hl);
  });
  $('#pane-refs').addEventListener('change', (e) => {
    if (e.target.classList.contains('tagin')) setTags(Number(e.target.dataset.id), e.target.value);
  });
  $('#pane-refs').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.classList.contains('tagin')) {
      e.preventDefault();
      setTags(Number(e.target.dataset.id), e.target.value);
      e.target.blur();
      toast('Tags saved');
    }
  });

  // commentary
  const crefPreview = async (el) => {
    if (!el.dataset.s) {
      const r = await tsk.osis(el.dataset.osis);
      if (!r) return;
      el.dataset.s = r.start;
      el.dataset.e = r.end;
    }
    showPreview(el);
  };
  $('#pane-comm').addEventListener('mouseover', (e) => {
    const c = e.target.closest('.cref');
    if (c) crefPreview(c);
  });
  $('#pane-comm').addEventListener('mouseout', (e) => e.target.closest('.cref') && hidePreview());
  $('#pane-comm').addEventListener('click', async (e) => {
    const c = e.target.closest('.cref');
    if (c) {
      hidePreview();
      const r = await tsk.osis(c.dataset.osis);
      if (r) go({ id: r.start, endId: r.end });
      return;
    }
    const a = e.target.closest('[data-act]');
    if (!a || !v3.comm) return;
    if (a.dataset.act === 'commPrev' && v3.comm.prev) go({ id: v3.comm.prev });
    if (a.dataset.act === 'commNext' && v3.comm.next) go({ id: v3.comm.next });
    if (a.dataset.act === 'commShow') go({ id: v3.comm.start_id, endId: v3.comm.end_id }).then(() => switchTab('comm'));
  });

  // topics
  let tq;
  $('#pane-topics').addEventListener('input', (e) => {
    if (e.target.id !== 'topicInput') return;
    clearTimeout(tq);
    tq = setTimeout(async () => {
      v3.topicQuery = e.target.value.trim();
      v3.topicResults = v3.topicQuery ? await tsk.naveSearch(v3.topicQuery) : [];
      const pos = e.target.selectionStart;
      renderTopicList();
      const inp = $('#topicInput');
      inp.focus();
      inp.setSelectionRange(pos, pos);
    }, 200);
  });
  $('#pane-topics').addEventListener('submit', async (e) => {
    if (e.target.id !== 'topicForm') return;
    e.preventDefault();
    v3.topicQuery = $('#topicInput').value.trim();
    v3.topicResults = v3.topicQuery ? await tsk.naveSearch(v3.topicQuery) : [];
    if (v3.topicResults.length === 1) return openTopic(v3.topicResults[0].id);
    renderTopicList();
  });
  $('#pane-topics').addEventListener('click', (e) => {
    const t = e.target.closest('[data-topic]');
    if (t) return openTopic(Number(t.dataset.topic));
    if (e.target.closest('[data-act="topicBack"]')) return renderTopicList();
    const r = e.target.closest('.ref');
    if (r) {
      hidePreview();
      go({ id: Number(r.dataset.s), endId: Number(r.dataset.e) }).then(() => switchTab('topics'));
    }
  });

  // notes manager extras
  $('#pane-marks').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tag]');
    if (t) {
      v3.markTag = v3.markTag === t.dataset.tag ? null : t.dataset.tag;
      renderMarks();
    }
  });
  let mq;
  $('#pane-marks').addEventListener('input', (e) => {
    if (e.target.id !== 'markSearch') return;
    clearTimeout(mq);
    mq = setTimeout(() => {
      v3.markQuery = e.target.value;
      renderMarks();
    }, 200);
  });

  // study sheet + menu
  $('#btnSheet').addEventListener('click', () => exportSheet(false));
  tsk.onMenu((cmd) => {
    if (cmd === 'exportSheet') exportSheet(false);
    else if (cmd === 'printSheet') exportSheet(true);
    else if (cmd === 'clearTrail') $('#trailClear').click();
    else if (cmd.startsWith('tab:')) switchTab(cmd.slice(4));
  });

  // re-apply highlights when the reader re-renders selection
  renderTrail();
}

wireV3();
