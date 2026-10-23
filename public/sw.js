/* MeetDoConnect service worker: keeps the shell available offline.
   Pages load from the network first so updates show up right away,
   and fall back to the saved copy when there is no connection.
   Next.js build files under /_next/static/ never change once built, so those come from the cache first.
   Bump CACHE when you change the lists below. */
var CACHE = "meetdoconnect-v2";
var PAGES = ["/", "/evenings", "/activities", "/how-it-works", "/safety", "/membership", "/rules", "/terms", "/privacy", "/offline"];
var FILES = ["/manifest.webmanifest", "/icons/icon.svg", "/icons/icon-192.png", "/icons/icon-512.png"];

function save(cache, url) {
  return cache.add(url).catch(function () { /* skip a file that fails */ });
}

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return Promise.all(PAGES.concat(FILES).map(function (url) { return save(cache, url); }))
        .then(function () {
          return Promise.all(PAGES.map(function (url) {
            return cache.match(url).then(function (res) { return res ? res.text() : ""; });
          }));
        })
        .then(function (html) {
          // Also save the CSS, JS and fonts those pages load, so they still look right offline.
          var assets = new Set(html.join("").match(/\/_next\/static\/[^"'\s\\)]+/g));
          return Promise.all(Array.from(assets, function (url) { return save(cache, url); }));
        });
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

// A copy saved through a redirect (/offline.html -> /offline) can't answer a page load,
// so rebuild it as a plain response.
function unredirect(res) {
  if (!res || !res.redirected) return res;
  return res.blob().then(function (body) {
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
  });
}

function put(req, res) {
  if (res && res.ok) {
    var copy = res.clone();
    caches.open(CACHE).then(function (c) { c.put(req, copy); });
  }
  return res;
}

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // leave other sites alone
  // In-app links fetch page data with ?_rsc=. Leave it to the network: when offline the
  // request fails, Next.js falls back to a normal page load, and that is answered below.
  if (url.searchParams.has("_rsc") || req.headers.get("RSC")) return;

  if (url.pathname.indexOf("/_next/static/") === 0) {
    event.respondWith(caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) { return put(req, res); });
    }));
    return;
  }

  event.respondWith(
    fetch(req).then(function (res) { return put(req, res); }).catch(function () {
      return caches.match(req)
        .then(function (hit) { return hit || (req.mode === "navigate" ? caches.match("/offline") : undefined); })
        .then(unredirect)
        .then(function (res) { return res || Response.error(); });
    })
  );
});
