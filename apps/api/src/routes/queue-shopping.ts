import {
  mealQueueEntry,
  shoppingList,
  shoppingListItem,
} from "@yumi/db/schema";
import {
  queueRemovalSchema,
  queueShoppingInputSchema,
  queueShoppingPreviewSchema,
  shoppingEventSchema,
} from "@yumi/shared";
import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono/validator";
import { z } from "zod";
import { type HouseholdEnv, requireAuth, requireHousehold } from "../context";
import { db } from "../db";
import { queueShoppingEventId, queueShoppingPreview } from "../queue-shopping";
import { publishListChange } from "../shopping-bus";
import { applyShoppingEventsInTransaction } from "../shopping-events";
import { lockQueue } from "./queue";

export const queueShopping = new Hono<HouseholdEnv>()
  .use(requireAuth, requireHousehold)
  .post(
    "/shopping-preview",
    validator("json", (value) => queueShoppingPreviewSchema.parse(value)),
    async (c) => {
      const { ids, locale } = c.req.valid("json");
      const { lines: _lines, ...preview } = await db.transaction(
        (tx) => queueShoppingPreview(tx, c.get("householdId"), ids, locale),
        { isolationLevel: "repeatable read" },
      );
      return c.json(preview);
    },
  )
  .post(
    "/shopping",
    validator("json", (value) => queueShoppingInputSchema.parse(value)),
    async (c) => {
      const input = c.req.valid("json");
      const householdId = c.get("householdId");
      const added = await db.transaction(async (tx) => {
        await lockQueue(tx, householdId);
        const [list] = await tx
          .select({ id: shoppingList.id })
          .from(shoppingList)
          .where(
            and(
              eq(shoppingList.id, input.listId),
              eq(shoppingList.householdId, householdId),
            ),
          )
          .for("update");
        if (!list) throw new HTTPException(404, { message: "not_found" });
        const preview = await queueShoppingPreview(
          tx,
          householdId,
          input.ids,
          input.locale,
          true,
        );
        if (preview.version !== input.version)
          throw new HTTPException(409, { message: "invalid_input" });
        const clientTs = new Date().toISOString();
        const events = preview.lines
          .filter((line) => !line.staple || input.includeStaples)
          .map(
            ({
              id,
              factors: _factors,
              checked: _checked,
              staple: _staple,
              ...payload
            }) =>
              shoppingEventSchema.parse({
                id: queueShoppingEventId(input.requestId, id),
                itemId: queueShoppingEventId(input.requestId, `item:${id}`),
                type: "item_added",
                clientTs,
                payload,
              }),
          );
        return (
          await applyShoppingEventsInTransaction(
            tx,
            { householdId, listId: list.id, userId: c.get("user").id },
            events,
          )
        ).length;
      });
      if (added) await publishListChange(householdId, input.listId);
      return c.json({ added }, 201);
    },
  )
  .delete(
    "/:id",
    validator("query", (value) => queueRemovalSchema.parse(value)),
    async (c) => {
      const householdId = c.get("householdId");
      const id = z.uuid().parse(c.req.param("id"));
      const changedLists = await db.transaction(async (tx) => {
        await lockQueue(tx, householdId);
        const [deleted] = await tx
          .delete(mealQueueEntry)
          .where(
            and(
              eq(mealQueueEntry.id, id),
              eq(mealQueueEntry.householdId, householdId),
              eq(mealQueueEntry.status, "queued"),
            ),
          )
          .returning({ id: mealQueueEntry.id });
        if (!deleted) throw new HTTPException(404, { message: "not_found" });
        if (c.req.valid("query").removeItems === "false") return [];
        const linked = await tx
          .select({ id: shoppingListItem.id, listId: shoppingList.id })
          .from(shoppingListItem)
          .innerJoin(shoppingList, eq(shoppingList.id, shoppingListItem.listId))
          .where(
            and(
              eq(shoppingList.householdId, householdId),
              sql`${shoppingListItem.sources} @> ${JSON.stringify([{ kind: "queue", id }])}::jsonb`,
            ),
          );
        const listIds = [...new Set(linked.map((item) => item.listId))];
        for (const listId of listIds) {
          await applyShoppingEventsInTransaction(
            tx,
            { listId, householdId, userId: c.get("user").id },
            linked
              .filter((item) => item.listId === listId)
              .map((item) =>
                shoppingEventSchema.parse({
                  id: crypto.randomUUID(),
                  itemId: item.id,
                  type: "item_removed",
                  clientTs: new Date().toISOString(),
                }),
              ),
          );
        }
        return listIds;
      });
      for (const listId of changedLists)
        await publishListChange(householdId, listId);
      return c.body(null, 204);
    },
  );
