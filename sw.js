const CACHE_NAME = "store-cache-v1";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js"
];

// Install Event: Save UI shell to browser storage
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate Event: Clear older caches if updated
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event: Intercept network requests
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  
  // CRITICAL: Bypass cache for your live Google Apps Script operations
  if (event.request.method === "POST" || url.href.includes("script.google.com")) {
    return; 
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    })
  );
});

/* ═══════════════════════════════════════
   AGGRESSIVE AUTO-UPDATE LOGIC
═══════════════════════════════════════ */

// 1. Force the new service worker to activate immediately 
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// 2. Tell the active service worker to take control of the page instantly
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
  
  // Optional: Clear out old caches automatically
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // You can add logic here to delete old cache names if you use cache versioning
          return caches.delete(cacheName); 
        })
      );
    })
  );
});
