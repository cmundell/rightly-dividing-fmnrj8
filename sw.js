'use strict';
// Keeps Search the Scriptures working offline. The cache name changes with every release.
const CACHE = 'sts-3.9.0-0b2ad1c3ec';
const SHELL = ["./", "CHANGELOG.html", "app.js", "data/basemap.json", "data/family.json", "data/gospel.json", "data/journeys.json", "data/landmarks.json", "data/paths.json", "data/relief.jpg", "icon-180.png", "icon-192.png", "icon-512.png", "index.html", "lib/cjs-shim.js", "lib/db.js", "lib/docx.js", "lib/jszip.min.js", "lib/sql-wasm-browser.js", "lib/sql-wasm-browser.wasm", "manifest.webmanifest", "refparse.js", "robots.txt", "styles.css", "tsk-web.js", "v3.js", "v32.js", "v33.js", "v34.js", "v35.js", "v36.js", "v37.js", "v38.js", "v381.js", "v39.js", "web.css", "web.js"];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('sts-') && k !== CACHE && k !== 'sts-db').map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await caches.match(e.request, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(e.request);
    if (res.ok && !/tsk-db-/.test(e.request.url)) c.put(e.request, res.clone());
    return res;
  }));
});
