const CACHE = 'mocchi-v36';
const ASSETS = [
  '/',
  '/index.html',
  '/buscar.html',
  '/favoritos.html',
  '/ver-despues.html',
  '/historial.html',
  '/playlist.html',
  '/categorias.html',
  '/detalle.html',
  '/ver.html',
  '/404.html',
  '/admin.html',
  '/manifest.webmanifest',
  '/css/style.css',
  '/css/fonts/inter-var.woff2',
  '/js/utils.js',
  '/js/catalog.js',
  '/js/header.js',
  '/js/home.js',
  '/js/library.js',
  '/js/detail.js',
  '/js/player.js',
  '/js/hls.min.js',
  '/js/StreamSaver.js',
  '/js/app.js',
  '/js/app-search.js',
  '/js/app-lib.js',
  '/js/app-cat.js',
  '/js/app-playlist.js',
  '/js/app-detail.js',
  '/js/app-ver.js',
  '/js/admin.js',
  '/saver/mitm.html',
  '/saver/sw.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/profile.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api')) return;
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match(req).then(hit => hit || caches.match('/index.html')))
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        if (res.ok && (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.woff2') || url.pathname.endsWith('.png') || url.pathname.endsWith('.webmanifest'))) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
