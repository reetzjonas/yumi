import {
  ingredient,
  recipe,
  shoppingList,
  shoppingListItem,
} from "@yumi/db/schema";
import { unitSchema } from "@yumi/shared";
import { and, asc, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "./db";

export async function loadShoppingList(householdId: string, id: string) {
  const [list] = await db
    .select({
      id: shoppingList.id,
      name: shoppingList.name,
      defaultStoreId: shoppingList.defaultStoreId,
    })
    .from(shoppingList)
    .where(
      and(eq(shoppingList.id, id), eq(shoppingList.householdId, householdId)),
    )
    .limit(1);
  if (!list) throw new HTTPException(404, { message: "not_found" });
  const rows = await db
    .select({
      id: shoppingListItem.id,
      label: shoppingListItem.label,
      ingredientId: shoppingListItem.ingredientId,
      quantity: shoppingListItem.quantity,
      unit: shoppingListItem.unit,
      categoryId: shoppingListItem.categoryId,
      checked: shoppingListItem.checked,
      sources: shoppingListItem.sources,
      updatedAt: shoppingListItem.updatedAt,
      ingredient: {
        nameDe: ingredient.nameDe,
        nameEn: ingredient.nameEn,
        icon: ingredient.icon,
        densityGPerMl: ingredient.densityGPerMl,
        pieceWeightG: ingredient.pieceWeightG,
      },
    })
    .from(shoppingListItem)
    .leftJoin(ingredient, eq(ingredient.id, shoppingListItem.ingredientId))
    .where(eq(shoppingListItem.listId, id))
    .orderBy(asc(shoppingListItem.createdAt), asc(shoppingListItem.id));
  const items = rows.map(({ ingredient: linked, unit, ...item }) => ({
    ...item,
    unit: unitSchema.safeParse(unit).data ?? null,
    ingredient: item.ingredientId ? linked : null,
  }));
  const recipeIds = [
    ...new Set(
      items.flatMap((i) =>
        i.sources.flatMap((s) => (s.kind === "recipe" ? [s.id] : [])),
      ),
    ),
  ];
  const recipes = recipeIds.length
    ? await db
        .select({ id: recipe.id, title: recipe.title })
        .from(recipe)
        .where(
          and(
            inArray(recipe.id, recipeIds),
            eq(recipe.householdId, householdId),
          ),
        )
    : [];
  return { ...list, items, recipes };
}
