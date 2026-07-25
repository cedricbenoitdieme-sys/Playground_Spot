// Service Worker minimal PWA pour PlaygroundSpot
const CACHE_NAME = 'playgroundspot-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass-through pour préserver les requêtes Supabase / API en temps réel
});
