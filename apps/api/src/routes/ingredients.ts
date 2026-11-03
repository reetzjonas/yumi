import { ingredient, ingredientCategory } from "@yumi/db/schema";
import {
  ingredientInputSchema,
  ingredientSearchSchema,
  parseIngredientLine,
  parseLinesSchema,
} from "@yumi/shared";
import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  ingredientColumns,
  matchParsedLine,
  searchIngredients,
  visibleTo,
} from "../catalog";
import { type HouseholdEnv, requireAuth, requireHousehold } from "../context";
import { db } from "../db";

async function assertCategoryExists(categoryId: string | null) {
  if (!categoryId) return;
  const [row] = await db
    .select({ id: ingredientCategory.id })
    .from(ingredientCategory)
    .where(eq(ingredientCategory.id, categoryId))
    .limit(1);
  if (!row) throw new HTTPException(400, { message: "invalid_category" });
}

/** Global catalog plus the active household's own ingredients. */
export const ingredients = new Hono<HouseholdEnv>()
  .use(requireAuth, requireHousehold)
  .get("/categories", async (c) => {
    const rows = await db
      .select({
        id: ingredientCategory.id,
        key: ingredientCategory.key,
        nameDe: ingredientCategory.nameDe,
        nameEn: ingredientCategory.nameEn,
        icon: ingredientCategory.icon,
        defaultPosition: ingredientCategory.defaultPosition,
      })
      .from(ingredientCategory)
      .orderBy(asc(ingredientCategory.defaultPosition));
    return c.json(rows);
  })
  .get("/", async (c) => {
    const { q, limit } = ingredientSearchSchema.parse(c.req.query());
    return c.json(await searchIngredients(c.get("householdId"), q, limit));
  })
  .post("/parse", async (c) => {
    const { lines } = parseLinesSchema.parse(await c.req.json());
    const householdId = c.get("householdId");
    const parsed = await Promise.all(
      lines.map((line) =>
        matchParsedLine(householdId, parseIngredientLine(line)),
      ),
    );
    return c.json(parsed);
  })
  .get("/:id{[0-9a-f-]{36}}", async (c) => {
    const [row] = await db
      .select(ingredientColumns)
      .from(ingredient)
      .where(
        and(
          eq(ingredient.id, c.req.param("id")),
          visibleTo(c.get("householdId")),
        ),
      )
      .limit(1);
    if (!row) throw new HTTPException(404, { message: "not_found" });
    return c.json(row);
  })
  .post("/", async (c) => {
    const input = ingredientInputSchema.parse(await c.req.json());
    await assertCategoryExists(input.categoryId);
    const [row] = await db
      .insert(ingredient)
      .values({ ...input, householdId: c.get("householdId") })
      .returning(ingredientColumns);
    return c.json(row, 201);
  })
  .put("/:id{[0-9a-f-]{36}}", async (c) => {
    const input = ingredientInputSchema.parse(await c.req.json());
    await assertCategoryExists(input.categoryId);
    const [row] = await db
      .update(ingredient)
      .set(input)
      .where(
        and(
          eq(ingredient.id, c.req.param("id")),
          eq(ingredient.householdId, c.get("householdId")),
        ),
      )
      .returning(ingredientColumns);
    if (!row) throw new HTTPException(404, { message: "not_found" });
    return c.json(row);
  })
  .delete("/:id{[0-9a-f-]{36}}", async (c) => {
    const deleted = await db
      .delete(ingredient)
      .where(
        and(
          eq(ingredient.id, c.req.param("id")),
          eq(ingredient.householdId, c.get("householdId")),
        ),
      )
      .returning({ id: ingredient.id });
    if (deleted.length === 0)
      throw new HTTPException(404, { message: "not_found" });
    return c.body(null, 204);
  });
