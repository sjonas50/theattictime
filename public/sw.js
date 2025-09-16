const CACHE_NAME = 'attic-time-v1';
const urlsToCache = [
  '/',
  '/manifest.json',
  '/favicon.ico'
];

// Install event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

// Fetch event with offline support
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        return response || fetch(event.request);
      }
    )
  );
});

// Background sync for offline time entries
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync-time-entries') {
    event.waitUntil(syncTimeEntries());
  }
});

// Push notification handling
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'Time to log your hours!',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    actions: [
      {
        action: 'open',
        title: 'Open App'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('Attic Time Tracker', options)
  );
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

async function syncTimeEntries() {
  try {
    // Get offline entries from IndexedDB and sync to server
    const entries = await getOfflineEntries();
    for (const entry of entries) {
      await syncSingleEntry(entry);
    }
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}

async function getOfflineEntries() {
  // Implementation would use IndexedDB to get offline entries
  return [];
}

async function syncSingleEntry(entry) {
  // Implementation would POST to your API
  console.log('Syncing entry:', entry);
}