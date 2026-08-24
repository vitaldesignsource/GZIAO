/* GZ IAO service worker — the installable shell, with safe updates.

   Strategy, chosen for correctness over cleverness:
   - Every same-origin GET is network-first. Online users always receive
     the newest deploy immediately; nothing here can serve a stale page
     while the network is available.
   - Successful responses are copied into the cache under a QUERY-LESS
     key, so a fresh ?v=N asset replaces its predecessor in place and the
     offline snapshot always tracks the newest copy the user has seen.
   - Cross-origin requests (Supabase auth, Crossref, OpenAlex, Nominatim,
     map tiles, fonts) are never intercepted and never cached here.
   - Content updates therefore need no version bump. Bumping VERSION only
     renames the cache: it re-snapshots the offline shell on install and
     purges the previous snapshot on activate. */

const VERSION = "gz-sw-v1";

/* files a navigation cannot survive without — install FAILS if any of
   these cannot be fetched, which leaves the previous worker and its
   intact snapshot in charge until the next attempt */
const CRITICAL = [
  "app.html",
  "index.html",
  "signin.html",
  "welcome.html",
  "styles.css",
  "app.css",
  "command.css",
  "polish.css",
  "config.js",
  "auth.js",
  "pwa.js",
  "vendor/supabase.min.js",
];

/* the rest of the shell — cached best-effort at install; anything missed
   is picked up by the runtime cache on first use */
const EXTRAS = [
  "script.js",
  "glyphs.js",
  "pyramid.js",
  "tree.js",
  "study-data.js",
  "astro.js",
  "vendor/astronomy.browser.min.js",
  "vendor/leaflet.js",
  "vendor/leaflet.css",
  "favicon.svg",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
];

/* cache keys are always the query-less same-origin path, so exactly one
   record exists per file regardless of its ?v revision */
function cacheKey(url) {
  return new URL(url.pathname, self.location.origin).toString();
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then(async (cache) => {
      const fetchFresh = async (path) => {
        const response = await fetch(new Request(path, { cache: "reload" }));
        if (!response.ok) throw new Error(path + " → " + response.status);
        await cache.put(cacheKey(new URL(path, self.location.origin)), response);
      };
      /* critical files must all land — a partial shell is worse than none */
      await Promise.all(CRITICAL.map(fetchFresh));
      await Promise.allSettled(EXTRAS.map(fetchFresh));
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name !== VERSION).map((name) => caches.delete(name)))
      )
      .then(async () => {
        /* purge any legacy records stored with a query string, so the
           query-less key is the only record per file */
        const cache = await caches.open(VERSION);
        const keys = await cache.keys();
        await Promise.all(
          keys
            .filter((request) => new URL(request.url).search !== "")
            .map((request) => cache.delete(request))
        );
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          /* waitUntil keeps the worker alive until the write commits, and
             the query-less key makes the write a replacement, not a pile */
          event.waitUntil(
            caches
              .open(VERSION)
              .then((cache) => cache.put(cacheKey(url), copy))
              .catch(() => {})
          );
        }
        return response;
      })
      .catch(async () => {
        /* offline: one query-less record per file, newest the user has seen */
        const cached = await caches.match(cacheKey(url));
        if (cached) return cached;
        if (request.mode === "navigate") {
          const path = url.pathname;
          const fallback =
            path.endsWith("/app.html") ? "app.html" :
            path.endsWith("/signin.html") ? "signin.html" :
            path.endsWith("/welcome.html") ? "welcome.html" : "index.html";
          const shell = await caches.match(cacheKey(new URL(fallback, self.location.origin)));
          if (shell) return shell;
        }
        return Response.error();
      })
  );
});
