// ================================================================
//  auth.js — sesja, tokeny, IndexedDB
// ================================================================

// Uzupełnisz ten URL po wdrożeniu Apps Script:
export const GAS_URL = 'https://script.google.com/macros/s/AKfycbz3A9LWbqrjO7KlYMoHNivf6Hbpe4zLVjWfWu8Iizcl_gmlILqt6-cESOTpK09gwSLl/exec';


const DB_NAME    = 'flota_pwa';
const DB_VERSION = 1;

// ── Otwieranie IndexedDB ─────────────────────────────────────────
export function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('session')) {
        db.createObjectStore('session', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('photo_queue')) {
        db.createObjectStore('photo_queue', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

// ── Zapis do IndexedDB ───────────────────────────────────────────
export async function dbPut(storeName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).put(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

// ── Odczyt z IndexedDB ───────────────────────────────────────────
export async function dbGet(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

// ── Resolve session ──────────────────────────────────────────────
// Kolejność: URL param ?t=TOKEN → IndexedDB cache
export async function resolveSession() {
  // 1. Token z URL
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get('t');

  if (urlToken) {
    // Zapisz w IndexedDB żeby działało bez URL następnym razem
    await dbPut('session', { key: 'token', token: urlToken });
    return { token: urlToken };
  }

  // 2. Token z IndexedDB (powrót bez URL)
  const cached = await dbGet('session', 'token');
  if (cached && cached.token) return { token: cached.token };

  // 3. Brak tokenu
  return null;
}

// ── POST do GAS ──────────────────────────────────────────────────
export async function gasPost(payload) {
  const res = await fetch(GAS_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (data.status === 'error') throw new Error(data.message);
  return data;
}