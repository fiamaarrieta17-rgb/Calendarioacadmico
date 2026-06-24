// ── SERVICE WORKER — Agenda Universitaria ─────────────────────────────────────
// Maneja push notifications y cache básico

const CACHE_NAME = 'agenda-v1';

// ── INSTALL ───────────────────────────────────────────────────────────────────
self.addEventListener('install', e => {
  self.skipWaiting();
});

// ── ACTIVATE ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

// ── PUSH ──────────────────────────────────────────────────────────────────────
self.addEventListener('push', e => {
  let data = { title: 'Agenda Universitaria', body: 'Tenés eventos próximos.', icon: '/icon-192.png', badge: '/badge-96.png', tag: 'agenda-evento', data: {} };
  if (e.data) {
    try { Object.assign(data, e.data.json()); } catch(err) { data.body = e.data.text(); }
  }
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    data.icon  || '/icon-192.png',
      badge:   data.badge || '/badge-96.png',
      tag:     data.tag   || 'agenda-evento',
      data:    data.data  || {},
      vibrate: [200, 100, 200],
      requireInteraction: false,
    })
  );
});

// ── NOTIFICATION CLICK ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

// ── SCHEDULED CHECK (cada hora vía sync periódico si el browser lo permite) ───
self.addEventListener('periodicsync', e => {
  if (e.tag === 'agenda-check') {
    e.waitUntil(checkProximosEventos());
  }
});

async function checkProximosEventos() {
  // Leer eventos desde el cache/IndexedDB que la app escribe
  // (La app guarda una copia en IDBKeyVal bajo 'push_eventos')
  const db = await openDB();
  const eventos = await dbGet(db, 'push_eventos') || [];
  const tareas  = await dbGet(db, 'push_tareas')  || {};
  const config  = await dbGet(db, 'push_config')  || { dias: [1, 3, 7] };

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const alerts = [];

  // Eventos
  Object.entries(eventos).forEach(([key, evts]) => {
    const fecha = new Date(key.replace(/(\d{4})-(\d{2})-(\d{2})/, '$1-$2-$3'));
    fecha.setHours(0, 0, 0, 0);
    const diff = Math.round((fecha - hoy) / 86400000);
    if (config.dias.includes(diff) && evts.length) {
      evts.forEach(ev => {
        const diasLabel = diff === 1 ? 'mañana' : diff === 0 ? 'hoy' : `en ${diff} días`;
        alerts.push({ title: `📅 ${ev.name}`, body: `${diasLabel.charAt(0).toUpperCase() + diasLabel.slice(1)} — ${fmtFecha(fecha)}`, tag: `evt-${key}-${ev.name}` });
      });
    }
  });

  // Tareas pendientes
  Object.entries(tareas).forEach(([key, tlist]) => {
    const pendientes = tlist.filter(t => !t.done);
    const fecha = new Date(key.replace(/(\d{4})-(\d{2})-(\d{2})/, '$1-$2-$3'));
    fecha.setHours(0, 0, 0, 0);
    const diff = Math.round((fecha - hoy) / 86400000);
    if (config.dias.includes(diff) && pendientes.length) {
      alerts.push({ title: `✅ Tarea pendiente`, body: `${pendientes.length} tarea${pendientes.length > 1 ? 's' : ''} para ${fmtFecha(fecha)}`, tag: `tarea-${key}` });
    }
  });

  for (const a of alerts) {
    await self.registration.showNotification(a.title, {
      body: a.body, tag: a.tag, icon: '/icon-192.png', badge: '/badge-96.png',
      vibrate: [200, 100, 200], data: { url: '/' }
    });
  }
}

// ── MINI IndexedDB helpers ────────────────────────────────────────────────────
function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open('agenda-sw', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('kv');
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
  });
}
function dbGet(db, key) {
  return new Promise((res, rej) => {
    const tx  = db.transaction('kv', 'readonly');
    const req = tx.objectStore('kv').get(key);
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
  });
}

function fmtFecha(d) {
  const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}
