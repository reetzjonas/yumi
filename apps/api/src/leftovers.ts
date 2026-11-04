import {
  ingredient,
  leftover,
  mealQueueEntry,
  pantryItem,
  recipe,
  recipeIngredient,
} from "@yumi/db/schema";
import {
  convertQuantity,
  expectedPackLeftover,
  mergeShoppingItems,
  rankReuseRecipes,
  unitSchema,
} from "@yumi/shared";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { queueShoppingEventId } from "./queue-shopping";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type PreviewLine = Awaited<
  ReturnType<typeof import("./queue-shopping").queueShoppingPreview>
>["lines"][number];

export async function recordExpectedLeftovers(
  tx: Tx,
  householdId: string,
  requestId: string,
  lines: PreviewLine[],
) {
  const merged = mergeShoppingItems(lines);
  const ids = merged.flatMap((row) =>
    row.ingredientId ? [row.ingredientId] : [],
  );
  if (!ids.length) return;
  const catalog = await tx
    .select()
    .from(ingredient)
    .where(inArray(ingredient.id, ids));
  for (const row of merged) {
    const linked = catalog.find((item) => item.id === row.ingredientId);
    if (!linked) continue;
    for (const amount of row.amounts) {
      if (!amount.unit) continue;
      const quantity = expectedPackLeftover(
        amount.quantity,
        amount.unit,
        linked.packSizes.flatMap((pack) => {
          const unit = unitSchema.safeParse(pack.unit).data;
          return unit ? [{ quantity: pack.quantity, unit }] : [];
        }),
        linked,
      );
      if (quantity <= 0) continue;
      await tx
        .insert(leftover)
        .values({
          id: queueShoppingEventId(
            requestId,
            `leftover:${linked.id}:${amount.unit}`,
          ),
          householdId,
          ingredientId: linked.id,
          quantity,
          unit: amount.unit,
          sourceEntryIds: row.sources.flatMap((source) =>
            source.kind === "queue" ? [source.id] : [],
          ),
        })
        .onConflictDoNothing();
    }
  }
}

export async function consumeLeftovers(
  tx: Tx,
  householdId: string,
  entry: { id: string; recipeId: string; servings: number },
) {
  const [source] = await tx
    .select({ servings: recipe.servings })
    .from(recipe)
    .where(
      and(eq(recipe.id, entry.recipeId), eq(recipe.householdId, householdId)),
    );
  if (!source) return;
  const lines = await tx
    .select()
    .from(recipeIngredient)
    .where(
      and(
        eq(recipeIngredient.recipeId, entry.recipeId),
        eq(recipeIngredient.optional, false),
      ),
    );
  const available = await tx
    .select({
      id: leftover.id,
      ingredientId: leftover.ingredientId,
      quantity: leftover.quantity,
      unit: leftover.unit,
      sourceEntryIds: leftover.sourceEntryIds,
      densityGPerMl: ingredient.densityGPerMl,
      pieceWeightG: ingredient.pieceWeightG,
    })
    .from(leftover)
    .innerJoin(ingredient, eq(ingredient.id, leftover.ingredientId))
    .where(eq(leftover.householdId, householdId))
    .orderBy(asc(leftover.createdAt), asc(leftover.id));
  for (const line of lines) {
    const unit = unitSchema.safeParse(line.unit).data;
    if (!line.ingredientId || !line.quantity || !unit) continue;
    let needed = (line.quantity * entry.servings) / source.servings;
    for (const row of available) {
      if (
        row.ingredientId !== line.ingredientId ||
        row.sourceEntryIds.includes(entry.id) ||
        row.quantity <= 0
      )
        continue;
      const storedUnit = unitSchema.parse(row.unit);
      const converted = convertQuantity(needed, unit, storedUnit, row);
      if (converted === null) continue;
      const used = Math.min(converted, row.quantity);
      row.quantity -= used;
      const consumed = convertQuantity(used, storedUnit, unit, row);
      if (consumed !== null) needed = Math.max(0, needed - consumed);
      if (row.quantity <= 0.000001) {
        await tx
          .delete(leftover)
          .where(
            and(eq(leftover.id, row.id), eq(leftover.householdId, householdId)),
          );
      } else {
        await tx
          .update(leftover)
          .set({ quantity: row.quantity })
          .where(
            and(eq(leftover.id, row.id), eq(leftover.householdId, householdId)),
          );
      }
      if (needed <= 0.000001) break;
    }
  }
}

export async function loadLeftovers(householdId: string) {
  const rows = await db
    .select({
      id: leftover.id,
      ingredientId: leftover.ingredientId,
      quantity: leftover.quantity,
      unit: leftover.unit,
      nameDe: ingredient.nameDe,
      nameEn: ingredient.nameEn,
      densityGPerMl: ingredient.densityGPerMl,
      pieceWeightG: ingredient.pieceWeightG,
    })
    .from(leftover)
    .innerJoin(ingredient, eq(ingredient.id, leftover.ingredientId))
    .where(eq(leftover.householdId, householdId))
    .orderBy(asc(leftover.createdAt), asc(leftover.id));
  return rows.map((row) => ({ ...row, unit: unitSchema.parse(row.unit) }));
}

export async function reuseSuggestions(
  householdId: string,
  includeSimilar: boolean,
) {
  const recipes = await db
    .select({
      id: recipe.id,
      title: recipe.title,
      servings: recipe.servings,
      prepMinutes: recipe.prepMinutes,
      cookMinutes: recipe.cookMinutes,
      imageKey: recipe.imageKey,
    })
    .from(recipe)
    .where(eq(recipe.householdId, householdId))
    .orderBy(asc(recipe.title), asc(recipe.id));
  if (!recipes.length) return [];
  const lines = await db
    .select({
      recipeId: recipeIngredient.recipeId,
      ingredientId: ingredient.id,
      quantity: recipeIngredient.quantity,
      unit: recipeIngredient.unit,
      densityGPerMl: ingredient.densityGPerMl,
      pieceWeightG: ingredient.pieceWeightG,
    })
    .from(recipeIngredient)
    .innerJoin(ingredient, eq(ingredient.id, recipeIngredient.ingredientId))
    .where(
      and(
        inArray(
          recipeIngredient.recipeId,
          recipes.map((row) => row.id),
        ),
        eq(recipeIngredient.optional, false),
      ),
    );
  const queued = await db
    .select({ recipeId: mealQueueEntry.recipeId })
    .from(mealQueueEntry)
    .where(
      and(
        eq(mealQueueEntry.householdId, householdId),
        eq(mealQueueEntry.status, "queued"),
      ),
    );
  const queuedIds = new Set(queued.map((row) => row.recipeId));
  const staples = await db
    .select({ ingredientId: pantryItem.ingredientId })
    .from(pantryItem)
    .where(eq(pantryItem.householdId, householdId));
  const remaining = await loadLeftovers(householdId);
  const combined = mergeShoppingItems(
    remaining.map((row) => ({
      ...row,
      label: row.nameEn,
      categoryId: null,
      checked: false,
      sources: [],
      factors: row,
    })),
  );
  const ranked = rankReuseRecipes(
    recipes
      .filter((row) => !queuedIds.has(row.id))
      .map((row) => ({
        id: row.id,
        ingredients: lines
          .filter((line) => line.recipeId === row.id)
          .map((line) => ({
            ingredientId: line.ingredientId,
            quantity: line.quantity,
            unit: unitSchema.safeParse(line.unit).data ?? null,
            factors: line,
          })),
      })),
    combined.flatMap((row) =>
      row.amounts.flatMap((amount) =>
        row.ingredientId && amount.unit
          ? [
              {
                ingredientId: row.ingredientId,
                quantity: amount.quantity,
                unit: amount.unit,
                factors: remaining.find(
                  (item) => item.ingredientId === row.ingredientId,
                ),
              },
            ]
          : [],
      ),
    ),
    lines
      .filter((line) => queuedIds.has(line.recipeId))
      .map((line) => line.ingredientId),
    staples.map((row) => row.ingredientId),
  );
  return ranked
    .filter(
      (row) => row.leftoverCoverage > 0 || (includeSimilar && row.overlap > 0),
    )
    .slice(0, 12)
    .flatMap((score) => {
      const row = recipes.find((row) => row.id === score.id);
      return row ? [{ ...row, ...score }] : [];
    });
}
