'use strict';
// Keeps The Bible Study App working offline. The cache name changes with every release.
const CACHE = 'sts-3.17.2-df39d5e922';
const SHELL = ["./", "CHANGELOG.html", "data/basemap.json", "data/gospel.json", "data/journeys.json", "data/landmarks.json", "data/phrases.json", "data/relief.jpg", "data/scofield.json", "features.js", "home.js", "icon-180.png", "icon-192.png", "icon-512.png", "index.html", "lib/cjs-shim.js", "lib/db.js", "lib/docx.js", "lib/jszip.min.js", "lib/sql-wasm-browser.js", "lib/sql-wasm-browser.wasm", "manifest.webmanifest", "maps.js", "reader.js", "refparse.js", "robots.txt", "study.js", "styles.css", "tools.js", "tsk-web.js", "walk.js", "web.css", "web.js"];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('sts-') && k !== CACHE && k !== 'sts-db').map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  const u = new URL(e.request.url);
  // the page itself and its manifest come fresh from the site when online (so the Home Screen name and icon are
  // always the current ones), and from the phone when offline
  if (e.request.mode === 'navigate' || /\/(index\.html|manifest\.webmanifest)?$/.test(u.pathname)) {
    e.respondWith(fetch(e.request, { cache: 'no-store' }).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request.mode === 'navigate' ? './' : e.request, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(e.request.mode === 'navigate' ? './' : e.request, { ignoreSearch: true })));
    return;
  }
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await caches.match(e.request, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(e.request);
    if (res.ok && !/tsk-db-/.test(e.request.url)) c.put(e.request, res.clone());
    return res;
  }));
});
