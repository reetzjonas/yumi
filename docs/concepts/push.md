# Push notifications

One use so far: a shopper tells the household "I am going shopping" and the other members get a
notification that opens the list with the quick-add field focused.

- **Off by default.** The server needs a VAPID key pair (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  see `docs/deployment.md`). Without it `GET /api/push/config` returns `publicKey: null` and the web
  app shows neither the settings switch nor the announce button.
- **Per device.** Settings -> Benachrichtigungen asks for the browser permission and stores the
  subscription (`push_subscription`: user, endpoint, keys, UI language). A device belongs to whoever
  subscribed last on it. On iOS, push only works in the installed app.
- **Sending.** `POST /api/push/shopping-trip { listId }` notifies all devices of the _other_
  members of the active household (`apps/api/src/push.ts`, library `web-push`). The text is built
  per device in its stored language. Subscriptions the push service reports as gone (404/410) are
  deleted.
- **Receiving.** `apps/web/public/push-sw.js` is imported into the generated service worker
  (`importScripts` in `pwa.config.ts`); it shows the notification and focuses or opens the app on
  click.
- **Tests** swap `pushDelivery.send`; no test talks to a real push service.
