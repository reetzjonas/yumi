import {
  ingredient,
  ingredientCategory,
  shoppingEvent,
  shoppingListItem,
  store,
} from "@yumi/db/schema";
import type { shoppingEventSchema } from "@yumi/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { z } from "zod";
import { visibleTo } from "./catalog";
import { db } from "./db";
import { publishListChange } from "./shopping-bus";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Event = z.output<typeof shoppingEventSchema>;
type ItemRefs = { ingredientId?: string | null; categoryId?: string | null };

/** Drops references the household may not use instead of failing, so an offline outbox never gets stuck. */
async function resolveRefs(tx: Tx, householdId: string, refs: ItemRefs) {
  const resolved: ItemRefs = {};
  let ingredientCategoryId: string | null = null;
  if (refs.ingredientId !== undefined) {
    const [row] = refs.ingredientId
      ? await tx
          .select({ id: ingredient.id, categoryId: ingredient.categoryId })
          .from(ingredient)
          .where(
            and(eq(ingredient.id, refs.ingredientId), visibleTo(householdId)),
          )
          .limit(1)
      : [];
    resolved.ingredientId = row?.id ?? null;
    ingredientCategoryId = row?.categoryId ?? null;
  }
  if (refs.categoryId) {
    const [row] = await tx
      .select({ id: ingredientCategory.id })
      .from(ingredientCategory)
      .where(eq(ingredientCategory.id, refs.categoryId))
      .limit(1);
    resolved.categoryId = row?.id ?? ingredientCategoryId;
  } else if (refs.categoryId === null || ingredientCategoryId) {
    resolved.categoryId = ingredientCategoryId;
  }
  return resolved;
}

async function applyEvent(
  tx: Tx,
  ctx: {
    listId: string;
    householdId: string;
    userId: string;
    storeIds: Set<string>;
  },
  event: Event,
) {
  const [logged] = await tx
    .insert(shoppingEvent)
    .values({
      id: event.id,
      listId: ctx.listId,
      itemId: event.itemId,
      type: event.type,
      payload: "payload" in event ? event.payload : null,
      userId: ctx.userId,
      storeId:
        event.storeId && ctx.storeIds.has(event.storeId) ? event.storeId : null,
      clientTs: new Date(event.clientTs),
    })
    .onConflictDoNothing()
    .returning({ id: shoppingEvent.id });
  if (!logged) return false;

  const ownItem = and(
    eq(shoppingListItem.id, event.itemId),
    eq(shoppingListItem.listId, ctx.listId),
  );
  switch (event.type) {
    case "item_added": {
      const refs = await resolveRefs(tx, ctx.householdId, event.payload);
      await tx
        .insert(shoppingListItem)
        .values({
          ...event.payload,
          ...refs,
          id: event.itemId,
          listId: ctx.listId,
        })
        .onConflictDoNothing();
      break;
    }
    case "item_updated": {
      const refs = await resolveRefs(tx, ctx.householdId, event.payload);
      const changes = { ...event.payload, ...refs };
      if (Object.keys(changes).length > 0) {
        await tx.update(shoppingListItem).set(changes).where(ownItem);
      }
      break;
    }
    case "item_checked":
    case "item_unchecked":
      await tx
        .update(shoppingListItem)
        .set({ checked: event.type === "item_checked" })
        .where(ownItem);
      break;
    case "item_removed":
      await tx.delete(shoppingListItem).where(ownItem);
      break;
  }
  return true;
}

/**
 * Applies list events in order, last writer wins. Already-seen event ids are skipped,
 * which makes outbox replays idempotent (ADR 0005). Returns the ids applied now.
 */
export async function applyShoppingEvents(
  ctx: { listId: string; householdId: string; userId: string },
  events: Event[],
) {
  const applied = await db.transaction((tx) =>
    applyShoppingEventsInTransaction(tx, ctx, events),
  );
  if (applied.length) await publishListChange(ctx.householdId, ctx.listId);
  return applied;
}

export async function applyShoppingEventsInTransaction(
  tx: Tx,
  ctx: { listId: string; householdId: string; userId: string },
  events: Event[],
) {
  const storeIdsInEvents = [
    ...new Set(events.flatMap((e) => (e.storeId ? [e.storeId] : []))),
  ];
  const stores = storeIdsInEvents.length
    ? await tx
        .select({ id: store.id })
        .from(store)
        .where(
          and(
            inArray(store.id, storeIdsInEvents),
            eq(store.householdId, ctx.householdId),
          ),
        )
    : [];
  const full = { ...ctx, storeIds: new Set(stores.map((s) => s.id)) };
  const ids: string[] = [];
  for (const event of events) {
    if (await applyEvent(tx, full, event)) ids.push(event.id);
  }
  return ids;
}
