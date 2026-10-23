'use strict';
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
      ${w.grammar ? `<div class="il-p">${esc(shortGrammar(w.grammar))}</div>` : ''}</div>`)
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
  const refs = TOUR.find((t) => t.title === 'Cross-references');
  if (refs) refs.text += ' Switch to Map to see the references as a web, including the verses where they converge.';
  const words = TOUR.find((t) => t.title === 'Word study');
  if (words) words.text = 'Every Hebrew or Greek word with its Strong\'s number and grammar — as a list, or switch to Interlinear to see each word stacked with its meaning. Click a Strong\'s number for every verse that uses it. Double-click any word in the text for Webster\'s 1828 definition.';
}
{
  const prevQS = window.openQuickStart;
  window.openQuickStart = () => {
    prevQS();
    const first = $('#modal .qs section');
    if (first) first.insertAdjacentHTML('afterend', `<section><h3>Maps and views</h3><ul>
      <li><b>Places</b> tab: a map of every place named in the chapter; click a place for all the verses that name it.</li>
      <li><b>Refs › Map</b>: the cross-references as a web around the verse, plus the verses where they converge. Click any verse to re-center.</li>
      <li><b>Words › Interlinear</b>: each Hebrew or Greek word stacked with transliteration, meaning, Strong's number and grammar.</li></ul></section>`);
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
