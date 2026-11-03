import {
  ingredient,
  ingredientCategory,
  recurringItem,
  shoppingList,
} from "@yumi/db/schema";
import { firstOccurrence, recurringItemInputSchema } from "@yumi/shared";
import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono/validator";
import { z } from "zod";
import { visibleTo } from "../catalog";
import { type HouseholdEnv, requireAuth, requireHousehold } from "../context";
import { db } from "../db";
import { todayUtc } from "../recurring";

const fields = {
  id: recurringItem.id,
  label: recurringItem.label,
  ingredientId: recurringItem.ingredientId,
  quantity: recurringItem.quantity,
  unit: recurringItem.unit,
  categoryId: recurringItem.categoryId,
  weekday: recurringItem.weekday,
  intervalWeeks: recurringItem.intervalWeeks,
  nextDue: recurringItem.nextDue,
};

async function listOf(householdId: string, id: string) {
  const [row] = await db
    .select({ id: shoppingList.id })
    .from(shoppingList)
    .where(
      and(eq(shoppingList.id, id), eq(shoppingList.householdId, householdId)),
    )
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "not_found" });
  return row.id;
}

async function assertRefs(
  householdId: string,
  refs: { ingredientId: string | null; categoryId: string | null },
) {
  if (refs.ingredientId) {
    const [row] = await db
      .select({ id: ingredient.id })
      .from(ingredient)
      .where(and(eq(ingredient.id, refs.ingredientId), visibleTo(householdId)))
      .limit(1);
    if (!row) throw new HTTPException(400, { message: "invalid_ingredient" });
  }
  if (refs.categoryId) {
    const [row] = await db
      .select({ id: ingredientCategory.id })
      .from(ingredientCategory)
      .where(eq(ingredientCategory.id, refs.categoryId))
      .limit(1);
    if (!row) throw new HTTPException(400, { message: "invalid_category" });
  }
}

/** Rules that put items back on a list every few weeks (mounted under /shopping). */
export const recurring = new Hono<HouseholdEnv>()
  .use(requireAuth, requireHousehold)
  .get("/lists/:id/recurring", async (c) => {
    const listId = await listOf(
      c.get("householdId"),
      z.uuid().parse(c.req.param("id")),
    );
    return c.json(
      await db
        .select({
          ...fields,
          ingredient: { nameDe: ingredient.nameDe, nameEn: ingredient.nameEn },
        })
        .from(recurringItem)
        .leftJoin(ingredient, eq(ingredient.id, recurringItem.ingredientId))
        .where(eq(recurringItem.listId, listId))
        .orderBy(asc(recurringItem.nextDue), asc(recurringItem.label)),
    );
  })
  .post(
    "/lists/:id/recurring",
    validator("json", (value) => recurringItemInputSchema.parse(value)),
    async (c) => {
      const householdId = c.get("householdId");
      const listId = await listOf(
        householdId,
        z.uuid().parse(c.req.param("id")),
      );
      const input = c.req.valid("json");
      await assertRefs(householdId, input);
      const [row] = await db
        .insert(recurringItem)
        .values({
          ...input,
          householdId,
          listId,
          nextDue: firstOccurrence(todayUtc(), input.weekday),
        })
        .returning(fields);
      return c.json(row, 201);
    },
  )
  .delete("/recurring/:id", async (c) => {
    const deleted = await db
      .delete(recurringItem)
      .where(
        and(
          eq(recurringItem.id, z.uuid().parse(c.req.param("id"))),
          eq(recurringItem.householdId, c.get("householdId")),
        ),
      )
      .returning({ id: recurringItem.id });
    if (deleted.length === 0)
      throw new HTTPException(404, { message: "not_found" });
    return c.body(null, 204);
  });
