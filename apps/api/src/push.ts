import { member, pushSubscription } from "@yumi/db/schema";
import { and, eq, inArray, ne } from "drizzle-orm";
import webpush from "web-push";
import { db } from "./db";
import { env } from "./env";

export type PushMessage = { title: string; body: string; url: string };
type Target = { endpoint: string; p256dh: string; auth: string };
/** Delivers one message; "gone" means the subscription no longer exists. */
export type PushSender = (
  target: Target,
  message: PushMessage,
) => Promise<"sent" | "gone" | "failed">;

export const pushPublicKey =
  env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY ? env.VAPID_PUBLIC_KEY : null;

const webPushSender: PushSender = async (target, message) => {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return "failed";
  try {
    await webpush.sendNotification(
      {
        endpoint: target.endpoint,
        keys: { p256dh: target.p256dh, auth: target.auth },
      },
      JSON.stringify(message),
      {
        TTL: 60 * 60,
        vapidDetails: {
          subject: env.VAPID_SUBJECT ?? env.BETTER_AUTH_URL,
          publicKey: env.VAPID_PUBLIC_KEY,
          privateKey: env.VAPID_PRIVATE_KEY,
        },
      },
    );
    return "sent";
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    return status === 404 || status === 410 ? "gone" : "failed";
  }
};

/** Swappable in tests; production sends through the push services. */
export const pushDelivery: { send: PushSender } = { send: webPushSender };

/**
 * Notifies every device of the other household members. The message is built
 * per device so each one gets its own language. Dead subscriptions are removed.
 */
export async function notifyHousehold(
  householdId: string,
  exceptUserId: string,
  message: (locale: "de" | "en") => PushMessage,
) {
  const targets = await db
    .select({
      id: pushSubscription.id,
      endpoint: pushSubscription.endpoint,
      p256dh: pushSubscription.p256dh,
      auth: pushSubscription.auth,
      locale: pushSubscription.locale,
    })
    .from(pushSubscription)
    .innerJoin(member, eq(member.userId, pushSubscription.userId))
    .where(
      and(
        eq(member.organizationId, householdId),
        ne(pushSubscription.userId, exceptUserId),
      ),
    );
  const results = await Promise.all(
    targets.map(async (target) => ({
      id: target.id,
      result: await pushDelivery.send(
        target,
        message(target.locale === "en" ? "en" : "de"),
      ),
    })),
  );
  const gone = results.filter((r) => r.result === "gone").map((r) => r.id);
  if (gone.length)
    await db.delete(pushSubscription).where(inArray(pushSubscription.id, gone));
  return results.filter((r) => r.result === "sent").length;
}
