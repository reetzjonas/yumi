import { ingredient, pantryItem } from "@yumi/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { visibleTo } from "../catalog";
import { type HouseholdEnv, requireAuth, requireHousehold } from "../context";
import { db } from "../db";

/** Staples the household always has at home; recipe additions skip them. */
export const pantry = new Hono<HouseholdEnv>()
  .use(requireAuth, requireHousehold)
  .get("/", async (c) =>
    c.json(
      await db
        .select({
          ingredientId: pantryItem.ingredientId,
          nameDe: ingredient.nameDe,
          nameEn: ingredient.nameEn,
          icon: ingredient.icon,
          categoryId: ingredient.categoryId,
        })
        .from(pantryItem)
        .innerJoin(ingredient, eq(ingredient.id, pantryItem.ingredientId))
        .where(eq(pantryItem.householdId, c.get("householdId")))
        .orderBy(asc(ingredient.nameDe)),
    ),
  )
  .put("/:ingredientId", async (c) => {
    const householdId = c.get("householdId");
    const ingredientId = z.uuid().parse(c.req.param("ingredientId"));
    const [visible] = await db
      .select({ id: ingredient.id })
      .from(ingredient)
      .where(and(eq(ingredient.id, ingredientId), visibleTo(householdId)))
      .limit(1);
    if (!visible) throw new HTTPException(404, { message: "not_found" });
    await db
      .insert(pantryItem)
      .values({ householdId, ingredientId })
      .onConflictDoNothing();
    return c.body(null, 204);
  })
  .delete("/:ingredientId", async (c) => {
    await db
      .delete(pantryItem)
      .where(
        and(
          eq(pantryItem.householdId, c.get("householdId")),
          eq(
            pantryItem.ingredientId,
            z.uuid().parse(c.req.param("ingredientId")),
          ),
        ),
      );
    return c.body(null, 204);
  });
