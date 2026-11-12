
const CACHE_NAME = "germany-kitchen-v1";

const APP_FILES = [
  "./",
  "./index.html",
  "./app.js",
  "./style.css",
  "./manifest.json"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(APP_FILES)
    )
  );

  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );

  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  // Never cache Supabase API requests.
  if (url.hostname.endsWith("supabase.co")) return;

  if (request.method !== "GET") return;

  event.respondWith(
    fetch(request).then(response => {
      if (response.ok && url.origin === self.location.origin) {
        const copy = response.clone();

        caches.open(CACHE_NAME).then(cache =>
          cache.put(request, copy)
        );
      }

      return response;
    }).catch(async () => {
      return await caches.match(request) ||
        await caches.match("./index.html");
    })
  );
});
