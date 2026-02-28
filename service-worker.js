/**
 * service-worker.js
 * Responsável por tornar a aplicação PWA offline-first.
 * Intercepta requisições de rede e serve arquivos do cache local.
 */

// 1. Versionamento Explícito do Cache
const CACHE_NAME = 'biblioteca-v3';

// Lista de arquivos estáticos essenciais para o funcionamento offline
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css?v=3',
    './script.js?v=3',
    './db.js?v=3',
    './tests.js?v=3',
    './manifest.json?v=3'
];

/**
 * 2. Evento INSTALL
 * Disparado quando o Service Worker é registrado pela primeira vez (ou atualizado).
 * Aqui fazemos o pré-cache de todos os arquivos essenciais.
 */
self.addEventListener('install', (event) => {
    // Força a instalação imediata, sem esperar que outras abas fechem
    self.skipWaiting();

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Fazendo cache dos arquivos estáticos...');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .catch((error) => {
                console.error('[Service Worker] Falha ao fazer cache no install:', error);
            })
    );
});

/**
 * 3. Evento ACTIVATE
 * Disparado logo após o install.
 * Ideal para limpar caches de versões antigas (ex: remover 'biblioteca-v1' quando a atual for 'v2').
 */
self.addEventListener('activate', (event) => {
    // Força o SW a assumir o controle de todas as páginas abertas imediatamente
    event.waitUntil(self.clients.claim());

    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // Se o nome do cache encontrado for diferente da versão atual, exclua-o
                    if (cacheName !== CACHE_NAME) {
                        console.log(`[Service Worker] Removendo cache antigo: ${cacheName}`);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

/**
 * 4. Evento FETCH
 * Intercepta todas as requisições HTTP feitas pela página.
 * Estratégia: Cache First (Busca no cache primeiro, se não achar, vai para a rede).
 */
self.addEventListener('fetch', (event) => {
    // Ignora requisições que não sejam GET (ex: POST, PUT) ou requisições de extensões (chrome-extension://)
    if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
        return;
    }

    // O IndexedDB não passa pelo evento fetch do Service Worker, pois é uma API local do navegador.
    // Portanto, o SW não interfere nas operações de banco de dados.

    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                // Se o arquivo estiver no cache, retorna ele imediatamente (Offline)
                if (cachedResponse) {
                    return cachedResponse;
                }

                // Se não estiver no cache, tenta buscar na rede
                return fetch(event.request).then((networkResponse) => {
                    // Opcional: Adicionar arquivos novos ao cache dinamicamente
                    // (Não implementado aqui para manter o controle estrito sobre o que é cacheado)
                    return networkResponse;
                }).catch(() => {
                    // Fallback genérico caso a rede falhe e o arquivo não esteja no cache
                    console.warn('[Service Worker] Recurso não encontrado no cache e rede indisponível:', event.request.url);
                    // Se for uma navegação de página (HTML), poderíamos retornar uma página offline genérica aqui
                });
            })
    );
});
