// Web Push handlers, loaded into the generated service worker (pwa.config.ts).
self.addEventListener("push", (event) => {
  let message = { title: "yumi", body: "", url: "/" };
  try {
    message = { ...message, ...event.data.json() };
  } catch {
    // A push without a readable payload still shows a generic notification.
  }
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: "yumi-shopping-trip",
      data: { url: message.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? "/", self.location.origin)
    .href;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => {
        const open = windows.find((client) => "focus" in client);
        if (open) return open.navigate(url).then((client) => client?.focus());
        return self.clients.openWindow(url);
      }),
  );
});
