'use strict';
/* Maps: Bible places, the cross-reference map, the interlinear view, the journeys, and terrain.
   Merged in 3.15 from the per-release layers (v34.js, v35.js, v36.js), kept in their original order: later
   sections still extend earlier ones by wrapping window.X. */

// =====================================================================================================
// from v34.js
// =====================================================================================================
/* v3.4: Bible maps (Places tab), cross-reference map (Refs › Map), interlinear view (Words › Interlinear).
   Loaded after app.js, v3.js, v32.js, v33.js; overrides use window.X so earlier code picks them up. */
/* global tsk, state, $, $$, esc, go, toast, switchTab, showPreview, hidePreview, saveUser, ws, openStrong,
   strongChip, shortGrammar, TOUR */

const v34 = {
  base: null, // basemap (projected path strings)
  chapterKey: null,
  places: [],
  view: null, // map viewBox {x, y, w, h}
  detail: null, // place detail when open
  graph: null,
};
const K = Math.cos((32 * Math.PI) / 180); // equirectangular projection tuned for the Holy Land
const proj = (lon, lat) => [lon * K, -lat];
const GROUP_COLORS = ['var(--accent)', 'var(--gold)', '#2f7d6d', '#7a4f8f', '#9b5a2e', '#4d6a8a'];

// ===================================================================== hooks
{
  const prevOnVerse = window.v3OnVerse;
  window.v3OnVerse = (id, x) => {
    prevOnVerse(id, x);
    injectRefsSwitch();
    if (state.settings.refsView === 'map') renderGraph(id);
    loadPlaces(id);
  };
  const prevWords = window.renderWordsPane;
  window.renderWordsPane = function () {
    prevWords();
    decorateWordsPane();
  };
}

// ===================================================================== Places tab (maps)
async function ensureBase() {
  if (v34.base) return v34.base;
  const b = await tsk.basemap();
  const ring = (pts) => pts.map(([lon, lat], i) => `${i ? 'L' : 'M'}${(lon * K).toFixed(3)} ${(-lat).toFixed(3)}`).join('') + 'Z';
  const line = (pts) => pts.map(([lon, lat], i) => `${i ? 'L' : 'M'}${(lon * K).toFixed(3)} ${(-lat).toFixed(3)}`).join('');
  const poly = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).map((p) => p.map(ring).join('')).join('');
  const lines = (g) => (g.type === 'LineString' ? [g.coordinates] : g.coordinates).map(line).join('');
  v34.base = {
    bbox: b.bbox,
    land: b.land.map(poly).join(''),
    lakes: b.lakes.map(poly).join(''),
    rivers: b.rivers.map(lines).join(''),
  };
  return v34.base;
}

async function loadPlaces(verseId) {
  const { book, ch } = state.cur;
  const key = `${book}:${ch}`;
  if (v34.chapterKey !== key) {
    v34.chapterKey = key;
    v34.places = await tsk.placesForChapter(book, ch);
    v34.view = null;
    v34.detail = null;
  }
  $('#placeCount').textContent = v34.places.length ? `(${v34.places.length})` : '';
  if (!v34.detail) renderPlaces(verseId);
}

function fitView(points, minSpan = 1.6) {
  if (!points.length) {
    const [x1, y1] = proj(31.5, 37.5);
    const [x2, y2] = proj(40.5, 28.5);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  let x = Math.min(...xs), y = Math.min(...ys), w = Math.max(...xs) - x, h = Math.max(...ys) - y;
  const pad = 0.35;
  const span = Math.max(w, h * 1.4, minSpan);
  const cx = x + w / 2, cy = y + h / 2;
  w = span * (1 + pad);
  h = (w / 1.4);
  if (Math.max(...ys) - Math.min(...ys) > h * 0.8) h = (Math.max(...ys) - Math.min(...ys)) * 1.4 + 0.4;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

const confidence = (s) => (s >= 900 ? 'location certain' : s >= 500 ? 'location likely' : s >= 200 ? 'location possible' : 'location uncertain');

async function renderPlaces(verseId) {
  const pane = $('#pane-places');
  const base = await ensureBase();
  const ps = v34.places;
  const label = state.chapter ? `${state.books[state.cur.book - 1].name} ${state.cur.ch}` : '';
  const inVerse = new Set(ps.filter((p) => p.verseIds.includes(verseId)).map((p) => p.id));
  if (!v34.view) v34.view = fitView(ps.map((p) => proj(p.lon, p.lat)));
  const list = [...ps].sort((a, b) => (inVerse.has(b.id) - inVerse.has(a.id)) || a.vss[0] - b.vss[0]);
  pane.innerHTML = `
    <div class="pl-head"><div><div class="kicker">Bible places</div><h2>${esc(label)}</h2>
      <div class="sub">${ps.length ? `${ps.length} place${ps.length === 1 ? '' : 's'} named in this chapter${inVerse.size ? ` · ${inVerse.size} in the selected verse` : ''}` : 'No places are named in this chapter.'}</div></div>
      <div class="map-btns"><button data-map="in" title="Zoom in">+</button><button data-map="out" title="Zoom out">&#8722;</button><button data-map="fit" title="Fit this chapter's places">Fit</button><button data-map="region" title="Whole region">Region</button></div></div>
    <svg id="bmap" class="bmap" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Map of places in ${esc(label)}">
      <rect class="sea" x="-100" y="-100" width="300" height="300"></rect>
      <path class="land" d="${base.land}"></path><path class="lake" d="${base.lakes}"></path><path class="river" d="${base.rivers}"></path>
      <g id="bmapPlaces"></g></svg>
    <div class="map-legend"><span><i class="lg-v"></i>in the selected verse</span><span><i class="lg-c"></i>elsewhere in this chapter</span><span class="hint">Scroll to zoom, drag to move</span></div>
    ${list.length ? `<div class="pl-list">${list
      .map((p) => `<div class="pl-row${inVerse.has(p.id) ? ' on' : ''}" data-place="${p.id}">
        <span class="pl-name">${esc(p.name)}</span><span class="pl-type">${esc(p.type)}</span>
        <span class="pl-vss">${p.vss.map((vs, i) => `<button class="pl-vs" data-vid="${p.verseIds[i]}">${state.cur.ch}:${vs}</button>`).join('')}</span></div>`)
      .join('')}</div>` : ''}
    <div class="hint" style="margin-top:10px">Locations from OpenBible.info's Bible geography data; uncertain sites are marked as such.</div>`;
  drawPlaces(inVerse);
  wireMap();
}

function drawPlaces(inVerse) {
  const svg = $('#bmap');
  if (!svg) return;
  const v = v34.view;
  svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
  const pxPerUnit = Math.min(svg.clientWidth / v.w, (svg.clientHeight || 340) / v.h) || 300 / v.w; // 'meet' scales by the tighter side
  const u = 1 / pxPerUnit; // map units per screen pixel
  svg.style.setProperty('--u', u);
  const pts = v34.detail ? [v34.detail] : v34.places;
  const hl = v34.detail ? new Set([v34.detail.id]) : inVerse || new Set();
  // Place labels in screen pixels: selected-verse places first, then the most-mentioned; a label that
  // would overlap one already placed tries the other sides of its dot, and is left off if none fit
  // (the dot stays, with its name on hover).
  const rank = [...pts].sort((a, b) => hl.has(b.id) - hl.has(a.id) || (b.total || 0) - (a.total || 0));
  const boxes = [];
  const label = new Map();
  for (const p of rank) {
    const [x, y] = proj(p.lon, p.lat);
    const sx = (x - v.x) / u, sy = (y - v.y) / u;
    boxes.push([sx - 6, sy - 6, sx + 6, sy + 6]);
  }
  rank.forEach((p) => {
    const [x, y] = proj(p.lon, p.lat);
    const sx = (x - v.x) / u, sy = (y - v.y) / u;
    const fs = hl.has(p.id) ? 13 : 11.5;
    const w = p.name.length * fs * 0.56, h = fs;
    const tries = [[8, 4, 'start'], [-8, 4, 'end'], [0, -9, 'middle'], [0, 17, 'middle']];
    const must = hl.has(p.id); // a selected-verse place always gets its name; it only avoids other names
    const me = rank.indexOf(p);
    const fits = (b) => !boxes.some((o, i) => i !== me && !(must && i < rank.length && !hl.has(rank[i].id)) && o[0] < b[2] && o[2] > b[0] && o[1] < b[3] && o[3] > b[1]);
    const boxAt = ([dx, dy, anchor]) => {
      const x0 = anchor === 'start' ? sx + dx : anchor === 'end' ? sx + dx - w : sx - w / 2;
      return [x0, sy + dy - h + 2, x0 + w, sy + dy + 2];
    };
    const pick = tries.find((t) => fits(boxAt(t))) || (must ? tries[0] : null);
    if (pick) {
      boxes.push(boxAt(pick));
      label.set(p.id, { x: x + pick[0] * u, y: y + pick[1] * u, anchor: pick[2], fs });
    }
  });
  const order = [...pts].sort((a, b) => hl.has(a.id) - hl.has(b.id));
  $('#bmapPlaces').innerHTML = order
    .map((p) => {
      const [x, y] = proj(p.lon, p.lat);
      const on = hl.has(p.id);
      const r = (on ? 6 : 4.5) * u;
      const dashed = p.score < 500 ? ' uncertain' : '';
      const L = label.get(p.id);
      return `<g class="pl-pt${on ? ' on' : ''}${dashed}" data-place="${p.id}"><title>${esc(p.name)}</title><circle cx="${x}" cy="${y}" r="${r}"></circle>${
        L ? `<text x="${L.x}" y="${L.y}" text-anchor="${L.anchor}" style="font-size:${L.fs * u}px">${esc(p.name)}</text>` : ''}</g>`;
    })
    .join('');
}

function wireMap() {
  const svg = $('#bmap');
  if (!svg) return;
  let drag = null;
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    zoomAt(e.deltaY < 0 ? 0.8 : 1.25, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  }, { passive: false });
  svg.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.pl-pt')) return;
    drag = { x: e.clientX, y: e.clientY, v: { ...v34.view } };
    svg.setPointerCapture(e.pointerId);
    svg.classList.add('dragging');
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const r = svg.getBoundingClientRect();
    const sx = drag.v.w / r.width;
    v34.view = { ...drag.v, x: drag.v.x - (e.clientX - drag.x) * sx, y: drag.v.y - (e.clientY - drag.y) * sx };
    drawPlaces(currentHighlight());
  });
  svg.addEventListener('pointerup', () => {
    drag = null;
    svg.classList.remove('dragging');
  });
}

function currentHighlight() {
  const id = state.cur.sel;
  return new Set(v34.places.filter((p) => p.verseIds.includes(id)).map((p) => p.id));
}

function zoomAt(f, fx = 0.5, fy = 0.5) {
  const v = v34.view;
  const w = Math.min(Math.max(v.w * f, 0.25), 40);
  const h = (v.h / v.w) * w;
  v34.view = { x: v.x + (v.w - w) * fx, y: v.y + (v.h - h) * fy, w, h };
  drawPlaces(currentHighlight());
}

async function openPlace(id) {
  const d = await tsk.placeDetail(id);
  if (!d) return;
  v34.detail = d;
  const pane = $('#pane-places');
  await ensureBase();
  v34.view = fitView([proj(d.lon, d.lat)], 2.2);
  pane.innerHTML = `
    <button class="backlink" data-act="placeBack">&#8592; Places in ${esc(state.books[state.cur.book - 1].name)} ${state.cur.ch}</button>
    <div class="pl-head"><div><div class="kicker">${esc(d.type || 'place')}</div><h2>${esc(d.name)}</h2>
      <div class="sub">Named in ${d.total.toLocaleString()} verse${d.total === 1 ? '' : 's'} · ${confidence(d.score)}</div></div>
      <div class="map-btns"><button data-map="in">+</button><button data-map="out">&#8722;</button><button data-map="region">Region</button></div></div>
    <svg id="bmap" class="bmap" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Map showing ${esc(d.name)}">
      <rect class="sea" x="-100" y="-100" width="300" height="300"></rect>
      <path class="land" d="${v34.base.land}"></path><path class="lake" d="${v34.base.lakes}"></path><path class="river" d="${v34.base.rivers}"></path>
      <g id="bmapPlaces"></g></svg>
    <div class="section-title">Every verse that names ${esc(d.name)}${d.verses.length < d.total ? ` (first ${d.verses.length})` : ''}</div>
    <div class="results">${d.verses.map((r) => `<div class="hit" data-id="${r.id}"><div class="lab">${esc(r.label)}</div><div class="t">${hiliteName(r.text, d.name)}</div></div>`).join('')}</div>`;
  drawPlaces();
  wireMap();
  pane.scrollTop = 0;
  switchTab('places');
}

function hiliteName(text, name) {
  const base = name.replace(/[^A-Za-z]/g, '');
  if (!base) return esc(text);
  return esc(text).replace(new RegExp(`\\b(${base.slice(0, Math.max(3, base.length - 1))}[a-z]*)`, 'g'), '<b>$1</b>');
}

// ===================================================================== Refs › Map (cross-reference map)
function injectRefsSwitch() {
  const head = $('#pane-refs .xhead');
  if (!head || $('.vswitch', head)) return;
  const map = state.settings.refsView === 'map';
  $('h2', head).insertAdjacentHTML('afterend', `<div class="vswitch" role="group" aria-label="Cross-reference view">
    <button data-refsview="list" class="${map ? '' : 'on'}">List</button><button data-refsview="map" class="${map ? 'on' : ''}">Map</button></div>`);
  $('#pane-refs').classList.toggle('mapview', map);
}

async function renderGraph(id) {
  const pane = $('#pane-refs');
  let box = $('#xgraph');
  if (!box) {
    pane.insertAdjacentHTML('beforeend', '<div id="xgraph" class="xgraph"></div>');
    box = $('#xgraph');
  }
  const g = await tsk.xrefGraph(id);
  if (!state.xref || state.xref.verse.id !== id) return;
  v34.graph = g;
  if (!g.ring1.length) {
    box.innerHTML = '<div class="empty">No TSK cross-references for this verse.</div>';
    return;
  }
  const W = Math.max(380, Math.min(box.clientWidth || 560, 760));
  const H = Math.round(W * 0.9);
  const cx = W / 2, cy = H / 2;
  const R2 = Math.min(W / 2 - 78, H / 2 - 24), R1 = R2 * 0.6; // leave room for outer labels
  const gi = new Map(g.keywords.map((k, i) => [k.sort, i]));
  const col = (sort) => GROUP_COLORS[(gi.get(sort) || 0) % GROUP_COLORS.length];
  const a1 = new Map();
  g.ring1.forEach((n, i) => a1.set(n.id, -Math.PI / 2 + (i / g.ring1.length) * Math.PI * 2));
  // ring 2: angle = circular mean of its parents, then spread so labels don't collide
  const r2 = g.ring2.map((n) => {
    const sx = n.parents.reduce((s, p) => s + Math.cos(a1.get(p)), 0);
    const sy = n.parents.reduce((s, p) => s + Math.sin(a1.get(p)), 0);
    return { ...n, a: Math.atan2(sy, sx) };
  }).sort((a, b) => a.a - b.a);
  const gap = Math.min((Math.PI * 2) / Math.max(r2.length, 1), 0.2);
  for (let pass = 0; pass < 3; pass++) for (let i = 1; i < r2.length; i++) if (r2[i].a - r2[i - 1].a < gap) r2[i].a = r2[i - 1].a + gap;
  const pos1 = (n) => [cx + R1 * Math.cos(a1.get(n.id)), cy + R1 * Math.sin(a1.get(n.id))];
  const pos2 = (n) => [cx + R2 * Math.cos(n.a), cy + R2 * Math.sin(n.a)];
  const anchor = (a) => (Math.cos(a) > 0.2 ? 'start' : Math.cos(a) < -0.2 ? 'end' : 'middle');
  const lbl = (x, y, a, d) => [x + Math.cos(a) * d, y + Math.sin(a) * d + 4];
  const edges1 = g.ring1.map((n) => {
    const [x, y] = pos1(n);
    return `<line class="e1" data-a="${n.id}" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" style="stroke:${col(n.group)}"></line>`;
  });
  const p1 = new Map(g.ring1.map((n) => [n.id, pos1(n)]));
  const edges2 = r2.flatMap((n) => {
    const [x, y] = pos2(n);
    return n.parents.map((p) => `<line class="e2" data-a="${p}" data-b="${n.id}" x1="${p1.get(p)[0]}" y1="${p1.get(p)[1]}" x2="${x}" y2="${y}"></line>`);
  });
  const nodes1 = g.ring1.map((n) => {
    const [x, y] = pos1(n);
    const a = a1.get(n.id);
    const [lx, ly] = lbl(x, y, a, 12);
    return `<g class="ref xn n1" data-s="${n.id}" data-e="${n.end}" data-node="${n.id}"><circle cx="${x}" cy="${y}" r="7" style="fill:${col(n.group)}"></circle>
      <text x="${lx}" y="${ly}" text-anchor="${anchor(a)}">${esc(n.label)}</text></g>`;
  });
  const nodes2 = r2.map((n) => {
    const [x, y] = pos2(n);
    const [lx, ly] = lbl(x, y, n.a, 9);
    return `<g class="ref xn n2" data-s="${n.id}" data-e="${n.end}" data-node="${n.id}"><circle cx="${x}" cy="${y}" r="${3 + n.parents.length}"></circle>
      <text x="${lx}" y="${ly}" text-anchor="${anchor(n.a)}">${esc(n.label)}</text></g>`;
  });
  box.innerHTML = `
    <div class="xg-legend">${g.keywords.map((k) => `<span><i style="background:${col(k.sort)}"></i>${esc(k.anchor || 'whole verse')}</span>`).join('')}</div>
    <svg class="xg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Cross-reference map for ${esc(g.center.label)}">
      <circle class="ring" cx="${cx}" cy="${cy}" r="${R1}"></circle><circle class="ring" cx="${cx}" cy="${cy}" r="${R2}"></circle>
      ${edges2.join('')}${edges1.join('')}
      ${nodes2.join('')}${nodes1.join('')}
      <g class="xn n0"><circle cx="${cx}" cy="${cy}" r="${Math.max(24, g.center.label.length * 3.1 + 7)}"></circle><text x="${cx}" y="${cy + 4}" text-anchor="middle">${esc(g.center.label)}</text></g>
    </svg>
    <div class="hint">Inner ring: this verse's ${g.ring1.length}${g.total > g.ring1.length ? ` (of ${g.total})` : ''} references, colored by key word. Outer ring: ${r2.length} verses that several of those references also point to — where the thread converges. Hover to preview; click any verse to re-center the map on it.</div>`;
}

// ===================================================================== Words › Interlinear
function decorateWordsPane() {
  if (ws.view !== 'verse' || !state.xref || state.xref.verse.id !== ws.verseId) return;
  const head = $('#pane-words .xhead');
  const il = state.settings.wordsView === 'interlinear';
  if (head && !$('.vswitch', head) && ws.words.length) {
    $('h2', head).insertAdjacentHTML('afterend', `<div class="vswitch" role="group" aria-label="Word view">
      <button data-wordsview="list" class="${il ? '' : 'on'}">List</button><button data-wordsview="interlinear" class="${il ? 'on' : ''}">Interlinear</button></div>`);
  }
  if (!il || !ws.words.length) return;
  const rows = $$('#pane-words .wsrow');
  const headRow = $('#pane-words .wslist-head');
  if (headRow) headRow.remove();
  const rtl = ws.words[0].lang === 'H';
  const cards = ws.words
    .map((w) => `<div class="ilw wsrow${ws.selPos === w.pos ? ' on' : ''}" data-pos="${w.pos}" data-sn="${esc(w.strongs || '')}" title="${esc(w.def || '')}">
      <div class="il-o ${w.lang}">${esc(w.word)}</div><div class="il-t">${esc(w.translit)}</div>
      <div class="il-g">${esc(w.gloss)}</div>${w.strongs ? `<div class="il-s">${esc(w.strongs)}</div>` : ''}
      ${w.grammar ? `<div class="il-p" title="${esc(shortGrammar(w.grammar))}">${esc(grammarLine(w.grammar))}</div>` : ''}</div>`)
    .join('');
  const grid = `<div class="ilgrid${rtl ? ' rtl' : ''}">${cards}</div>${rtl ? '<div class="hint">Hebrew reads right to left.</div>' : ''}`;
  if (rows.length) {
    rows[0].insertAdjacentHTML('beforebegin', grid);
    rows.forEach((r) => r.remove());
  }
}

// ===================================================================== tour + quick start
{
  const placesStep = { el: '[data-tab="places"]', tab: 'places', title: 'Bible maps', text: 'The Places tab maps every place named in the chapter — places in the selected verse are highlighted. Scroll to zoom, drag to move, and click a place to see every verse that names it.' };
  const i = TOUR.findIndex((t) => t.title === 'Your trail');
  TOUR.splice(i >= 0 ? i : TOUR.length - 1, 0, placesStep);
  const refs = TOUR.find((t) => t.title === 'Related verses');
  if (refs) refs.text += ' Switch to Map to see the references as a web, including the verses where they converge.';
  const words = TOUR.find((t) => t.title === 'Original words');
  if (words) words.text = 'The Hebrew or Greek behind each English word: every word with its Strong\'s number and its grammar in plain words — as a list, or switch to Interlinear to see each word stacked with its meaning. Click a Strong\'s number for every verse that uses it. Double-click any word in the text for Webster\'s 1828 definition.';
}
{
  const prevQS = window.openQuickStart;
  window.openQuickStart = () => {
    prevQS();
    const first = $('#modal .qs section');
    if (first) first.insertAdjacentHTML('afterend', `<section><h3>Maps and views</h3><ul>
      <li><b>Places</b> tab: a map of every place named in the chapter; click a place for all the verses that name it.</li>
      <li><b>Related verses › Map</b>: the cross-references as a web around the verse, plus the verses where they converge. Click any verse to re-center.</li>
      <li><b>Original words › Interlinear</b>: each Hebrew or Greek word stacked with transliteration, meaning, Strong's number and grammar.</li></ul></section>`);
  };
}

// ===================================================================== events
function wireV34() {
  // view switches (remembered)
  $('#pane-refs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-refsview]');
    if (!b) return;
    state.settings.refsView = b.dataset.refsview;
    saveUser(['settings']);
    $$('[data-refsview]').forEach((x) => x.classList.toggle('on', x === b));
    const map = state.settings.refsView === 'map';
    $('#pane-refs').classList.toggle('mapview', map);
    if (map && state.xref) renderGraph(state.xref.verse.id);
  });
  $('#pane-words').addEventListener('click', (e) => {
    const b = e.target.closest('[data-wordsview]');
    if (!b) return;
    e.stopPropagation();
    state.settings.wordsView = b.dataset.wordsview;
    saveUser(['settings']);
    renderWordsPane();
  }, true);

  // cross-reference map: hover highlights a node's links; click re-centers
  $('#pane-refs').addEventListener('mouseover', (e) => {
    const n = e.target.closest('.xn[data-node]');
    const svg = e.target.closest('svg.xg');
    if (!svg) return;
    svg.classList.toggle('focus', !!n);
    $$('.e1, .e2', svg).forEach((l) => l.classList.toggle('hot', !!n && (l.dataset.a === n.dataset.node || l.dataset.b === n.dataset.node)));
  });

  // Places tab
  $('#pane-places').addEventListener('click', (e) => {
    const m = e.target.closest('[data-map]');
    if (m) {
      const k = m.dataset.map;
      if (k === 'in') zoomAt(0.7);
      else if (k === 'out') zoomAt(1.4);
      else if (k === 'fit') {
        v34.view = null;
        renderPlaces(state.cur.sel);
      } else if (k === 'region') {
        v34.view = fitView([]);
        drawPlaces(v34.detail ? null : currentHighlight());
      }
      return;
    }
    if (e.target.closest('[data-act="placeBack"]')) {
      v34.detail = null;
      v34.view = null;
      return renderPlaces(state.cur.sel);
    }
    const vs = e.target.closest('.pl-vs');
    if (vs) return go({ id: Number(vs.dataset.vid) }).then(() => switchTab('places'));
    const hit = e.target.closest('.hit');
    if (hit) return go({ id: Number(hit.dataset.id) }).then(() => switchTab('places'));
    const p = e.target.closest('[data-place]');
    if (p) openPlace(p.dataset.place);
  });
  window.addEventListener('resize', () => {
    if ($('#bmap')) drawPlaces(v34.detail ? null : currentHighlight());
    if (state.settings.refsView === 'map' && state.xref && $('#xgraph')) renderGraph(state.xref.verse.id);
  });

  // a hidden map can't measure itself, so redraw when the Places tab is opened
  const showPlaces = () => setTimeout(() => {
    if (state.cur.sel) loadPlaces(state.cur.sel).then(() => $('#bmap') && drawPlaces(v34.detail ? null : currentHighlight()));
  }, 0);
  $('.tabs [data-tab="places"]').addEventListener('click', showPlaces);
  tsk.onMenu((cmd) => {
    if (cmd === 'tab:places') showPlaces();
  });
}

wireV34();

// =====================================================================================================
// from v35.js
// =====================================================================================================
/* v3.5: Bible journeys on the Places map — Paul, Jesus, the patriarchs, the Exodus, the conquest,
   the kings and prophets, the exile and return. Each stop is tied to the KJV verse that names it
   (verified when the data is built: tools/build_v35.py). Loaded after v34.js and reuses its map. */
/* global tsk, state, $, $$, esc, go, saveUser, v34, proj, fitView, ensureBase, wireMap, TOUR */

const v35 = {
  data: null, // [{id, title, who, scripture, summary, miles, stops:[…]}]
  jid: null, // journey id, or 'all:<who>' to compare a person's journeys
  step: 0,
  partial: 1, // 0..1 while the newest leg is being drawn
  timer: null,
  raf: null,
  chKey: null,
};
const JCOLORS = ['#1f3a6b', '#4a7cc4', '#b8892b', '#2f7d6d', '#8a5aa0', '#a8612f'];
const MODE_WORD = { land: 'over land', sea: 'by sea', crossing: 'on dry ground through the water', route: 'the way is not described', jump: 'a new party sets out' };

const jView = () => state.settings.placesView === 'journeys';
const jFollow = () => state.settings.journeyFollow !== false;
const jCompare = () => (v35.jid || '').startsWith('all:');
const jCur = () => (v35.data || []).find((j) => j.id === v35.jid);
const jGroup = (who) => v35.data.filter((j) => j.who === who);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// on the map, a stop whose KJV wording is only "the city" is labelled with the place's name
const mapLabel = (s) => (/^the city$/i.test(s.label) ? s.name : cap(s.label));

async function loadJourneys() {
  if (!v35.data) v35.data = await tsk.journeys();
  return v35.data;
}

// ===================================================================== hooks into the Places tab
{
  const prevRender = window.renderPlaces;
  window.renderPlaces = async function (verseId) {
    if (jView()) return renderJourneys(verseId);
    await prevRender(verseId);
    await decorateChapterPlaces(verseId);
  };
  const prevDraw = window.drawPlaces;
  window.drawPlaces = function (inVerse) {
    const svg = $('#bmap');
    if (svg && svg.dataset.kind === 'journey') return drawJourney();
    return prevDraw(inVerse);
  };
}

function viewSwitch() {
  const j = jView();
  return `<div class="vswitch" role="group" aria-label="Places view">
    <button data-pv="chapter" class="${j ? '' : 'on'}">This chapter</button><button data-pv="journeys" class="${j ? 'on' : ''}">Journeys</button></div>`;
}

// journeys with a stop in this chapter, and the stop nearest the selected verse
function journeysHere(verseId) {
  const { book, ch } = state.cur;
  const out = [];
  for (const j of v35.data || []) {
    const idx = j.stops.map((s, i) => (s.b === book && s.c === ch ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) continue;
    const upTo = idx.filter((i) => j.stops[i].verse <= verseId);
    out.push({ j, step: upTo.length ? upTo[upTo.length - 1] : idx[0] });
  }
  return out;
}

async function decorateChapterPlaces(verseId) {
  await loadJourneys();
  const pane = $('#pane-places');
  if (!pane || v34.detail || $('.pl-top', pane)) return;
  const here = journeysHere(verseId);
  const banner = here.length
    ? `<div class="j-banner"><span class="j-banner-ic" aria-hidden="true">${ICON_ROUTE}</span><div>This chapter is part of ${here
      .slice(0, 3)
      .map((h) => `<button class="linkish" data-jgo="${h.j.id}" data-jstep="${h.step}"><b>${esc(h.j.who === h.j.title ? h.j.title : `${h.j.who}: ${h.j.title}`)}</b></button>`)
      .join(', ')}. Follow it on the map, stop by stop.</div></div>`
    : '';
  pane.insertAdjacentHTML('afterbegin', `<div class="pl-top">${viewSwitch()}</div>${banner}`);
}

// ===================================================================== journeys view
async function renderJourneys(verseId) {
  await loadJourneys();
  await ensureBase();
  const pane = $('#pane-places');
  const key = `${state.cur.book}:${state.cur.ch}`;
  const chChanged = key !== v35.chKey;
  v35.chKey = key;
  // follow along: keep the map in step with what is being read
  if (jFollow() && verseId) {
    const here = journeysHere(verseId);
    const mine = here.find((h) => h.j.id === v35.jid);
    if (mine) setStepQuiet(mine.step);
    else if (here.length && (chChanged || !v35.jid)) {
      selectJourney(here[0].j.id, false);
      setStepQuiet(here[0].step);
    }
  }
  if (!v35.jid) selectJourney(state.settings.journey && v35.data.some((j) => j.id === state.settings.journey) ? state.settings.journey : v35.data[0].id, false);
  const built = $('#bmap', pane) && $('#bmap', pane).dataset.kind === 'journey' && pane.dataset.jid === v35.jid;
  if (!built) buildJourneyPane();
  if (!v34.view) v34.view = journeyFit();
  drawJourney();
  updateJourneyUI();
}

function selectJourney(id, save = true) {
  stopPlay();
  v35.jid = id;
  v35.step = 0;
  v35.partial = 1;
  v34.view = null;
  if (save) {
    state.settings.journey = id;
    saveUser(['settings']);
  }
}

function setStepQuiet(i) {
  const j = jCur();
  if (!j) return;
  v35.step = Math.max(0, Math.min(i, j.stops.length - 1));
  v35.partial = 1;
}

function journeyFit() {
  const js = jCompare() ? jGroup(v35.jid.slice(4)) : [jCur()];
  const pts = js.flatMap((j) => j.stops.flatMap((s) => [[s.lon, s.lat], ...s.path])).map(([lon, lat]) => proj(lon, lat));
  return fitView(pts, 0.5);
}

function pickerHTML() {
  const groups = [];
  for (const j of v35.data) {
    let g = groups.find((x) => x.who === j.who);
    if (!g) groups.push((g = { who: j.who, js: [] }));
    g.js.push(j);
  }
  return `<select id="jPick" aria-label="Choose a journey">${groups
    .map((g) => `<optgroup label="${esc(g.who)}">${g.js.map((j) => `<option value="${j.id}"${j.id === v35.jid ? ' selected' : ''}>${esc(j.title)}</option>`).join('')}${
      g.js.length > 1 ? `<option value="all:${esc(g.who)}"${v35.jid === `all:${g.who}` ? ' selected' : ''}>All ${g.js.length} together</option>` : ''}</optgroup>`)
    .join('')}</select>`;
}

const ICON_ROUTE = '<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="5" cy="18" r="2.4" fill="currentColor"/><circle cx="19" cy="6" r="2.4" fill="currentColor"/><path d="M5 18c3-6 9 0 14-12" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 3"/></svg>';
const IC = {
  first: '<svg viewBox="0 0 24 24"><path d="M6 5h2v14H6zM19 5v14l-10-7z"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M17 5v14L6 12z"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 5v14l12-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M7 5v14l11-7z"/></svg>',
  last: '<svg viewBox="0 0 24 24"><path d="M16 5h2v14h-2zM5 5v14l10-7z"/></svg>',
};

function buildJourneyPane() {
  const pane = $('#pane-places');
  pane.dataset.jid = v35.jid;
  const cmp = jCompare();
  const j = jCur();
  const js = cmp ? jGroup(v35.jid.slice(4)) : [j];
  const title = cmp ? `${v35.jid.slice(4)}: all journeys` : j.title;
  const sub = cmp
    ? `${js.length} journeys · about ${js.reduce((a, x) => a + x.miles, 0).toLocaleString()} miles`
    : `${esc(j.who === j.title ? '' : `${j.who} · `)}${esc(j.scripture)} · ${j.stops.length} stops · about ${j.miles.toLocaleString()} miles`;
  pane.innerHTML = `
    <div class="pl-top">${viewSwitch()}${pickerHTML()}
      <label class="j-follow" title="When you read a chapter that is part of a journey, the map follows along"><input type="checkbox" id="jFollow"${jFollow() ? ' checked' : ''}> Follow my reading</label></div>
    <div class="pl-head"><div><div class="kicker">Bible journeys</div><h2>${esc(title)}</h2><div class="sub">${sub}</div></div>
      <div class="map-btns"><button data-map="in" title="Zoom in">+</button><button data-map="out" title="Zoom out">&#8722;</button><button data-map="fit" title="Fit the whole journey">Fit</button><button data-map="region" title="Whole region">Region</button></div></div>
    <svg id="bmap" class="bmap jmap" data-kind="journey" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Map of ${esc(title)}">
      <rect class="sea" x="-100" y="-100" width="300" height="300"></rect>
      <path class="land" d="${v34.base.land}"></path><path class="lake" d="${v34.base.lakes}"></path><path class="river" d="${v34.base.rivers}"></path>
      <g id="jRoutes"></g><g id="jStops"></g></svg>
    ${cmp
    ? `<div class="j-legend">${js.map((x, i) => `<button class="j-leg" data-jopen="${x.id}"><i style="background:${JCOLORS[i % JCOLORS.length]}"></i><span><b>${esc(x.title)}</b><small>${esc(x.scripture)} · ${x.stops.length} stops · about ${x.miles.toLocaleString()} miles</small></span></button>`).join('')}</div>
       <div class="hint">Click a journey to follow it stop by stop.</div>`
    : `<div class="j-controls" role="group" aria-label="Journey controls">
        <button data-j="first" title="First stop">${IC.first}</button><button data-j="prev" title="Previous stop (←)">${IC.prev}</button>
        <button data-j="play" class="j-play" title="Play the journey">${IC.play}<span>Play</span></button>
        <button data-j="next" title="Next stop (→)">${IC.next}</button><button data-j="last" title="Last stop">${IC.last}</button>
        <input type="range" id="jRange" min="0" max="${j.stops.length - 1}" value="${v35.step}" aria-label="Stop">
        <span class="j-count"></span></div>
      <div id="jCard" class="j-card"></div>
      <p class="j-summary">${esc(j.summary)}</p>
      <div class="j-list">${j.stops.map((s, i) => `<div class="j-row" data-jstep="${i}"><span class="j-i">${i + 1}</span><span class="j-lbl">${esc(cap(s.label))}${s.uncertain ? ' <span class="j-q" title="Location uncertain">?</span>' : ''}</span><span class="j-mode">${i ? esc(MODE_WORD[s.mode]) : 'start'}</span><button class="pl-vs" data-vid="${s.verse}">${esc(s.ref)}</button></div>`).join('')}</div>`}
    <div class="hint j-foot">Every stop is the place a KJV verse names, located with OpenBible.info's Bible geography data; a dashed circle or ? marks a site that is uncertain. Scripture names the stops, not the roads, so the lines between them are approximate: solid over land, dashed by sea, dotted where the way is not described; a sandy band between walls of water marks a crossing on dry ground (the Red Sea, the Jordan).</div>`;
  wireMap();
}

function updateJourneyUI() {
  if (jCompare()) return;
  const j = jCur();
  if (!j || !$('#jCard')) return;
  const i = v35.step;
  const s = j.stops[i];
  const prev = i ? j.stops[i - 1] : null;
  const sofar = j.stops.slice(0, i + 1).reduce((a, x) => a + x.leg, 0);
  const how = !i ? 'Starting point'
    : s.mode === 'jump' ? `A new party sets out`
      : `${cap(MODE_WORD[s.mode])} from ${esc(cap(prev.label))}${s.leg ? ` · about ${s.leg.toLocaleString()} miles` : ''}${sofar ? ` · ${sofar.toLocaleString()} so far` : ''}`;
  const alt = s.name.replace(/[^a-z]/gi, '').toLowerCase() !== s.label.replace(/[^a-z]/gi, '').toLowerCase() ? `<span class="j-alt">${esc(s.name)}</span>` : '';
  $('#jCard').innerHTML = `
    <div class="j-num">${i + 1}</div>
    <div class="j-main">
      <div class="j-title"><span class="j-name">${esc(cap(s.label))}</span>${alt}</div>
      <div class="j-meta">${how}</div>
      <div class="j-verse"><button class="pl-vs" data-vid="${s.verse}" title="Open this verse">${esc(s.ref)}</button> ${hiliteLabel(s.text, s.label)}</div>
      ${s.note ? `<div class="j-note">${esc(s.note)}</div>` : ''}
      ${s.located ? `<div class="j-located">${esc(s.located)}</div>` : ''}
      <div class="j-flags">${s.uncertain ? '<span class="j-unc">Location uncertain</span>' : ''}<button class="linkish" data-place="${s.place}">Every verse that names ${esc(s.name)}</button></div>
    </div>`;
  const r = $('#jRange');
  if (r) r.value = i;
  $('.j-count').textContent = `Stop ${i + 1} of ${j.stops.length}`;
  $$('.j-row').forEach((row) => {
    const k = Number(row.dataset.jstep);
    row.classList.toggle('on', k === i);
    row.classList.toggle('done', k < i);
  });
  const play = $('.j-play');
  if (play) {
    play.innerHTML = `${v35.timer ? IC.pause : IC.play}<span>${v35.timer ? 'Pause' : i === j.stops.length - 1 ? 'Replay' : 'Play'}</span>`;
    play.classList.toggle('on', !!v35.timer);
  }
}

function hiliteLabel(text, label) {
  const words = label.replace(/^the\s+/i, '').split(/\s+/).filter((w) => w.length > 2).map((w) => w.replace(/[^A-Za-z]/g, '')).filter(Boolean);
  if (!words.length) return esc(text);
  const re = new RegExp(`\\b(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'gi');
  return esc(text).replace(re, '<b>$1</b>');
}

// ===================================================================== drawing
function pathD(pts, frac = 1) {
  let p = pts.map(([lon, lat]) => proj(lon, lat));
  if (frac < 1 && p.length > 1) {
    const seg = [];
    let total = 0;
    for (let k = 1; k < p.length; k++) total += seg[k - 1] = Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]);
    let want = total * frac;
    const out = [p[0]];
    for (let k = 1; k < p.length; k++) {
      if (want >= seg[k - 1]) {
        out.push(p[k]);
        want -= seg[k - 1];
      } else {
        const t = seg[k - 1] ? want / seg[k - 1] : 0;
        out.push([p[k - 1][0] + (p[k][0] - p[k - 1][0]) * t, p[k - 1][1] + (p[k][1] - p[k - 1][1]) * t]);
        break;
      }
    }
    p = out;
  }
  return p.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(4)} ${y.toFixed(4)}`).join('');
}

function legStyle(mode, u, w, color) {
  const dash = mode === 'sea' ? `stroke-dasharray:${7 * u} ${4.5 * u};` : mode === 'route' ? `stroke-dasharray:${0.1 * u} ${5 * u};` : '';
  return `stroke:${color};stroke-width:${w * u};${dash}`;
}

function drawJourney() {
  const svg = $('#bmap');
  if (!svg || svg.dataset.kind !== 'journey') return;
  const v = v34.view;
  svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
  const u = Math.max(v.w / (svg.clientWidth || 500), v.h / (svg.clientHeight || 380)); // map units per screen pixel ('meet')
  const routes = [];
  const dots = new Map(); // place id -> {s, state, order}
  if (jCompare()) {
    jGroup(v35.jid.slice(4)).forEach((j, k) => {
      const color = JCOLORS[k % JCOLORS.length];
      j.stops.forEach((s, i) => {
        if (i && s.mode !== 'jump') routes.push(`<path class="j-leg-l" d="${pathD(s.path)}" style="${legStyle(s.mode, u, 2.6, color)}"></path>`);
        const d = dots.get(s.place);
        if (!d) dots.set(s.place, { s, cls: 'visited', rank: i === 0 ? 0 : 1, color });
      });
    });
  } else {
    const j = jCur();
    const step = v35.step;
    j.stops.forEach((s, i) => {
      if (!i || s.mode === 'jump') return;
      if (s.mode === 'crossing') {
        // a way through the water on dry ground: a sandy path between two walls of water (Exodus 14:22)
        const d = pathD(s.path);
        routes.push(`<path class="j-wall" d="${d}" style="stroke-width:${15 * u}"></path><path class="j-dry" d="${d}" style="stroke-width:${9 * u}"></path>`);
      }
      if (i <= step) {
        routes.push(`<path class="j-leg-l done" d="${pathD(s.path, i === step ? v35.partial : 1)}" style="${legStyle(s.mode, u, i === step ? 3.6 : 2.8, 'var(--j-done)')}"></path>`);
      } else {
        routes.push(`<path class="j-leg-l todo" d="${pathD(s.path)}" style="${legStyle(s.mode, u, 2, 'var(--j-todo)')}"></path>`);
      }
    });
    j.stops.forEach((s, i) => {
      const d = dots.get(s.place);
      const st = i === step ? 'current' : i < step ? 'visited' : 'todo';
      const order = { current: 0, visited: 1, todo: 2 }[st];
      if (!d || order < d.order || (order === d.order && st === 'visited')) dots.set(s.place, { s, i, cls: st, order, rank: st === 'current' ? 0 : st === 'visited' ? 1 : 2 });
    });
  }
  $('#jRoutes').innerHTML = routes.join('');
  // labels: current stop always, then the visited stops, then the rest — skipped where they would collide
  const list = [...dots.values()].sort((a, b) => a.rank - b.rank);
  const boxes = list.map((d) => {
    const [x, y] = proj(d.s.lon, d.s.lat);
    const sx = (x - v.x) / u, sy = (y - v.y) / u;
    return [sx - 6, sy - 6, sx + 6, sy + 6];
  });
  const html = [];
  list.forEach((d, n) => {
    const [x, y] = proj(d.s.lon, d.s.lat);
    const sx = (x - v.x) / u, sy = (y - v.y) / u;
    const cur = d.cls === 'current';
    const fs = cur ? 14 : 11.5;
    const text = mapLabel(d.s);
    const w = text.length * fs * 0.56, h = fs;
    const tries = [[10, 4, 'start'], [-10, 4, 'end'], [0, -11, 'middle'], [0, 19, 'middle']];
    const boxAt = ([dx, dy, a]) => {
      const x0 = a === 'start' ? sx + dx : a === 'end' ? sx + dx - w : sx - w / 2;
      return [x0, sy + dy - h + 2, x0 + w, sy + dy + 2];
    };
    const fits = (b) => !boxes.some((o, k) => k !== n && !(cur && k < list.length) && o[0] < b[2] && o[2] > b[0] && o[1] < b[3] && o[3] > b[1]);
    const pick = tries.find((t) => fits(boxAt(t))) || (cur ? tries[0] : null);
    if (pick) boxes.push(boxAt(pick));
    const r = (cur ? 7 : d.cls === 'todo' ? 3.6 : 4.6) * u;
    const fill = d.color ? ` style="fill:${d.color}"` : '';
    html.push(`<g class="pl-pt j-pt ${d.cls}${d.s.uncertain ? ' uncertain' : ''}" data-jplace="${d.s.place}"><title>${esc(cap(d.s.label))} — ${esc(d.s.ref)}</title>
      ${cur ? `<circle class="j-halo" cx="${x}" cy="${y}" r="${13 * u}"></circle>` : ''}<circle cx="${x}" cy="${y}" r="${r}"${fill}></circle>${
      pick ? `<text x="${x + pick[0] * u}" y="${y + pick[1] * u}" text-anchor="${pick[2]}" style="font-size:${fs * u}px">${esc(text)}</text>` : ''}</g>`);
  });
  // draw the current stop last so it sits on top
  $('#jStops').innerHTML = html.reverse().join('');
}

// ===================================================================== stepping and playback
function goStep(i, { animate = true } = {}) {
  const j = jCur();
  if (!j) return;
  i = Math.max(0, Math.min(i, j.stops.length - 1));
  const forward = i === v35.step + 1;
  v35.step = i;
  cancelAnimationFrame(v35.raf);
  frameStep(i);
  if (animate && forward && j.stops[i].mode !== 'jump' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    v35.partial = 0;
    const t0 = performance.now();
    const dur = Math.min(1400, 450 + j.stops[i].leg * 2.2);
    const tick = (t) => {
      v35.partial = Math.min(1, (t - t0) / dur);
      v35.partial = 1 - Math.pow(1 - v35.partial, 2); // ease out
      drawJourney();
      if ((t - t0) / dur < 1) v35.raf = requestAnimationFrame(tick);
      else {
        v35.partial = 1;
        drawJourney();
      }
    };
    v35.raf = requestAnimationFrame(tick);
  } else {
    v35.partial = 1;
    drawJourney();
  }
  updateJourneyUI();
  const row = $(`.j-row[data-jstep="${i}"]`);
  const list = $('.j-list');
  if (row && list && v35.timer) {
    const pane = $('#pane-places');
    const rb = row.getBoundingClientRect(), pb = pane.getBoundingClientRect();
    if (rb.bottom > pb.bottom || rb.top < pb.top) row.scrollIntoView({ block: 'nearest' });
  }
}

// camera: frame each step. A short hop (Bethany to the mount of Olives) zooms in so it can be seen;
// a leg that runs off the map zooms back out to show it; otherwise the map holds still.
function frameStep(i) {
  const j = jCur();
  const v = v34.view;
  if (!j || !v) return;
  const s = j.stops[i];
  const p = i && s.mode !== 'jump' ? j.stops[i - 1] : null;
  const pts = [s, ...(p ? [p] : [])].map((x) => proj(x.lon, x.lat));
  if (p && s.mode === 'crossing') {
    // zoom to the crossing so the way through the water can be seen
    v34.view = fitView(s.path.map(([lo, la]) => proj(lo, la)), 0.9);
    return;
  }
  if (p && s.leg < 6 && v.w > 0.3) {
    v34.view = fitView(pts, Math.max(0.06, (s.leg / 69) * 2.5)); // about a degree per 69 miles
    return;
  }
  const inside = pts.every(([x, y]) => x > v.x + v.w * 0.06 && x < v.x + v.w * 0.94 && y > v.y + v.h * 0.08 && y < v.y + v.h * 0.92);
  if (!inside) v34.view = fitView(pts, v.w / 1.35);
}

function togglePlay() {
  const j = jCur();
  if (!j) return;
  if (v35.timer) return stopPlay();
  if (v35.step >= j.stops.length - 1) {
    v35.step = 0;
    v34.view = journeyFit();
    goStep(0, { animate: false });
  }
  v35.timer = setInterval(() => {
    const jj = jCur();
    if (!jj || !$('#jCard') || v35.step >= jj.stops.length - 1) return stopPlay();
    goStep(v35.step + 1);
  }, 2300);
  goStep(v35.step + 1);
  updateJourneyUI();
}

function stopPlay() {
  clearInterval(v35.timer);
  v35.timer = null;
  updateJourneyUI();
}

// ===================================================================== events
function wireV35() {
  const pane = $('#pane-places');
  pane.addEventListener('click', (e) => {
    const pv = e.target.closest('[data-pv]');
    if (pv) {
      if ((pv.dataset.pv === 'journeys') === jView()) return;
      stopPlay();
      state.settings.placesView = pv.dataset.pv;
      saveUser(['settings']);
      v34.view = null;
      v34.detail = null;
      delete pane.dataset.jid;
      return window.renderPlaces(state.cur.sel);
    }
    const jg = e.target.closest('[data-jgo]');
    if (jg) {
      state.settings.placesView = 'journeys';
      selectJourney(jg.dataset.jgo);
      v35.step = Number(jg.dataset.jstep) || 0;
      return renderJourneys(null);
    }
    const jo = e.target.closest('[data-jopen]');
    if (jo) {
      selectJourney(jo.dataset.jopen);
      return renderJourneys(null);
    }
    const b = e.target.closest('[data-j]');
    if (b) {
      const k = b.dataset.j;
      if (k === 'play') return togglePlay();
      stopPlay();
      const n = jCur().stops.length;
      return goStep(k === 'first' ? 0 : k === 'last' ? n - 1 : k === 'prev' ? v35.step - 1 : v35.step + 1);
    }
    const row = e.target.closest('.j-row');
    if (row && !e.target.closest('.pl-vs')) {
      stopPlay();
      return goStep(Number(row.dataset.jstep), { animate: false });
    }
    const pt = e.target.closest('.j-pt');
    if (pt && !jCompare()) {
      // a place visited more than once: go to its next visit after the current stop
      const j = jCur();
      const idx = j.stops.map((s, i) => (s.place === pt.dataset.jplace ? i : -1)).filter((i) => i >= 0);
      const next = idx.find((i) => i > v35.step) ?? idx[0];
      stopPlay();
      return goStep(next, { animate: false });
    }
  });
  pane.addEventListener('change', (e) => {
    if (e.target.id === 'jPick') {
      selectJourney(e.target.value);
      renderJourneys(null);
    } else if (e.target.id === 'jFollow') {
      state.settings.journeyFollow = e.target.checked;
      saveUser(['settings']);
    }
  });
  pane.addEventListener('input', (e) => {
    if (e.target.id !== 'jRange') return;
    const i = Number(e.target.value); // read before pausing, which resets the slider
    stopPlay();
    goStep(i, { animate: false });
  });
  // ← → step through a journey while the map has focus or the pointer is over the Places tab
  document.addEventListener('keydown', (e) => {
    if (!jView() || jCompare() || !$('#jCard') || !pane.offsetParent) return;
    if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (!pane.matches(':hover') && !pane.contains(document.activeElement)) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      e.stopPropagation();
      stopPlay();
      goStep(v35.step + (e.key === 'ArrowRight' ? 1 : -1));
    }
  }, true);
  // leaving the Places tab pauses playback
  $$('.tabs [data-tab]').forEach((t) => t.addEventListener('click', () => t.dataset.tab !== 'places' && v35.timer && stopPlay()));
}

// ===================================================================== tour + quick start
{
  const step = TOUR.find((t) => t.title === 'Bible maps');
  if (step) step.text += ' Switch to Journeys to follow Paul, Jesus, Abraham, the Exodus and more — press Play to watch the route unfold, with the verse for every stop.';
  const prevQS = window.openQuickStart;
  window.openQuickStart = () => {
    prevQS();
    const sec = [...$$('#modal .qs section')].find((s) => /Maps and views/.test(s.textContent));
    if (sec) $('ul', sec).insertAdjacentHTML('beforeend', `<li><b>Places › Journeys</b>: 25 journeys — Paul, Jesus, Abraham, Jacob, Joseph, the Exodus, Joshua, Ruth, the ark, David, Elijah, Jonah, Philip, Peter, and the exile and return. Press Play, use ← →, or click any stop; every stop shows the verse that names it. With <i>Follow my reading</i> on, the map keeps pace as you read.</li>`);
  };
}

wireV35();

// =====================================================================================================
// from v36.js
// =====================================================================================================
/* v3.6: map detail — NASA shaded-relief terrain under every map (with a Terrain switch), and key places,
   regions, seas and rivers always marked for context (Jerusalem on every map), shown more fully as you
   zoom in. Loaded after v35.js; wraps drawPlaces / drawJourney so every map gets these layers. */
/* global tsk, state, $, $$, esc, saveUser, v34, K, proj */

const v36 = { marks: null };
const RELIEF_BOX = [8, 21, 53, 46]; // same bounding box as basemap.json and relief.jpg
const terrainOn = () => state.settings.mapTerrain !== false;

tsk.landmarks().then((m) => {
  v36.marks = m;
  const svg = $('#bmap');
  if (svg) drawLandmarks(svg);
});

// ===================================================================== hooks
{
  const prevDrawPlaces = window.drawPlaces;
  window.drawPlaces = function (inVerse) {
    const r = prevDrawPlaces(inVerse);
    afterDraw();
    return r;
  };
  const prevDrawJourney = window.drawJourney;
  window.drawJourney = function () {
    const r = prevDrawJourney();
    afterDraw();
    return r;
  };
}

function afterDraw() {
  const svg = $('#bmap');
  if (!svg || !v34.view) return;
  ensureLayers(svg);
  drawLandmarks(svg);
}

// add the terrain image, the landmark layer and the Terrain switch to a freshly built map
function ensureLayers(svg) {
  if (!svg.querySelector('.relief')) {
    const [x0, y0, x1, y1] = RELIEF_BOX;
    svg.querySelector('.sea').insertAdjacentHTML('afterend',
      `<image class="relief" href="data/relief.jpg" x="${x0 * K}" y="${-y1}" width="${(x1 - x0) * K}" height="${y1 - y0}" preserveAspectRatio="none"></image>`);
  }
  if (!svg.querySelector('#bmapMarks')) {
    const first = svg.querySelector('#bmapPlaces, #jRoutes');
    first.insertAdjacentHTML('beforebegin', '<g id="bmapMarks"></g>');
  }
  svg.classList.toggle('terrain', terrainOn());
  const btns = svg.parentElement.querySelector('.map-btns');
  if (btns && !btns.querySelector('[data-map="terrain"]')) {
    btns.insertAdjacentHTML('beforeend', `<button data-map="terrain" class="${terrainOn() ? 'on' : ''}" title="Show or hide the terrain (mountains, valleys and deserts)">Terrain</button>`);
  }
}

// ===================================================================== landmarks
const LM_STYLE = {
  capital: { fs: 12.5, w: 700, r: 3.4, upper: false },
  city: { fs: 11, w: 500, r: 2.6, upper: false },
  mountain: { fs: 10.5, w: 500, r: 3.2, upper: false },
  region1: { fs: 10.5, w: 600, upper: true, ls: 1.6 },
  region2: { fs: 9.5, w: 600, upper: true, ls: 1.3 },
  sea: { fs: 11.5, w: 500, italic: true, ls: 0.6 },
  lake: { fs: 10, w: 500, italic: true },
  river: { fs: 10, w: 500, italic: true },
};

// which landmarks show at this zoom (v.w is the map's width in projected degrees)
function lmVisible(m, w) {
  if (m.kind === 'region1') return w >= 3.2 && w <= 40;
  if (m.kind === 'region2') return w <= 7.5;
  if (m.tier === 1) return true;
  if (m.tier === 2) return w <= 15;
  return w <= 3.6;
}

function drawLandmarks(svg) {
  const g = svg.querySelector('#bmapMarks');
  const v = v34.view;
  if (!g || !v || !v36.marks) return;
  // the map is drawn with preserveAspectRatio="meet": work out the real scale and the visible area
  const cw = svg.clientWidth || 500, ch = svg.clientHeight || 380;
  const u = Math.max(v.w / cw, v.h / ch);
  const W = cw, H = ch;
  const vx = v.x + v.w / 2 - (cw * u) / 2, vy = v.y + v.h / 2 - (ch * u) / 2; // map coords at the top-left corner
  // what the main layer already shows: its labels and dots are kept clear, and its places aren't repeated
  const occupied = [];
  const shown = new Set();
  const dots = [];
  svg.querySelectorAll('#bmapPlaces .pl-pt, #jStops .j-pt').forEach((p) => {
    shown.add(p.dataset.place || p.dataset.jplace);
    const c = p.querySelector('circle:not(.j-halo)');
    if (c) dots.push([(Number(c.getAttribute('cx')) - vx) / u, (Number(c.getAttribute('cy')) - vy) / u]);
    const t = p.querySelector('text');
    if (t) {
      try {
        const b = t.getBBox();
        if (b.width) occupied.push([(b.x - vx) / u - 2, (b.y - vy) / u - 2, (b.x + b.width - vx) / u + 2, (b.y + b.height - vy) / u + 2]);
      } catch { /* not rendered yet */ }
    }
  });
  dots.forEach(([x, y]) => occupied.push([x - 6, y - 6, x + 6, y + 6]));
  const hits = (b) => occupied.some((o) => o[0] < b[2] && o[2] > b[0] && o[1] < b[3] && o[3] > b[1]);
  const order = { capital: 0, sea: 1, river: 2, city: 3, mountain: 4, lake: 5, region1: 6, region2: 7 };
  const list = v36.marks
    .filter((m) => lmVisible(m, v.w) && !(m.place && shown.has(m.place)))
    .sort((a, b) => a.tier - b.tier || order[a.kind] - order[b.kind]);
  const out = [];
  const seen = new Set();
  // of a label placed in more than one spot (the Great Sea), try the one nearest the middle of the map first
  const mid = [vx + (cw * u) / 2, vy + (ch * u) / 2];
  const best = new Map();
  for (const m of list) {
    const d = Math.hypot(...proj(m.lon, m.lat).map((c, i) => c - mid[i]));
    if (!best.has(m.label) || d < best.get(m.label).d) best.set(m.label, { m, d });
  }
  for (const m of list.filter((x) => best.get(x.label).m === x)) {
    const [x, y] = proj(m.lon, m.lat);
    const sx = (x - vx) / u, sy = (y - vy) / u;
    if (sx < -40 || sy < -20 || sx > W + 40 || sy > H + 20) continue;
    if (m.place && dots.some(([dx, dy]) => Math.abs(dx - sx) < 7 && Math.abs(dy - sy) < 7)) continue;
    const st = LM_STYLE[m.kind];
    const text = st.upper ? m.label.toUpperCase() : m.label;
    const cw = st.fs * (st.upper ? 0.66 : 0.55) + (st.ls || 0);
    const w = text.length * cw, h = st.fs;
    const marker = m.kind === 'capital' || m.kind === 'city' || m.kind === 'mountain';
    let pick = null;
    if (marker) {
      const tries = [[st.r + 4, 4, 'start'], [-st.r - 4, 4, 'end'], [0, -st.r - 4, 'middle'], [0, st.r + st.fs + 2, 'middle']];
      for (const [dx, dy, a] of tries) {
        const x0 = a === 'start' ? sx + dx : a === 'end' ? sx + dx - w : sx - w / 2;
        const b = [x0, sy + dy - h + 2, x0 + w, sy + dy + 2];
        if (!hits(b) && x0 > 0 && x0 + w < W) {
          pick = { dx, dy, a, b };
          break;
        }
      }
      const dotBox = [sx - st.r - 1, sy - st.r - 1, sx + st.r + 1, sy + st.r + 1];
      if (!pick && m.tier > 1) continue; // only key cities keep their dot without a label
      if (hits(dotBox) && !pick) continue;
      occupied.push(dotBox);
    } else {
      const b = [sx - w / 2, sy - h / 2, sx + w / 2, sy + h / 2];
      if (b[0] < 2 || b[2] > W - 2 || b[1] < 2 || b[3] > H - 2) continue; // only labels that fit inside the map
      if (seen.has(m.label) || hits(b)) continue; // each sea or region named once
      seen.add(m.label);
      pick = { dx: 0, dy: st.fs * 0.35, a: 'middle', b };
    }
    if (pick) occupied.push(pick.b);
    const shape = m.kind === 'mountain'
      ? `<path d="M${x} ${y - st.r * 1.2 * u}L${x + st.r * u} ${y + st.r * 0.8 * u}L${x - st.r * u} ${y + st.r * 0.8 * u}Z"></path>`
      : marker ? `<circle cx="${x}" cy="${y}" r="${st.r * u}"></circle>` : '';
    const label = pick
      ? `<text x="${x + pick.dx * u}" y="${y + pick.dy * u}" text-anchor="${pick.a}" style="font-size:${st.fs * u}px;font-weight:${st.w}${st.ls ? `;letter-spacing:${st.ls * u}px` : ''}">${esc(text)}</text>`
      : '';
    const click = m.place && marker ? ` data-place="${m.place}"` : '';
    out.push(`<g class="lm lm-${m.kind}${marker ? ' pl-pt' : ''}"${click}>${m.place ? `<title>${esc(m.label)}</title>` : ''}${shape}${label}</g>`);
  }
  g.innerHTML = out.join('');
}

// ===================================================================== Terrain switch
$('#pane-places').addEventListener('click', (e) => {
  const b = e.target.closest('[data-map="terrain"]');
  if (!b) return;
  state.settings.mapTerrain = !terrainOn();
  saveUser(['settings']);
  b.classList.toggle('on', terrainOn());
  const svg = $('#bmap');
  if (svg) svg.classList.toggle('terrain', terrainOn());
});

// ===================================================================== quick start
{
  const prevQS = window.openQuickStart;
  window.openQuickStart = () => {
    prevQS();
    const sec = [...$$('#modal .qs section')].find((s) => /Maps and views/.test(s.textContent));
    if (sec) $('ul', sec).insertAdjacentHTML('beforeend', '<li><b>Map detail</b>: every map shows the land itself (mountains, valleys and deserts; <i>Terrain</i> turns it off) and keeps key places marked — Jerusalem always, more cities, mountains, regions, seas and rivers as you zoom in. Click a marked city for every verse that names it.</li>');
  };
}
