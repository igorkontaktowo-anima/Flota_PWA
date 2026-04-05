// ================================================================
//  sw.js — Service Worker: cache, Background Sync, FCM push
// ================================================================

importScripts('https://www.gstatic.com/firebasejs/12.11.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.11.0/firebase-messaging-compat.js');

const CACHE_NAME = 'flota-pwa-v1';
const CACHE_URLS = [
  './',
  './index.html',
  './app.html',
  './manifest.json',
  './js/auth.js',
  './js/photos.js',
  './js/notes.js',
  './js/resources.js',
  './js/push.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// ── Install — zakeszuj pliki aplikacji ───────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate — usuń stare cache ──────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch — cache-first dla plików aplikacji, network-first dla API
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Żądania do GAS — zawsze sieć (nigdy nie cachujemy API)
  if (url.includes('script.google.com')) return;

  // Pliki aplikacji — cache first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cachuj tylko poprawne odpowiedzi GET
        if (event.request.method === 'GET' && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline i nie ma w cache — zwróć app.html jako fallback
        if (event.request.mode === 'navigate') {
          return caches.match('./app.html');
        }
      });
    })
  );
});

// ── Background Sync — kolejka zdjęć offline ──────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'photo-queue') {
    event.waitUntil(syncPhotoQueue());
  }
});

async function syncPhotoQueue() {
  // Otwieramy IndexedDB bezpośrednio z SW
  const db = await openSwDB();
  const jobs = await getAllFromStore(db, 'photo_queue');

  for (const job of jobs) {
    try {
      const res = await fetch(job.gasUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          action:  'uploadPhotos',
          token:   job.token,
          vehicle: job.vehicle,
          photos:  job.photos
        })
      });
      const data = await res.json();
      if (data.status === 'ok') {
        await deleteFromStore(db, 'photo_queue', job.id);
      }
    } catch (_) {
      // Zostaw w kolejce
    }
  }
}

// ── IndexedDB helpers dla SW ─────────────────────────────────────
function openSwDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('flota_pwa', 1);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('photo_queue')) {
        db.createObjectStore('photo_queue', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('session')) {
        db.createObjectStore('session', { keyPath: 'key' });
      }
    };
  });
}

function getAllFromStore(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function deleteFromStore(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

// ── Firebase Messaging — push w tle ──────────────────────────────
firebase.initializeApp({
  apiKey:            'AIzaSyCFHJJ21Jw6b8T9IG_JW2n95au-XezIb-g',
  authDomain:        'flotaapp-cd14b.firebaseapp.com',
  projectId:         'flotaapp-cd14b',
  storageBucket:     'flotaapp-cd14b.firebasestorage.app',
  messagingSenderId: '667633008924',
  appId:             '1:667633008924:web:3cae1af2f74e12adf07ad9'
});

const firebaseMessaging = firebase.messaging();

// Wyświetl powiadomienie gdy aplikacja jest w tle
firebaseMessaging.onBackgroundMessage(payload => {
  const title   = payload.notification?.title || 'Flota';
  const body    = payload.notification?.body  || '';
  const options = {
    body,
    icon:  './icons/icon-192.png',
    badge: './icons/icon-192.png',
    vibrate: [200, 100, 200]
  };
  return self.registration.showNotification(title, options);
});