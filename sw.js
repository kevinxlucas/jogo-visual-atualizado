const CACHE_NAME = 'jogo-visual-cache-v3';
const CORE_ASSETS = [
  './', './index.html', './styles.css', './app.js', './config.js', './manifest.webmanifest',
  './favicon.svg', './apple-touch-icon.svg', './vendor/p5.min.js', './vendor/p5.sound.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  // Não interceptar POST/Apps Script; evita quebrar sincronização externa.
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {});
      return response;
    }).catch(() => caches.match('./index.html')))
  );
});
