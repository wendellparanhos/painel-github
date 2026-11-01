/**
 * Service Worker — Painel GitHub (Fase 6 — PWA & Offline).
 *
 * Estratégia de Caching:
 *   1. Shell estático da aplicação (HTML, CSS, JS, manifest):
 *      Estratégia Stale-While-Revalidate com atualização em background.
 *   2. Chamadas à GitHub API (api.github.com):
 *      Estratégia Network-First / Network-Only. NUNCA usa Cache-First na API do GitHub
 *      e NUNCA armazena respostas autenticadas sensíveis indiscriminadamente no CacheStorage,
 *      delegando a persistência limpa ao próprio storage local do aplicativo.
 *   3. Atualização de versão com limpeza de caches antigos no 'activate' e
 *      suporte a skipWaiting() controlado via mensagem para upgrade sem perda de dados.
 */

const CACHE_NAME = 'panel-cache-v6.0';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/tokens.css',
  './css/base.css',
  './css/components.css',
  './css/layout.css',
  './css/views.css',
  './css/print.css',
  './js/app.js',
  './js/router.js',
  './js/store/store.js',
  './js/store/storage.js',
  './js/services/github.js',
  './js/services/ai.js',
  './js/services/portfolio.js',
  './js/services/share-card.js',
  './js/services/sync.js',
  './js/services/feedback.js',
  './js/services/notifications.js',
  './js/components/nav.js',
  './js/components/charts.js',
  './js/components/mascot.js',
  './js/components/palette.js',
  './js/components/modal.js',
  './js/components/toast.js',
  './js/components/share-modals.js',
  './js/views/home.js',
  './js/views/project.js',
  './js/views/kanban.js',
  './js/views/focus.js',
  './js/views/achievements.js',
  './js/views/reports.js',
  './js/views/galaxy.js',
  './js/views/graph.js',
  './js/views/bubbles.js',
  './js/views/inbox.js',
  './js/views/settings.js',
  './js/fx/effects.js',
  './js/utils/domain.js',
  './js/utils/cover.js',
  './js/utils/markdown.js',
  './js/utils/shortcuts.js',
  './js/utils/formatters.js',
  './js/utils/dom.js',
  './js/utils/uuid.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Adiciona ativos de forma tolerante (não quebra a instalação se uma rota opcional falhar)
      return Promise.allSettled(
        PRECACHE_ASSETS.map(url => cache.add(url).catch(err => console.warn('[SW] Pré-cache ignorado para:', url, err)))
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Limpando cache antigo:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. Ignora requisições não-GET
  if (req.method !== 'GET') return;

  // 2. Requisições para a API do GitHub: NUNCA Cache-First
  // Executa Network-First e falha suavemente sem mascarar dados
  if (url.hostname.includes('api.github.com')) {
    event.respondWith(
      fetch(req).catch(() => {
        return new Response(JSON.stringify({ error: 'offline', message: 'Sem conexão de rede no momento.' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // 3. Fontes do Google e CDNs externas: Cache First com fallback de rede
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        return cached || fetch(req).then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone));
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  // 4. Ativos locais da aplicação: Stale-While-Revalidate
  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      const fetchPromise = fetch(req).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, responseToCache);
          });
        }
        return networkResponse;
      }).catch((err) => {
        // Se a rede falhar e tivermos resposta em cache, retorna ela
        if (cachedResponse) return cachedResponse;
        // Fallback de navegação para index.html offline
        if (req.mode === 'navigate') {
          return caches.match('./index.html');
        }
        throw err;
      });

      return cachedResponse || fetchPromise;
    })
  );
});

// Suporte para mensagem de skipWaiting disparada pela interface
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
