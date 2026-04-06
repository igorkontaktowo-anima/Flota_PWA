/*
  Flota PWA — Service Worker v4

  Zmiana kluczowa: start_url to teraz app.html (nie index.html).
  app.html musi być dostępne offline — ale nie może być cache'owane
  agresywnie, bo zawiera logikę tokenu.

  Strategia:
  - app.html    → Network-first (świeża wersja gdy online, cache gdy offline)
  - index.html  → Network-first (bramka instalacyjna)
  - reszta      → Cache-first (ikony, zasoby statyczne)
*/

var CACHE = 'flota-v4';

var PRECACHE = [
  './app.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      return Promise.allSettled(
        PRECACHE.map(function(url){
          return c.add(url).catch(function(err){
            console.warn('[SW] precache skip:', url, err);
          });
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(
        keys.filter(function(k){ return k !== CACHE; })
            .map(function(k){ return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;
  if(req.url.includes('script.google.com')) return;
  if(req.url.includes('fonts.googleapis.com')) return;
  if(req.url.includes('fonts.gstatic.com')) return;
  if(!req.url.startsWith('http')) return;

  var url = new URL(req.url);
  var path = url.pathname;

  // app.html i index.html — Network-first
  if(path.endsWith('app.html') || path.endsWith('index.html') || path.endsWith('/')){
    e.respondWith(
      fetch(req).then(function(resp){
        if(resp && resp.status === 200){
          var clone = resp.clone();
          // Cache bez parametrów URL (klucz bazowy)
          var key = new Request(url.origin + path);
          caches.open(CACHE).then(function(c){ c.put(key, clone); });
        }
        return resp;
      }).catch(function(){
        // Offline — serwuj z cache
        return caches.match(url.origin + path)
          .then(function(c){ return c || caches.match('./app.html'); });
      })
    );
    return;
  }

  // Zasoby statyczne — Cache-first
  e.respondWith(
    caches.match(req).then(function(cached){
      if(cached) return cached;
      return fetch(req).then(function(resp){
        if(resp && resp.status === 200 && resp.type === 'basic'){
          caches.open(CACHE).then(function(c){ c.put(req, resp.clone()); });
        }
        return resp;
      }).catch(function(){
        return caches.match('./app.html');
      });
    })
  );
});
