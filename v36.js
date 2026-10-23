'use strict';
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
