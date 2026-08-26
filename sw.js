"use strict";

const VERSION = "4.4.5";
const CACHE = `multi-delivery-v${VERSION}`;
const DYNAMIC_CACHE = `multi-delivery-dynamic-v${VERSION}`;
const SHELL = [
  "./",
  "./index.html",
  "./offline.html",
  "./html/suporte.html",
  "./manifest.webmanifest",
  "./assets/favicon.svg",
  "./assets/produto-padrao.svg",
  "./assets/logo-restaurante.svg",
  "./assets/banner-padrao.svg",
  "./assets/banner1.svg",
  "./css/core/style.css?v=4.2.0",
  "./css/pages/home-4.2.1.css?v=4.2.1.2",
  "./css/core/paginas.css?v=4.2.0",
  "./css/core/accessibility.css?v=4.2.0",
  "./css/core/enhancements.css?v=4.2.8",
  "./css/modules/mobile-pwa-4.2.6.css?v=4.2.6",
  "./css/pages/suporte.css?v=4.2.0",
  "./css/modules/restaurante-4.2.2.css?v=4.2.2",
  "./css/modules/carrinho-4.2.5.css?v=4.2.6",
  "./css/modules/checkout-4.2.3.css?v=4.2.4",
  "./css/modules/operacao-restaurante-4.2.7.css?v=4.2.7",
  "./js/core/app-utils.js?v=4.2.0",
  "./js/core/config.js?v=4.4.3",
  "./js/core/monitoring.js?v=4.2.0",
  "./js/core/notifications.js?v=4.4.3",
  "./js/core/favorites-sync.js?v=4.2.1",
  "./js/pages/home.js?v=4.2.1",
  "./js/core/cart-store.js?v=4.2.0",
  "./js/modules/carrinho-4.2.5.js?v=4.2.6",
  "./js/modules/checkout-4.2.3.js?v=4.2.4",
  "./js/modules/operacao-restaurante-4.2.7.js?v=4.2.7",
  "./js/pages/suporte.js?v=4.2.0",
  "./js/core/site-enhancements.js?v=4.4.5"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("multi-delivery-") && key !== CACHE && key !== DYNAMIC_CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

async function redePrimeiro(request, cacheName, fallback) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(request)) || (fallback ? caches.match(fallback) : Response.error());
  }
}

async function cachePrimeiro(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(DYNAMIC_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || !event.request.url.startsWith(self.location.origin)) return;
  if (event.request.mode === "navigate") {
    event.respondWith(redePrimeiro(event.request, CACHE, "./offline.html"));
    return;
  }
  const destination = event.request.destination;
  if (destination === "style" || destination === "script" || destination === "manifest") {
    event.respondWith(cachePrimeiro(event.request));
    return;
  }
  if (destination === "image" || destination === "font" || event.request.url.endsWith(".svg")) {
    event.respondWith(cachePrimeiro(event.request));
  }
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("push", (event) => {
  let payload = { title: "Multi Delivery", body: "Você tem uma nova atualização.", url: "./html/perfil.html", tipo: "atualizacao" };
  try { payload = { ...payload, ...event.data.json() }; } catch { /* Usa mensagem padrão. */ }
  const tag = payload.tag || undefined;
  const entrega = ["entrega_disponivel", "entrega_atribuida"].includes(payload.tipo);
  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: "./assets/favicon.svg",
    badge: "./assets/favicon.svg",
    tag,
    renotify: Boolean(tag),
    requireInteraction: entrega,
    vibrate: entrega ? [180, 100, 180] : [120],
    data: { url: payload.url, tipo: payload.tipo }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const recebido = String(event.notification.data?.url || "./html/perfil.html");
  const normalizado = /^(?:\.\/)?[\w-]+\.html(?:[?#]|$)/i.test(recebido)
    ? `./html/${recebido.replace(/^\.\//, "")}`
    : recebido;
  const destino = new URL(normalizado, self.registration.scope).href;
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (janelas) => {
    const exata = janelas.find((janela) => janela.url === destino);
    if (exata) return exata.focus();
    const aberta = janelas.find((janela) => new URL(janela.url).origin === new URL(destino).origin);
    if (aberta) {
      await aberta.navigate(destino);
      return aberta.focus();
    }
    return clients.openWindow(destino);
  }));
});
