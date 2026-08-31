// sw.js — NextPhase Ventures Service Worker v3
// Handles PWA caching + VAPID web push notifications

const CACHE_NAME = "npv-v3";
const STATIC = ["./", "./index.html", "./manifest.json", "./icon-192.png"];
const PUSH_SERVER = "npv-push-server.weblinallc.workers.dev"; // ← update after deploy

// ── Install ───────────────────────────────────────────────────────────────
self.addEventListener("install", ev => {
  ev.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC))
  );
  self.skipWaiting();
});

// ── Activate ──────────────────────────────────────────────────────────────
self.addEventListener("activate", ev => {
  ev.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch ─────────────────────────────────────────────────────────────────
self.addEventListener("fetch", ev => {
  if (ev.request.method !== "GET") return;
  ev.respondWith(
    fetch(ev.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(ev.request, clone));
        return res;
      })
      .catch(() => caches.match(ev.request))
  );
});

// ── Push — fires when VAPID push arrives (even when app is closed) ─────────
self.addEventListener("push", ev => {
  let data = {
    title: "📬 NPV Deal Alert",
    body: "A new deal has been analyzed.",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    tag: "npv-deal",
    data: { url: "./", recommendation: null, address: null }
  };

  try {
    const parsed = ev.data.json();
    data = { ...data, ...parsed };
  } catch (e) {
    try { data.body = ev.data.text(); } catch(e2) {}
  }

  // Color the notification by recommendation
  const rec = data.data && data.data.recommendation;
  const emoji = rec === "Pursue" ? "🟢" : rec === "Negotiate" ? "🟡" : rec === "Pass" ? "🔴" : "📬";
  if (rec) data.title = emoji + " " + rec + ": " + (data.data.address || "New Deal");

  ev.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    data.icon,
      badge:   data.badge,
      tag:     data.tag,
      data:    data.data,
      vibrate: [200, 100, 200],
      actions: [
        { action: "open",    title: "View Deal" },
        { action: "dismiss", title: "Dismiss"   },
      ]
    })
  );
});

// ── Notification click ────────────────────────────────────────────────────
self.addEventListener("notificationclick", ev => {
  ev.notification.close();
  if (ev.action === "dismiss") return;

  const targetUrl = (ev.notification.data && ev.notification.data.url) || "./";

  ev.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      // Focus existing window if open
      for (const client of list) {
        if ("focus" in client) {
          client.postMessage({ type: "NPV_PUSH_CLICK", url: targetUrl });
          return client.focus();
        }
      }
      // Open new window
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

// ── Message from app — navigate to leads tab after notification click ──────
self.addEventListener("message", ev => {
  if (ev.data && ev.data.type === "NPV_NAVIGATE") {
    clients.matchAll({ type: "window" }).then(list => {
      list.forEach(client => client.postMessage(ev.data));
    });
  }
});
