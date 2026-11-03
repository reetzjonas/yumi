import { recurringItem, shoppingListItem } from "@yumi/db/schema";
import { advanceDue, shoppingEventSchema, unitSchema } from "@yumi/shared";
import { and, eq, lte, sql } from "drizzle-orm";
import { db } from "./db";
import { applyShoppingEvents } from "./shopping-events";

export const todayUtc = () => new Date().toISOString().slice(0, 10);

/**
 * Puts due recurring items on the list when it is opened. Each rule is claimed by
 * moving its due date forward first, so concurrent opens add it only once. A rule
 * whose previous item is still unchecked on the list is not added again.
 */
export async function applyDueRecurring(ctx: {
  listId: string;
  householdId: string;
  userId: string;
}) {
  const today = todayUtc();
  const due = await db
    .select()
    .from(recurringItem)
    .where(
      and(
        eq(recurringItem.listId, ctx.listId),
        eq(recurringItem.householdId, ctx.householdId),
        lte(recurringItem.nextDue, today),
      ),
    );
  for (const rule of due) {
    const [claimed] = await db
      .update(recurringItem)
      .set({ nextDue: advanceDue(rule.nextDue, rule.intervalWeeks, today) })
      .where(
        and(
          eq(recurringItem.id, rule.id),
          eq(recurringItem.nextDue, rule.nextDue),
        ),
      )
      .returning({ id: recurringItem.id });
    if (!claimed) continue;
    const source = { kind: "recurring" as const, id: rule.id };
    const [open] = await db
      .select({ id: shoppingListItem.id })
      .from(shoppingListItem)
      .where(
        and(
          eq(shoppingListItem.listId, ctx.listId),
          eq(shoppingListItem.checked, false),
          sql`${shoppingListItem.sources} @> ${JSON.stringify([source])}::jsonb`,
        ),
      )
      .limit(1);
    if (open) continue;
    await applyShoppingEvents(ctx, [
      shoppingEventSchema.parse({
        id: crypto.randomUUID(),
        itemId: crypto.randomUUID(),
        clientTs: new Date().toISOString(),
        type: "item_added",
        payload: {
          label: rule.label,
          ingredientId: rule.ingredientId,
          quantity: rule.quantity,
          unit: unitSchema.safeParse(rule.unit).data ?? null,
          categoryId: rule.categoryId,
          sources: [source],
        },
      }),
    ]);
  }
}
