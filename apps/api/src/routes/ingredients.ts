import { ingredient, ingredientCategory } from "@yumi/db/schema";
import { ingredientInputSchema, ingredientSearchSchema } from "@yumi/shared";
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { type HouseholdEnv, requireAuth, requireHousehold } from "../context";
import { db } from "../db";

const MIN_SCORE = 0.3;

const columns = {
  id: ingredient.id,
  key: ingredient.key,
  householdId: ingredient.householdId,
  nameDe: ingredient.nameDe,
  nameEn: ingredient.nameEn,
  synonyms: ingredient.synonyms,
  categoryId: ingredient.categoryId,
  defaultUnit: ingredient.defaultUnit,
  densityGPerMl: ingredient.densityGPerMl,
  pieceWeightG: ingredient.pieceWeightG,
  packSizes: ingredient.packSizes,
  icon: ingredient.icon,
};

const visibleTo = (householdId: string) =>
  or(isNull(ingredient.householdId), eq(ingredient.householdId, householdId));

function escapeLike(text: string) {
  return text.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

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
    const lower = q.toLowerCase();
    const prefix = `${escapeLike(lower)}%`;
    // word_similarity scores the best-matching part of each name, so partial input ranks well.
    const score = sql<number>`greatest(
      word_similarity(${q}, ${ingredient.nameDe}),
      word_similarity(${q}, ${ingredient.nameEn}),
      coalesce((select max(word_similarity(${q}, s)) from unnest(${ingredient.synonyms}) s), 0)
    )`;
    const exact = sql`(lower(${ingredient.nameDe}) = ${lower} or lower(${ingredient.nameEn}) = ${lower}
      or exists (select 1 from unnest(${ingredient.synonyms}) s where lower(s) = ${lower}))`;
    const startsWith = sql`(lower(${ingredient.nameDe}) like ${prefix} or lower(${ingredient.nameEn}) like ${prefix}
      or exists (select 1 from unnest(${ingredient.synonyms}) s where lower(s) like ${prefix}))`;
    const rows = await db
      .select({ ...columns, score })
      .from(ingredient)
      .where(
        and(
          visibleTo(c.get("householdId")),
          or(sql`${score} >= ${MIN_SCORE}`, startsWith),
        ),
      )
      .orderBy(
        sql`${exact} desc`,
        sql`${startsWith} desc`,
        sql`${score} desc`,
        sql`length(${ingredient.nameDe})`,
      )
      .limit(limit);
    return c.json(rows.map(({ score: _score, ...row }) => row));
  })
  .get("/:id{[0-9a-f-]{36}}", async (c) => {
    const [row] = await db
      .select(columns)
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
      .returning(columns);
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
      .returning(columns);
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
