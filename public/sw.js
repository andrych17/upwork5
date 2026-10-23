/* MeetDoConnect service worker: keeps the shell available offline.
   Pages load from the network first so updates show up right away,
   and fall back to the saved copy when there is no connection.
   Bump CACHE when you change the file list. */
var CACHE = "meetdoconnect-v1";
var CORE = [
  "./",
  "index.html",
  "rules.html",
  "terms.html",
  "privacy.html",
  "offline.html",
  "assets/pages.css",
  "manifest.webmanifest",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return Promise.all(CORE.map(function (url) {
        return cache.add(url).catch(function () { /* skip a file that fails */ });
      }));
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

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // leave fonts and other sites alone

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        // Cloudflare Pages serves /rules.html as /rules, so also try the .html copy saved at install.
        var page = url.pathname.replace(/\/$/, "/index") + ".html";
        return caches.match(req)
          .then(function (hit) { return hit || caches.match(page); })
          .then(function (hit) { return hit || caches.match("offline.html"); })
          .then(unredirect);
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
