'use strict';
/* Search the Scriptures — web (iPhone / any browser) edition.
   Stands in for the Windows app's back end: opens the same Bible database in the browser with sql.js,
   keeps your notes on this device (IndexedDB), and turns printing and saving into the browser's own. */
/* global initSqlJs, TskDb, JSZip, wRun, wPara, HL_FILL */

(() => {
  const VERSION = '3.10.1';
  const USER_KEYS = ['bookmarks', 'notes', 'settings', 'last', 'highlights', 'tags', 'trail', 'lessons', 'plan', 'memory', 'pins', 'readlog', 'journal', 'prayers', 'walk'];

  // ---------------------------------------------------------------- loading screen
  const splash = document.createElement('div');
  splash.id = 'webSplash';
  splash.innerHTML = `<div class="ws-card"><div class="ws-title">Search the Scriptures</div>
    <div class="ws-verse">“Search the scriptures; for in them ye think ye have eternal life: and they are they which testify of me.” <span>John 5:39</span></div>
    <div class="ws-bar"><i></i></div><div class="ws-msg">Opening…</div></div>`;
  const showSplash = () => document.body.appendChild(splash);
  if (document.body) showSplash();
  else document.addEventListener('DOMContentLoaded', showSplash);
  const say = (msg, frac) => {
    const m = splash.querySelector('.ws-msg');
    if (m) m.textContent = msg;
    if (frac != null) splash.querySelector('.ws-bar i').style.width = `${Math.round(frac * 100)}%`;
  };

  // ---------------------------------------------------------------- your notes, kept on this device
  const idb = new Promise((resolve, reject) => {
    const r = indexedDB.open('search-the-scriptures', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  const kvGet = async (k) => {
    const db = await idb;
    return new Promise((res, rej) => {
      const q = db.transaction('kv').objectStore('kv').get(k);
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    });
  };
  const kvSet = async (k, v) => {
    const db = await idb;
    return new Promise((res, rej) => {
      const t = db.transaction('kv', 'readwrite');
      t.objectStore('kv').put(v, k);
      t.oncomplete = () => res(true);
      t.onerror = () => rej(t.error);
    });
  };
  // ask the browser not to clear our storage when space runs low
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // ---------------------------------------------------------------- the Bible database
  async function fetchWithProgress(url, label, from, to) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    const total = Number(res.headers.get('content-length')) || 0;
    if (!res.body || !total) return new Uint8Array(await res.arrayBuffer());
    const reader = res.body.getReader();
    const parts = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      got += value.length;
      say(label, from + (to - from) * (got / total));
    }
    const out = new Uint8Array(got);
    let at = 0;
    for (const p of parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  }
  async function gunzip(bytes) {
    const ds = new DecompressionStream('gzip');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  // the database is kept in its own offline cache, saved once after the first download
  const DBFILE = 'data/tsk-db-99f1c3e642.gz';
  const DBPARTS = ["data/tsk-db-99f1c3e642.gz.1", "data/tsk-db-99f1c3e642.gz.2", "data/tsk-db-99f1c3e642.gz.3"];
  async function loadDbFile() {
    const cached = 'caches' in window ? await caches.match(DBFILE) : null;
    if (cached) {
      say('Opening the Bible…', 0.6);
      return new Uint8Array(await cached.arrayBuffer());
    }
    const pieces = [];
    for (let i = 0; i < DBPARTS.length; i++) {
      const a = 0.02 + (0.83 * i) / DBPARTS.length;
      pieces.push(await fetchWithProgress(DBPARTS[i], 'Downloading the Bible (first time only)…', a, a + 0.83 / DBPARTS.length));
    }
    const gz = new Uint8Array(pieces.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of pieces) {
      gz.set(p, at);
      at += p.length;
    }
    if ('caches' in window) {
      caches.open('sts-db').then(async (c) => {
        for (const k of await c.keys()) if (!k.url.endsWith(DBFILE)) await c.delete(k);
        await c.put(DBFILE, new Response(gz, { headers: { 'content-type': 'application/gzip' } }));
      }).catch(() => {});
    }
    return gz;
  }

  // a simple passcode, asked once per device, to keep casual visitors out (not real security)
  const PASS_HASH = 'ae18de0546092422a2afd95d8e939c2ac599881bdf80513fa46976758641f3ee';
  const sha = async (t) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const passed = (() => {
    try {
      return localStorage.getItem('sts-pass') === PASS_HASH;
    } catch {
      return false;
    }
  })();
  const gate = !PASS_HASH || passed ? Promise.resolve() : new Promise((resolve) => {
    const show = () => {
      const g = document.createElement('div');
      g.id = 'webGate';
      g.innerHTML = `<form class="wg-card"><div class="ws-title">Search the Scriptures</div>
        <p>Enter the passcode you were given.</p>
        <input type="password" autocomplete="off" autocapitalize="off" aria-label="Passcode" placeholder="Passcode" />
        <button class="primary-btn">Open</button><div class="wg-msg" aria-live="polite"></div></form>`;
      document.body.appendChild(g);
      const f = g.querySelector('form');
      f.querySelector('input').focus();
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = f.querySelector('input').value.trim().toLowerCase();
        if ((await sha(`sts:${v}`)) === PASS_HASH) {
          try {
            localStorage.setItem('sts-pass', PASS_HASH);
          } catch {
            /* asked again next time */
          }
          g.remove();
          resolve();
        } else {
          f.querySelector('.wg-msg').textContent = 'That passcode is not right.';
          f.querySelector('input').select();
        }
      });
    };
    if (document.body) show();
    else document.addEventListener('DOMContentLoaded', show);
  });

  const ready = (async () => {
    await gate;
    say('Loading the Bible…', 0.02);
    const [SQL, gz] = await Promise.all([
      initSqlJs({ locateFile: (f) => `lib/${f.replace('sql-wasm.wasm', 'sql-wasm-browser.wasm')}` }),
      loadDbFile(),
    ]);
    say('Opening…', 0.9);
    const bytes = await gunzip(gz);
    const db = Object.create(TskDb.prototype);
    db.db = new SQL.Database(bytes);
    db.engine = 'sql.js';
    db._loadIndex();
    say('Ready', 1);
    setTimeout(() => splash.classList.add('done'), 150);
    setTimeout(() => splash.remove(), 700);
    return db;
  })().catch((e) => {
    say(`Could not open the Bible: ${e.message}. Check your connection for the first load, then reload.`);
    throw e;
  });

  const json = {};
  const loadJson = (name, fallback) => (json[name] = json[name] || fetch(`data/${name}`).then((r) => r.json()).catch(() => fallback));

  // ---------------------------------------------------------------- printing and saving
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 4000);
    return name;
  }
  function printHtml(html) {
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(f);
    f.srcdoc = html;
    return new Promise((resolve) => {
      f.onload = () => {
        try {
          f.contentWindow.focus();
          f.contentWindow.print();
        } catch {
          const w = window.open('', '_blank');
          if (w) {
            w.document.write(html);
            w.document.close();
            w.print();
          }
        }
        setTimeout(() => {
          f.remove();
          resolve(true);
        }, 1500);
      };
    });
  }
  const safeName = (s, d) => String(s || d).replace(/[\\/:*?"<>|]+/g, ' ').trim() || d;

  async function exportNotesDocx(doc) {
    const body = [];
    body.push(wPara([wRun(doc.title || 'My notes', { sz: 40, color: '1F3A6B' })], { after: 40 }));
    if (doc.subtitle) body.push(wPara([wRun(doc.subtitle, { sz: 18, color: '5B6476', font: 'Segoe UI' })], { after: 240 }));
    for (const g of doc.groups || []) {
      body.push(wPara([wRun(g.heading, { sz: 30, b: true, color: '1F3A6B' })], { before: 240, after: 100, keepNext: true }));
      for (const it of g.items || []) {
        body.push(wPara([wRun(`${it.bookmark ? '★ ' : ''}${it.label}`, { b: true, sz: 21, color: '1F3A6B', font: 'Segoe UI' })], { before: 120, after: 20, keepNext: true }));
        body.push(wPara([wRun(it.text, { fill: HL_FILL[it.highlight] })], { after: it.tags && it.tags.length ? 20 : 60 }));
        if (it.tags && it.tags.length) body.push(wPara([wRun(it.tags.map((t) => `#${t}`).join('  '), { sz: 18, color: '8A6414', font: 'Segoe UI' })], { after: 60 }));
        if (it.note) for (const line of String(it.note).split(/\r?\n/)) body.push(wPara([wRun(line, { sz: 21, color: '333333', font: 'Segoe UI' })], { indent: 240, border: true, after: 20 }));
      }
    }
    if (doc.footer) body.push(wPara([wRun(doc.footer, { sz: 16, color: '8A8F99', font: 'Segoe UI' })], { before: 360 }));
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join('')}
<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    const zip = new JSZip();
    const nd = { createFolders: false };
    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>', nd);
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>', nd);
    zip.file('word/document.xml', xml, nd);
    return download(await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), `${safeName(doc.title, 'My notes')}.docx`);
  }

  // ---------------------------------------------------------------- the same calls the Windows app makes
  const D = (fn) => async (...a) => fn(await ready, ...a);
  window.tsk = {
    web: true,
    version: VERSION,
    books: D((db) => db.books),
    meta: D((db) => ({ ...db.meta, userFile: 'this device (web)' })),
    chapter: D((db, b, c) => db.chapter(b, c)),
    verseId: D((db, b, c, v) => db.verseId(b, c, v)),
    locate: D((db, id) => db.locate(id)),
    xrefs: D((db, id) => db.xrefs(id)),
    passage: D((db, s, e) => db.passage(s, e)),
    search: D((db, q, _tr, scope, limit, offset) => db.search(q, 'kjv', scope, limit, offset)),
    versesByIds: D((db, ids) => db.versesByIds(ids)),
    label: D((db, s, e) => db.label(s, e)),
    words: D((db, id) => db.words(id)),
    strong: D((db, id) => db.strong(id)),
    concordance: D((db, id, _tr, limit, offset) => db.concordance(id, 'kjv', limit, offset)),
    dict: D((db, w) => db.dict(w)),
    commentary: D((db, id) => db.commentary(id)),
    osis: D((db, r) => db.osis(r)),
    naveForVerse: D((db, id) => db.naveForVerse(id)),
    naveSearch: D((db, q) => db.naveSearch(q)),
    naveTopic: D((db, id) => db.naveTopic(id)),
    names: D((db, w) => db.names(w)),
    placesForChapter: D((db, b, c) => db.placesForChapter(b, c)),
    placeDetail: D((db, id) => db.placeDetail(id)),
    xrefGraph: D((db, id) => db.xrefGraph(id)),
    devotional: D((db, day) => db.devotional(day)),
    personVerses: D((db, pid, limit) => db.personVerses(pid, limit)),
    parallels: D((db, id) => db.parallels(id)),
    parallelsInChapter: D((db, b, c) => db.parallelsInChapter(b, c)),
    passageVerses: D((db, s, e, pad) => db.passageVerses(s, e, pad)),
    peopleInVerse: D((db, id) => db.peopleInVerse(id)),
    person: D((db, pid) => db.person(pid)),
    personLine: D((db, pid, t) => db.personLine(pid, t)),
    personSearch: D((db, q) => db.personSearch(q)),
    timeline: D((db) => db.timeline()),
    eventsForChapter: D((db, b, c) => db.eventsForChapter(b, c)),
    eventVerses: D((db, eid) => db.eventVerses(eid)),
    basemap: () => loadJson('basemap.json', { bbox: [8, 21, 53, 46], land: [], lakes: [], rivers: [] }),
    journeys: () => loadJson('journeys.json', { journeys: [] }).then((j) => j.journeys || []),
    landmarks: () => loadJson('landmarks.json', []),
    family: () => loadJson('family.json', { stories: [] }),
    gospel: () => loadJson('gospel.json', { steps: [], next: [] }),
    paths: () => loadJson('paths.json', { paths: [] }),
    // after an update reaches this phone, show What's New once (not on a first install)
    whatsNewPending: async () => {
      const u = (await kvGet('user')) || {};
      const seen = u.seenVersion;
      if (seen === VERSION) return false;
      u.seenVersion = VERSION;
      await kvSet('user', u);
      return !!seen || !!(u.settings && u.settings.tourDone);
    },
    userGet: async () => {
      const u = (await kvGet('user')) || {};
      const out = {};
      for (const k of USER_KEYS) out[k] = u[k];
      return { ...out, bookmarks: u.bookmarks || [], notes: u.notes || {}, settings: u.settings || {}, highlights: u.highlights || {}, tags: u.tags || {}, trail: u.trail || [], lessons: u.lessons || [], memory: u.memory || {}, pins: u.pins || [], plan: u.plan || null };
    },
    userSet: async (patch) => {
      const u = (await kvGet('user')) || {};
      for (const k of USER_KEYS) if (patch && k in patch) u[k] = patch[k];
      u.savedAt = new Date().toISOString();
      await kvSet('user', u);
      return true;
    },
    // printing: the phone's own print sheet (which can also save a PDF)
    printSheet: (html) => printHtml(html),
    exportSheet: (html) => printHtml(html),
    saveHtml: async (html, name) => download(new Blob([html], { type: 'text/html' }), `${safeName(name, 'Page')}.html`),
    exportNotesDocx: (doc) => exportNotesDocx(doc),
    // things only the Windows app can do
    notify: async () => false,
    openAtLogin: async () => false,
    speechAvailable: async () => false,
    speechWarm: async () => false,
    speak: async () => {
      throw new Error('Reading aloud is in the Windows app only');
    },
    uiZoom: async (f) => {
      const z = Math.min(1.6, Math.max(0.8, Number(f) || 1));
      document.documentElement.style.setProperty('--ui-zoom', z);
      document.body.style.zoom = z === 1 ? '' : z;
      return z;
    },
    onMenu: () => {},
    // web only: back up and restore your notes
    backup: async () => {
      const u = (await kvGet('user')) || {};
      const out = { app: 'Search the Scriptures', exported: new Date().toISOString() };
      for (const k of USER_KEYS) if (u[k] !== undefined) out[k] = u[k];
      return download(new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' }), `Search the Scriptures notes ${new Date().toISOString().slice(0, 10)}.json`);
    },
    restore: async (text) => {
      const data = JSON.parse(text);
      const u = (await kvGet('user')) || {};
      let n = 0;
      for (const k of USER_KEYS) if (data[k] !== undefined) {
        u[k] = data[k];
        n += 1;
      }
      if (!n) throw new Error('This file has no notes in it.');
      await kvSet('user', u);
      return n;
    },
  };

  // offline: a service worker keeps every file on the phone after the first visit
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
