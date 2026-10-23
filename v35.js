'use strict';
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
