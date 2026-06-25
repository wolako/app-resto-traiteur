// src/sw-push.js
self.addEventListener('push', (event) => {
  console.log('[SW] Push reçu');

  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'RestoTraiteur', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'RestoTraiteur';
  const options = {
    body: data.body || 'Nouvelle notification',
    tag: 'restotraiteur-notif',
    data: { url: data.url || '/driver/dashboard' }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
      .then(() => console.log('[SW] ✅ showNotification appelé avec succès'))
      .catch(err => console.error('[SW] ❌ showNotification ERREUR:', err))
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Clic sur notification');
  event.notification.close();

  const url = event.notification.data?.url || '/driver/dashboard';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si un onglet est déjà ouvert → le focus
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      // Sinon → ouvrir un nouvel onglet
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});