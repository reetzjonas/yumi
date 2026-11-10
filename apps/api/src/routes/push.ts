import { pushSubscription, shoppingList } from "@yumi/db/schema";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono/validator";
import { z } from "zod";
import { type HouseholdEnv, requireAuth, requireHousehold } from "../context";
import { db } from "../db";
import { notifyHousehold, pushPublicKey } from "../push";

const subscriptionSchema = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
  locale: z.enum(["de", "en"]).default("de"),
});

export const push = new Hono<HouseholdEnv>()
  .use(requireAuth)
  /** `publicKey` is null when the server has no VAPID keys: push is off. */
  .get("/config", (c) => c.json({ publicKey: pushPublicKey }))
  .put(
    "/subscription",
    validator("json", (value) => subscriptionSchema.parse(value)),
    async (c) => {
      const input = c.req.valid("json");
      const values = {
        userId: c.get("user").id,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        locale: input.locale,
      };
      // A device belongs to whoever subscribed last on it.
      await db
        .insert(pushSubscription)
        .values(values)
        .onConflictDoUpdate({ target: pushSubscription.endpoint, set: values });
      return c.body(null, 204);
    },
  )
  .delete(
    "/subscription",
    validator("json", (value) =>
      z.object({ endpoint: z.string().max(2000) }).parse(value),
    ),
    async (c) => {
      await db
        .delete(pushSubscription)
        .where(
          and(
            eq(pushSubscription.endpoint, c.req.valid("json").endpoint),
            eq(pushSubscription.userId, c.get("user").id),
          ),
        );
      return c.body(null, 204);
    },
  )
  .post(
    "/shopping-trip",
    requireHousehold,
    validator("json", (value) => z.object({ listId: z.uuid() }).parse(value)),
    async (c) => {
      const householdId = c.get("householdId");
      const [list] = await db
        .select({ name: shoppingList.name })
        .from(shoppingList)
        .where(
          and(
            eq(shoppingList.id, c.req.valid("json").listId),
            eq(shoppingList.householdId, householdId),
          ),
        )
        .limit(1);
      if (!list) throw new HTTPException(404, { message: "not_found" });
      const name = c.get("user").name;
      const sent = await notifyHousehold(
        householdId,
        c.get("user").id,
        (locale) =>
          locale === "de"
            ? {
                title: `${name} geht einkaufen`,
                body: `Fehlt noch etwas auf „${list.name}“?`,
                url: "/list?add=1",
              }
            : {
                title: `${name} is going shopping`,
                body: `Anything missing on "${list.name}"?`,
                url: "/list?add=1",
              },
      );
      return c.json({ sent });
    },
  );
