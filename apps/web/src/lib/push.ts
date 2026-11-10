import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ensureOk } from "@/lib/api-error";
import { getLocale } from "@/lib/i18n";

const supported = () =>
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

/** Server key for Web Push, or null when the server or this browser cannot push. */
export function usePushKey() {
  return useQuery({
    queryKey: ["push", "config"],
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async () => {
      if (!supported()) return null;
      return (await (await ensureOk(await api.push.config.$get())).json())
        .publicKey;
    },
  });
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

export async function pushEnabled() {
  if (!supported() || Notification.permission !== "granted") return false;
  return Boolean(await (await registration())?.pushManager.getSubscription());
}

/** Asks for permission and registers this device. Returns false when declined. */
export async function enablePush(publicKey: string) {
  if ((await Notification.requestPermission()) !== "granted") return false;
  const worker = await registration();
  if (!worker) return false;
  const subscription =
    (await worker.pushManager.getSubscription()) ??
    (await worker.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: publicKey,
    }));
  const json = subscription.toJSON();
  await ensureOk(
    await api.push.subscription.$put({
      json: {
        endpoint: subscription.endpoint,
        keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
        locale: getLocale(),
      },
    }),
  );
  return true;
}

export async function disablePush() {
  const subscription = await (
    await registration()
  )?.pushManager.getSubscription();
  if (!subscription) return;
  await ensureOk(
    await api.push.subscription.$delete({
      json: { endpoint: subscription.endpoint },
    }),
  );
  await subscription.unsubscribe();
}

export async function announceShoppingTrip(listId: string) {
  return (
    await ensureOk(await api.push["shopping-trip"].$post({ json: { listId } }))
  ).json();
}
