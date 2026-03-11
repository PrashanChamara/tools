const CACHE_NAME = 'speech-to-text-pwa-v1';
const STATIC_FILES = [
  '/',               // the root route
  '/static/manifest.json',
  '/static/service-worker.js',
  // Add other static paths you want to cache:
  // e.g., '/static/icons/icon-192.png',
  // e.g., '/static/icons/icon-512.png',
  // For the CSS/JS from CDN, you typically can't cache them unless you fetch & store them yourself
  // but you can still rely on the browser cache. Alternatively, self-host or store them in your static folder.
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_FILES);
    })
  );
});

// Clean up old caches on activate
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(name => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      // If found in cache, return it, otherwise fetch from network
      return response || fetch(event.request);
    })
  );
});

