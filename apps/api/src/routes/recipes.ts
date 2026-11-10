import {
  cookLog,
  ingredient,
  mealQueueEntry,
  recipe,
  recipeImage,
  recipeIngredient,
  recipeRating,
  recipeStep,
  user,
} from "@yumi/db/schema";
import {
  calculateRecipeNutrition,
  matchStepIngredientPositions,
  recipeCookedInputSchema,
  recipeInputSchema,
  recipeListQuerySchema,
  unitSchema,
} from "@yumi/shared";
import {
  and,
  arrayContains,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono/validator";
import { z } from "zod";
import { visibleTo } from "../catalog";
import { type HouseholdEnv, requireAuth, requireHousehold } from "../context";
import { db } from "../db";
import { recipeInsights } from "../recipe-insights";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ParsedRecipe = z.output<typeof recipeInputSchema>;

const ID = "/:id";

const summaryColumns = {
  id: recipe.id,
  title: recipe.title,
  tags: recipe.tags,
  servings: recipe.servings,
  prepMinutes: recipe.prepMinutes,
  cookMinutes: recipe.cookMinutes,
  imageKey: recipe.imageKey,
  updatedAt: recipe.updatedAt,
};

function escapeLike(text: string) {
  return text.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

async function loadVisibleIngredients(
  householdId: string,
  input: ParsedRecipe,
) {
  const ids = [
    ...new Set(input.ingredients.flatMap((i) => i.ingredientId ?? [])),
  ];
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      id: ingredient.id,
      nameDe: ingredient.nameDe,
      nameEn: ingredient.nameEn,
    })
    .from(ingredient)
    .where(and(inArray(ingredient.id, ids), visibleTo(householdId)));
  if (rows.length !== ids.length)
    throw new HTTPException(400, { message: "invalid_ingredient" });
  return rows;
}

async function insertChildren(
  tx: Tx,
  recipeId: string,
  input: ParsedRecipe,
  catalog: Awaited<ReturnType<typeof loadVisibleIngredients>>,
) {
  const lines =
    input.ingredients.length === 0
      ? []
      : await tx
          .insert(recipeIngredient)
          .values(
            input.ingredients.map((line, position) => ({
              ...line,
              recipeId,
              position,
            })),
          )
          .returning({
            id: recipeIngredient.id,
            position: recipeIngredient.position,
          });
  const idsByPosition = new Map(lines.map((line) => [line.position, line.id]));
  const namesById = new Map(catalog.map((item) => [item.id, item]));
  const matchingIngredients = input.ingredients.map((line) => ({
    rawText: line.rawText,
    ...namesById.get(line.ingredientId ?? ""),
  }));
  if (input.steps.length > 0) {
    await tx.insert(recipeStep).values(
      input.steps.map((step, position) => ({
        text: step.text,
        recipeId,
        position,
        ingredientRefsManual: step.ingredientPositions !== null,
        ingredientRefs: (
          step.ingredientPositions ??
          matchStepIngredientPositions(step.text, matchingIngredients)
        ).map((ingredientPosition) => {
          const id = idsByPosition.get(ingredientPosition);
          if (!id) throw new Error("inserted recipe ingredient missing");
          return id;
        }),
      })),
    );
  }
}

function recipeFields({ ingredients: _i, steps: _s, ...fields }: ParsedRecipe) {
  return fields;
}

async function loadRecipe(householdId: string, id: string, userId: string) {
  const [row] = await db
    .select({
      ...summaryColumns,
      ...recipeInsights(householdId, userId),
      description: recipe.description,
      cookingNotes: recipe.cookingNotes,
      sourceUrl: recipe.sourceUrl,
      createdAt: recipe.createdAt,
    })
    .from(recipe)
    .where(and(eq(recipe.id, id), eq(recipe.householdId, householdId)))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "not_found" });
  const [ingredients, steps] = await Promise.all([
    db
      .select({
        id: recipeIngredient.id,
        section: recipeIngredient.section,
        rawText: recipeIngredient.rawText,
        quantity: recipeIngredient.quantity,
        unit: recipeIngredient.unit,
        note: recipeIngredient.note,
        optional: recipeIngredient.optional,
        excludeFromNutrition: recipeIngredient.excludeFromNutrition,
        ingredientId: recipeIngredient.ingredientId,
        ingredient: {
          nameDe: ingredient.nameDe,
          nameEn: ingredient.nameEn,
          categoryId: ingredient.categoryId,
        },
        factors: {
          nutritionPer100g: ingredient.nutritionPer100g,
          densityGPerMl: ingredient.densityGPerMl,
          pieceWeightG: ingredient.pieceWeightG,
        },
      })
      .from(recipeIngredient)
      .leftJoin(ingredient, eq(ingredient.id, recipeIngredient.ingredientId))
      .where(eq(recipeIngredient.recipeId, id))
      .orderBy(asc(recipeIngredient.position)),
    db
      .select({
        id: recipeStep.id,
        text: recipeStep.text,
        ingredientRefs: recipeStep.ingredientRefs,
        ingredientRefsManual: recipeStep.ingredientRefsManual,
      })
      .from(recipeStep)
      .where(eq(recipeStep.recipeId, id))
      .orderBy(asc(recipeStep.position)),
  ]);
  const matchingIngredients = ingredients.map((line) => ({
    rawText: line.rawText,
    ...line.ingredient,
  }));
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    cookingNotes: row.cookingNotes,
    servings: row.servings,
    prepMinutes: row.prepMinutes,
    cookMinutes: row.cookMinutes,
    sourceUrl: row.sourceUrl,
    tags: row.tags,
    imageKey: row.imageKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    myRating: row.myRating,
    lastCookedAt: row.lastCookedAt,
    nutrition: calculateRecipeNutrition(
      ingredients.map((line) => ({
        quantity: line.quantity,
        unit: unitSchema.nullable().parse(line.unit),
        ingredient: line.ingredientId ? line.factors : null,
        excludeFromNutrition: line.excludeFromNutrition,
      })),
      row.servings,
    ),
    ingredients: ingredients.map(
      ({ ingredient: linked, factors: _f, ...line }) => ({
        ...line,
        ingredient: line.ingredientId ? linked : null,
      }),
    ),
    steps: steps.map(({ ingredientRefsManual, ...step }) => {
      const positions = ingredientRefsManual
        ? step.ingredientRefs.flatMap((ref) => {
            const position = ingredients.findIndex((line) => line.id === ref);
            return position === -1 ? [] : [position];
          })
        : matchStepIngredientPositions(step.text, matchingIngredients);
      return {
        ...step,
        ingredientRefs: ingredientRefsManual
          ? step.ingredientRefs
          : positions.flatMap((position) => {
              const line = ingredients[position];
              return line ? [line.id] : [];
            }),
        ingredientPositions: ingredientRefsManual ? positions : null,
      };
    }),
  };
}

export type RecipeDetail = Awaited<ReturnType<typeof loadRecipe>>;

const recipeBody = validator("json", (value) => recipeInputSchema.parse(value));

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_VARIANTS = { thumb: 400, full: 1200 } as const;

async function resizeImage(bytes: Uint8Array, width: number) {
  return new Bun.Image(bytes)
    .resize(width, width * 2, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .bytes();
}

async function assertRecipeOwned(householdId: string, id: string) {
  const [row] = await db
    .select({ id: recipe.id })
    .from(recipe)
    .where(and(eq(recipe.id, id), eq(recipe.householdId, householdId)))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "not_found" });
}

export const recipes = new Hono<HouseholdEnv>()
  .use(requireAuth, requireHousehold)
  .get(
    "/",
    validator("query", (value) =>
      recipeListQuerySchema
        .extend({
          suggestion: z.enum(["neglected", "favorites", "quick"]).optional(),
        })
        .parse(value),
    ),
    async (c) => {
      const { q, tag, suggestion } = c.req.valid("query");
      const householdId = c.get("householdId");
      const insights = recipeInsights(householdId, c.get("user").id);
      const knownTotal = sql<number>`${recipe.prepMinutes} + ${recipe.cookMinutes}`;
      const rows = await db
        .select({ ...summaryColumns, ...insights })
        .from(recipe)
        .where(
          and(
            eq(recipe.householdId, householdId),
            q
              ? or(
                  ilike(recipe.title, `%${escapeLike(q)}%`),
                  sql`word_similarity(${q}, ${recipe.title}) >= 0.4`,
                  sql`exists (
                    select 1 from ${recipeIngredient}
                    left join ${ingredient}
                      on ${ingredient.id} = ${recipeIngredient.ingredientId}
                    where ${recipeIngredient.recipeId} = ${recipe.id}
                      and (${recipeIngredient.rawText} ilike ${`%${escapeLike(q)}%`}
                        or ${ingredient.nameDe} ilike ${`%${escapeLike(q)}%`}
                        or ${ingredient.nameEn} ilike ${`%${escapeLike(q)}%`})
                  )`,
                )
              : undefined,
            tag ? arrayContains(recipe.tags, [tag]) : undefined,
            suggestion === "favorites" ? gte(insights.myRating, 4) : undefined,
            suggestion === "quick" ? sql`${knownTotal} <= 30` : undefined,
          ),
        )
        .orderBy(
          ...(suggestion === "neglected"
            ? [sql`${insights.lastCookedAt} asc nulls first`]
            : suggestion === "favorites"
              ? [desc(insights.myRating)]
              : suggestion === "quick"
                ? [asc(knownTotal)]
                : [desc(recipe.updatedAt)]),
          asc(recipe.title),
          asc(recipe.id),
        );
      return c.json(rows);
    },
  )
  .get("/history", async (c) => {
    // What the household ate: cooked recipes plus finished meals without a recipe.
    const householdId = c.get("householdId");
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const [cooked, meals] = await Promise.all([
      db
        .select({
          id: cookLog.id,
          recipeId: recipe.id,
          title: recipe.title,
          servings: recipe.servings,
          at: cookLog.cookedAt,
          by: user.name,
        })
        .from(cookLog)
        .innerJoin(recipe, eq(recipe.id, cookLog.recipeId))
        .leftJoin(user, eq(user.id, cookLog.userId))
        .where(
          and(
            eq(cookLog.householdId, householdId),
            gte(cookLog.cookedAt, since),
          ),
        ),
      db
        .select({
          id: mealQueueEntry.id,
          title: mealQueueEntry.title,
          at: mealQueueEntry.updatedAt,
        })
        .from(mealQueueEntry)
        .where(
          and(
            eq(mealQueueEntry.householdId, householdId),
            eq(mealQueueEntry.status, "cooked"),
            isNull(mealQueueEntry.recipeId),
            gte(mealQueueEntry.updatedAt, since),
          ),
        ),
    ]);
    return c.json(
      [
        ...cooked,
        ...meals.map((meal) => ({
          id: meal.id,
          recipeId: null,
          title: meal.title ?? "",
          servings: null,
          at: meal.at,
          by: null,
        })),
      ].sort((a, b) => b.at.getTime() - a.at.getTime()),
    );
  })
  .get("/tags", async (c) => {
    const rows = await db.execute<{ tag: string }>(
      sql`select distinct unnest(${recipe.tags}) as tag from ${recipe}
          where ${recipe.householdId} = ${c.get("householdId")} order by tag`,
    );
    return c.json(rows.map((r) => r.tag));
  })
  .get(ID, async (c) =>
    c.json(
      await loadRecipe(
        c.get("householdId"),
        z.uuid().parse(c.req.param("id")),
        c.get("user").id,
      ),
    ),
  )
  .post("/", recipeBody, async (c) => {
    const householdId = c.get("householdId");
    const input = c.req.valid("json");
    const catalog = await loadVisibleIngredients(householdId, input);
    const id = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(recipe)
        .values({
          ...recipeFields(input),
          householdId,
          createdBy: c.get("user").id,
        })
        .returning({ id: recipe.id });
      if (!row) throw new Error("recipe insert returned no row");
      await insertChildren(tx, row.id, input, catalog);
      return row.id;
    });
    return c.json(await loadRecipe(householdId, id, c.get("user").id), 201);
  })
  .put(ID, recipeBody, async (c) => {
    const householdId = c.get("householdId");
    const id = z.uuid().parse(c.req.param("id"));
    const input = c.req.valid("json");
    const catalog = await loadVisibleIngredients(householdId, input);
    await db.transaction(async (tx) => {
      const updated = await tx
        .update(recipe)
        .set(recipeFields(input))
        .where(and(eq(recipe.id, id), eq(recipe.householdId, householdId)))
        .returning({ id: recipe.id });
      if (updated.length === 0)
        throw new HTTPException(404, { message: "not_found" });
      await tx
        .delete(recipeIngredient)
        .where(eq(recipeIngredient.recipeId, id));
      await tx.delete(recipeStep).where(eq(recipeStep.recipeId, id));
      await insertChildren(tx, id, input, catalog);
    });
    return c.json(await loadRecipe(householdId, id, c.get("user").id));
  })
  .put(
    `${ID}/notes`,
    validator("json", (value) =>
      z.object({ notes: z.string().trim().max(4000).nullable() }).parse(value),
    ),
    async (c) => {
      const id = z.uuid().parse(c.req.param("id"));
      await assertRecipeOwned(c.get("householdId"), id);
      // Notes are not recipe content: updatedAt (library order) stays untouched.
      await db
        .update(recipe)
        .set({
          cookingNotes: c.req.valid("json").notes || null,
          updatedAt: sql`${recipe.updatedAt}`,
        })
        .where(eq(recipe.id, id));
      return c.body(null, 204);
    },
  )
  .put(
    `${ID}/rating`,
    validator("json", (value) =>
      z
        .object({
          stars: z.number().int().min(1).max(5).nullable(),
        })
        .parse(value),
    ),
    async (c) => {
      const id = z.uuid().parse(c.req.param("id"));
      await assertRecipeOwned(c.get("householdId"), id);
      const userId = c.get("user").id;
      const { stars } = c.req.valid("json");
      if (stars === null) {
        await db
          .delete(recipeRating)
          .where(
            and(eq(recipeRating.recipeId, id), eq(recipeRating.userId, userId)),
          );
      } else {
        await db
          .insert(recipeRating)
          .values({ recipeId: id, userId, stars })
          .onConflictDoUpdate({
            target: [recipeRating.recipeId, recipeRating.userId],
            set: { stars, updatedAt: new Date() },
          });
      }
      return c.json({ myRating: stars });
    },
  )
  .get(`${ID}/history`, async (c) => {
    const id = z.uuid().parse(c.req.param("id"));
    const householdId = c.get("householdId");
    await assertRecipeOwned(householdId, id);
    const rows = await db
      .select({
        id: cookLog.id,
        cookedAt: cookLog.cookedAt,
        cookedBy: user.name,
      })
      .from(cookLog)
      .leftJoin(user, eq(user.id, cookLog.userId))
      .where(
        and(eq(cookLog.recipeId, id), eq(cookLog.householdId, householdId)),
      )
      .orderBy(desc(cookLog.cookedAt), asc(cookLog.id))
      .limit(10);
    return c.json(rows);
  })
  .post(
    `${ID}/cooked`,
    validator("json", (value) => recipeCookedInputSchema.parse(value)),
    async (c) => {
      const householdId = c.get("householdId");
      const id = z.uuid().parse(c.req.param("id"));
      const { requestId } = c.req.valid("json");
      await assertRecipeOwned(householdId, id);
      const inserted = await db
        .insert(cookLog)
        .values({
          id: requestId,
          householdId,
          recipeId: id,
          userId: c.get("user").id,
        })
        .onConflictDoNothing({ target: cookLog.id })
        .returning({ id: cookLog.id });
      if (inserted.length === 0) {
        const [existing] = await db
          .select({ id: cookLog.id })
          .from(cookLog)
          .where(
            and(
              eq(cookLog.id, requestId),
              eq(cookLog.householdId, householdId),
              eq(cookLog.recipeId, id),
            ),
          );
        if (!existing)
          throw new HTTPException(409, { message: "request_id_conflict" });
      }
      return c.json({ ok: true });
    },
  )
  .delete(ID, async (c) => {
    const deleted = await db
      .delete(recipe)
      .where(
        and(
          eq(recipe.id, z.uuid().parse(c.req.param("id"))),
          eq(recipe.householdId, c.get("householdId")),
        ),
      )
      .returning({ id: recipe.id });
    if (deleted.length === 0)
      throw new HTTPException(404, { message: "not_found" });
    return c.body(null, 204);
  })
  .put(`${ID}/image`, async (c) => {
    const householdId = c.get("householdId");
    const id = z.uuid().parse(c.req.param("id"));
    await assertRecipeOwned(householdId, id);
    const form = await c.req.formData().catch(() => null);
    const file = form?.get("image");
    if (!(file instanceof File))
      throw new HTTPException(400, { message: "invalid_image" });
    if (file.size > MAX_IMAGE_BYTES)
      throw new HTTPException(413, { message: "image_too_large" });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const [thumb, full] = await Promise.all([
      resizeImage(bytes, IMAGE_VARIANTS.thumb),
      resizeImage(bytes, IMAGE_VARIANTS.full),
    ]).catch(() => {
      throw new HTTPException(400, { message: "invalid_image" });
    });
    const imageKey = await db.transaction(async (tx) => {
      const [image] = await tx
        .insert(recipeImage)
        .values({ recipeId: id, thumb, full })
        .onConflictDoUpdate({
          target: recipeImage.recipeId,
          set: {
            id: sql`gen_random_uuid()`,
            thumb,
            full,
            createdAt: sql`now()`,
          },
        })
        .returning({ id: recipeImage.id });
      if (!image) throw new Error("image upsert returned no row");
      await tx
        .update(recipe)
        .set({ imageKey: image.id })
        .where(eq(recipe.id, id));
      return image.id;
    });
    return c.json({ imageKey });
  })
  .delete(`${ID}/image`, async (c) => {
    const householdId = c.get("householdId");
    const id = z.uuid().parse(c.req.param("id"));
    await assertRecipeOwned(householdId, id);
    await db.transaction(async (tx) => {
      await tx.delete(recipeImage).where(eq(recipeImage.recipeId, id));
      await tx.update(recipe).set({ imageKey: null }).where(eq(recipe.id, id));
    });
    return c.body(null, 204);
  })
  .get(`${ID}/image/:variant`, async (c) => {
    const variant = z.enum(["thumb", "full"]).parse(c.req.param("variant"));
    const [row] = await db
      .select({ data: recipeImage[variant] })
      .from(recipeImage)
      .innerJoin(recipe, eq(recipe.id, recipeImage.recipeId))
      .where(
        and(
          eq(recipeImage.recipeId, z.uuid().parse(c.req.param("id"))),
          eq(recipe.householdId, c.get("householdId")),
        ),
      )
      .limit(1);
    if (!row) throw new HTTPException(404, { message: "not_found" });
    // URLs carry ?v=<imageKey>, which changes on every upload.
    return c.body(new Uint8Array(row.data).buffer, 200, {
      "content-type": "image/webp",
      "cache-control": "private, max-age=31536000, immutable",
    });
  });
