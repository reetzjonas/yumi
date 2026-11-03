import {
  ingredient,
  mealQueueEntry,
  pantryItem,
  recipe,
  recipeIngredient,
} from "@yumi/db/schema";
import {
  mergeShoppingItems,
  parseIngredientLine,
  shoppingItemFieldsSchema,
  unitSchema,
} from "@yumi/shared";
import { and, asc, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { visibleTo } from "./catalog";
import type { db } from "./db";

type Reader = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function queueShoppingPreview(
  reader: Reader,
  householdId: string,
  ids: string[],
  locale: "de" | "en",
  lockRecipes = false,
) {
  const entriesQuery = reader
    .select({
      id: mealQueueEntry.id,
      recipeId: mealQueueEntry.recipeId,
      servings: mealQueueEntry.servings,
      recipeServings: recipe.servings,
    })
    .from(mealQueueEntry)
    .innerJoin(
      recipe,
      and(
        eq(recipe.id, mealQueueEntry.recipeId),
        eq(recipe.householdId, householdId),
      ),
    )
    .where(
      and(
        inArray(mealQueueEntry.id, ids),
        eq(mealQueueEntry.householdId, householdId),
        eq(mealQueueEntry.status, "queued"),
      ),
    )
    .orderBy(asc(mealQueueEntry.id));
  const entries = lockRecipes
    ? await entriesQuery.for("share", { of: recipe })
    : await entriesQuery;
  if (entries.length !== ids.length)
    throw new HTTPException(404, { message: "not_found" });
  const lines = await reader
    .select({
      id: recipeIngredient.id,
      recipeId: recipeIngredient.recipeId,
      rawText: recipeIngredient.rawText,
      quantity: recipeIngredient.quantity,
      unit: recipeIngredient.unit,
      ingredientId: ingredient.id,
      categoryId: ingredient.categoryId,
      nameDe: ingredient.nameDe,
      nameEn: ingredient.nameEn,
      densityGPerMl: ingredient.densityGPerMl,
      pieceWeightG: ingredient.pieceWeightG,
    })
    .from(recipeIngredient)
    .leftJoin(
      ingredient,
      and(
        eq(ingredient.id, recipeIngredient.ingredientId),
        visibleTo(householdId),
      ),
    )
    .where(
      and(
        inArray(
          recipeIngredient.recipeId,
          entries.map((entry) => entry.recipeId),
        ),
        eq(recipeIngredient.optional, false),
      ),
    )
    .orderBy(asc(recipeIngredient.position), asc(recipeIngredient.id));
  const staples = new Set(
    (
      await reader
        .select({ ingredientId: pantryItem.ingredientId })
        .from(pantryItem)
        .where(eq(pantryItem.householdId, householdId))
    ).map((item) => item.ingredientId),
  );
  const items = entries.flatMap((entry) =>
    lines
      .filter((line) => line.recipeId === entry.recipeId)
      .map((line) => ({
        id: `${entry.id}:${line.id}`,
        ...shoppingItemFieldsSchema.parse({
          label: (
            (locale === "de" ? line.nameDe : line.nameEn) ??
            (parseIngredientLine(line.rawText).name || line.rawText)
          ).slice(0, 200),
          ingredientId: line.ingredientId,
          categoryId: line.categoryId,
          quantity:
            line.quantity === null
              ? null
              : Math.round(
                  ((line.quantity * entry.servings) / entry.recipeServings) *
                    1000,
                ) / 1000,
          unit: unitSchema.safeParse(line.unit).data ?? null,
          sources: [
            { kind: "queue", id: entry.id },
            { kind: "recipe", id: entry.recipeId },
          ],
        }),
        checked: false,
        factors: {
          densityGPerMl: line.densityGPerMl,
          pieceWeightG: line.pieceWeightG,
        },
        staple: line.ingredientId !== null && staples.has(line.ingredientId),
      })),
  );
  const version = new Bun.CryptoHasher("sha256")
    .update(JSON.stringify({ entries, items }))
    .digest("hex");
  return {
    version,
    lines: items,
    items: mergeShoppingItems(items.filter((item) => !item.staple)),
    staples: mergeShoppingItems(items.filter((item) => item.staple)),
  };
}

export function queueShoppingEventId(requestId: string, lineId: string) {
  const hash = new Bun.CryptoHasher("sha256")
    .update(`${requestId}:${lineId}`)
    .digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
