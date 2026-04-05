// ================================================================
//  push.js — FCM push notifications + polling fallback (iOS)
// ================================================================

import { gasPost, dbPut } from './auth.js';
import { initializeApp }  from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js';
import { getMessaging, getToken, onMessage }
  from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-messaging.js';

const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyCFHJJ21Jw6b8T9IG_JW2n95au-XezIb-g',
  authDomain:        'flotaapp-cd14b.firebaseapp.com',
  projectId:         'flotaapp-cd14b',
  storageBucket:     'flotaapp-cd14b.firebasestorage.app',
  messagingSenderId: '667633008924',
  appId:             '1:667633008924:web:3cae1af2f74e12adf07ad9'
};

const VAPID_PUBLIC_KEY = 'BFAfuMMpsTaVbFA9VevUFKexiLW7AM-B9JoaiucgDxKtEVg4i5piMra0ghEYu_mQtz3pKPrRxmV7cMpZl4Vb7uw';

const POLL_INTERVAL = 5 * 60 * 1000; // co 5 minut

let messaging = null;

// ── Inicjalizacja push ────────────────────────────────────────────
export async function initPush(token) {
  if (!('serviceWorker' in navigator)) return;

  try {
    const app       = initializeApp(FIREBASE_CONFIG);
    messaging       = getMessaging(app);

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('[Push] Brak zgody — dziala tylko polling');
      return;
    }

    const reg = await navigator.serviceWorker.ready;
    const fcmToken = await getToken(messaging, {
      vapidKey:          VAPID_PUBLIC_KEY,
      serviceWorkerRegistration: reg
    });

    if (!fcmToken) return;

    // Zapisz FCM token w GAS
    await gasPost({ action: 'registerPush', token, subscription: { fcmToken } });
    await dbPut('session', { key: 'push_registered', ts: Date.now() });
    console.log('[Push] Zarejestrowano ✅');

    // Komunikaty gdy aplikacja jest otwarta
    onMessage(messaging, payload => {
      const title = payload.notification?.title || 'Flota';
      const body  = payload.notification?.body  || '';
      renderMessages([{ date: 'teraz', text: title + (body ? ': ' + body : '') }]);
    });

  } catch (err) {
    console.warn('[Push] Blad rejestracji:', err.message);
  }
}

// ── Polling fallback (iOS < 16.4 lub brak zgody) ──────────────────
export function startPolling(token) {
  pollMessages(token);
  setInterval(() => pollMessages(token), POLL_INTERVAL);
}

async function pollMessages(token) {
  try {
    const data = await gasPost({ action: 'getMessages', token });
    if (!data.messages || data.messages.length === 0) return;
    renderMessages(data.messages);
  } catch (_) {
    // Offline — ignoruj
  }
}

function renderMessages(messages) {
  const box = document.getElementById('msg-box');
  if (!box) return;
  box.innerHTML = messages.map(m =>
    `<div class="msg-item">
       <span class="msg-date">${m.date}</span>${escHtml(m.text)}
     </div>`
  ).join('');
  box.style.display = 'block';
}

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}