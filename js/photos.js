// ================================================================
//  photos.js — kompresja Canvas + kolejka + Background Sync
// ================================================================

import { gasPost, dbPut, openDB } from './auth.js';

const MAX_SIZE    = 1400;  // px — dłuższy bok po kompresji
const JPEG_Q      = 0.82;  // jakość JPEG
const MAX_PHOTOS  = 20;

// ── Główna funkcja wywoływana z app.html ─────────────────────────
export async function queuePhotos({ token, vehicle, files, onProgress }) {
  if (!files || files.length === 0) throw new Error('Brak zdjęć');
  if (files.length > MAX_PHOTOS) throw new Error('Maksymalnie ' + MAX_PHOTOS + ' zdjęć');

  onProgress('Kompresuję zdjęcia…', 5);

  // 1. Kompresja — Canvas API
  const compressed = [];
  for (let i = 0; i < files.length; i++) {
    const b64 = await compressImage(files[i]);
    compressed.push(b64);
    const pct = 5 + Math.round(((i + 1) / files.length) * 50);
    onProgress(`Kompresuję ${i + 1}/${files.length}…`, pct);
  }

  onProgress('Wysyłam…', 60);

  // 2. Próba natychmiastowego wysłania
  if (navigator.onLine) {
    try {
      const result = await gasPost({
        action: 'uploadPhotos',
        token,
        vehicle,
        photos: compressed
      });
      onProgress('Zapisano ✅', 100);
      return result;
    } catch (err) {
      // Sieć dostępna ale błąd — nie kolejkuj, rzuć wyjątek
      throw new Error('Błąd wysyłania: ' + err.message);
    }
  }

  // 3. Offline — zapisz do kolejki IndexedDB + Background Sync
  onProgress('Offline — zapisuję do kolejki…', 80);
  await enqueue({ token, vehicle, photos: compressed });
  onProgress('Zapisano lokalnie — wyślemy gdy wróci sieć ✅', 100);
  return { queued: true };
}

// ── Kompresja pojedynczego zdjęcia ───────────────────────────────
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        // Oblicz nowy rozmiar
        let { width, height } = img;
        if (width > MAX_SIZE || height > MAX_SIZE) {
          if (width >= height) { height = Math.round(height * MAX_SIZE / width); width = MAX_SIZE; }
          else                 { width  = Math.round(width  * MAX_SIZE / height); height = MAX_SIZE; }
        }
        const canvas = document.createElement('canvas');
        canvas.width  = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        // Base64 bez prefixu data:...
        const dataUrl = canvas.toDataURL('image/jpeg', JPEG_Q);
        resolve(dataUrl.split(',')[1]);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Kolejka offline (IndexedDB) ──────────────────────────────────
async function enqueue(job) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('photo_queue', 'readwrite');
    const req = tx.objectStore('photo_queue').add({ ...job, ts: Date.now() });
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

// ── Przetwarza kolejkę — woła Service Worker Background Sync ─────
export async function processQueue() {
  const db = await openDB();
  const jobs = await new Promise((resolve, reject) => {
    const tx  = db.transaction('photo_queue', 'readonly');
    const req = tx.objectStore('photo_queue').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });

  for (const job of jobs) {
    try {
      await gasPost({ action: 'uploadPhotos', ...job });
      // Usuń z kolejki po sukcesie
      const tx2  = db.transaction('photo_queue', 'readwrite');
      tx2.objectStore('photo_queue').delete(job.id);
    } catch (_) {
      // Zostaw w kolejce, spróbujemy przy następnej synchronizacji
    }
  }
}