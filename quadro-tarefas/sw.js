/**
 * Service Worker - Cache inteligente e Offline support
 * Cache Strategy: Network-first para API, Cache-first para assets
 */

const CACHE_NAME = 'cofrinho-v2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './tela1.html',
  './tela2.html',
  './cofrinho-data.js',
  './supabase-client.js',
  './app-shell.js',
  './manifest.json',
];

// ⚡ Install: pré-cachear assets críticos
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching assets...');
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('[SW] Alguns assets não puderam ser cacheados:', err);
        // Continua mesmo se alguns assets falhem
      });
    })
  );
  self.skipWaiting();
});

// 🧹 Activate: limpar caches antigos
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deletando cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 🔄 Fetch: estratégia inteligente de cache
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // ❌ Ignorar requisições que não são GET
  if (event.request.method !== 'GET') {
    return;
  }

  // 🌐 Para requisições Supabase: Network-first (dados frescos, fallback cache)
  if (url.hostname.includes('supabase')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cachear resposta bem-sucedida
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback para cache se offline
          return caches.match(event.request).then((cached) => {
            if (cached) {
              console.log('[SW] Supabase offline, usando cache:', url.pathname);
              return cached;
            }
            // Se não há cache e offline, retornar erro
            return new Response(
              JSON.stringify({ error: 'Offline - dados não disponíveis' }),
              { status: 503, headers: { 'Content-Type': 'application/json' } }
            );
          });
        })
    );
    return;
  }

  // 📦 Para CDNs (Tailwind, Material Symbols, Fonts): Cache-first
  if (url.hostname.includes('cdn.') || url.hostname.includes('fonts.')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) {
          return cached;
        }
        return fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // 📄 Para assets locais (HTML, JS, CSS): Cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback gracioso
          console.warn('[SW] Falha ao buscar:', url.pathname);
          return new Response('Recurso não disponível', { status: 404 });
        });
    })
  );
});

// 📡 Message handler para force-update
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('[SW] Service Worker registrado com sucesso!');
