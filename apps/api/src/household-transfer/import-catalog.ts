import { ingredient, ingredientCategory } from "@yumi/db/schema";
import type { HouseholdTransfer } from "@yumi/shared";
import { and, inArray, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { db } from "../db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function resolveTransferCatalog(
  tx: Tx,
  archive: HouseholdTransfer,
) {
  const globalKeys = archive.ingredients.flatMap((record) =>
    record.kind === "global" ? [record.key] : [],
  );
  const globals = await tx
    .select({ id: ingredient.id, key: ingredient.key })
    .from(ingredient)
    .where(
      and(isNull(ingredient.householdId), inArray(ingredient.key, globalKeys)),
    );
  const globalIds = new Map(globals.map((record) => [record.key, record.id]));
  const unavailableIngredients = globalKeys.filter(
    (key) => !globalIds.has(key),
  );
  if (unavailableIngredients.length)
    throw new HTTPException(422, {
      message: `unavailable_global_ingredients:${unavailableIngredients.join(",")}`,
    });
  const categories = await tx
    .select({ id: ingredientCategory.id, key: ingredientCategory.key })
    .from(ingredientCategory);
  const categoryIds = new Map(
    categories.map((record) => [record.key, record.id]),
  );
  function categoryId(key: string): string;
  function categoryId(key: null): null;
  function categoryId(key: string | null): string | null;
  function categoryId(key: string | null): string | null {
    if (key === null) return null;
    const id = categoryIds.get(key);
    if (!id)
      throw new HTTPException(422, {
        message: `unavailable_category:${key}`,
      });
    return id;
  }
  const globalId = (key: string) => {
    const id = globalIds.get(key);
    if (!id)
      throw new HTTPException(422, {
        message: `unavailable_global_ingredients:${key}`,
      });
    return id;
  };
  return { globalId, categoryId };
}
