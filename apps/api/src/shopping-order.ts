import { shoppingEvent, shoppingList } from "@yumi/db/schema";
import { learnShoppingOrder } from "@yumi/shared";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";

const observationSchema = z.object({
  ingredientId: z.uuid().nullable(),
  categoryId: z.uuid().nullable(),
});

export async function loadShoppingOrder(
  householdId: string,
  storeId: string,
  resetAt: Date | null,
) {
  const rows = await db
    .select({
      id: shoppingEvent.id,
      listId: shoppingEvent.listId,
      itemId: shoppingEvent.itemId,
      storeId: shoppingEvent.storeId,
      clientTs: shoppingEvent.clientTs,
      payload: shoppingEvent.payload,
    })
    .from(shoppingEvent)
    .innerJoin(shoppingList, eq(shoppingList.id, shoppingEvent.listId))
    .where(
      and(
        eq(shoppingList.householdId, householdId),
        eq(shoppingEvent.storeId, storeId),
        eq(shoppingEvent.type, "item_checked"),
        resetAt ? gt(shoppingEvent.serverTs, resetAt) : undefined,
      ),
    );
  return learnShoppingOrder(
    rows.flatMap((row) => {
      const observation = observationSchema.safeParse(row.payload);
      return observation.success
        ? [
            {
              id: row.id,
              listId: row.listId,
              itemId: row.itemId,
              storeId,
              clientTs: row.clientTs.getTime(),
              ...observation.data,
            },
          ]
        : [];
    }),
  );
}
