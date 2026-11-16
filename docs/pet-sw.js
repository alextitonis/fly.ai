/* Fly Pet on phones (docs/pet-mobile.html, 2026-11-16): the service worker that shows the push notifications the mine
   server sends (mine/src/push.ts). Registered with scope /pet-mobile; every push shows a notification (browsers require
   it), a tap opens or focuses the page the push points at. Nothing is cached: the page always loads fresh. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let n = {};
  try { n = e.data ? e.data.json() : {}; } catch { n = { title: "Fly Pet", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(n.title || "Fly Pet", {
    body: n.body || "",
    tag: n.tag || undefined,
    renotify: !!n.tag,
    icon: "/assets/pet/icon-192.png",
    badge: "/assets/pet/icon-192.png",
    data: { url: n.url || "/pet-mobile" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/pet-mobile", self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (w.url === url && "focus" in w) return w.focus();
    }
    for (const w of wins) {
      if ("navigate" in w && "focus" in w) { await w.navigate(url); return w.focus(); }
    }
    return self.clients.openWindow(url);
  })());
});
