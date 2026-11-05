import {
  cookLog,
  ingredient,
  ingredientCategory,
  leftover,
  mealQueueEntry,
  pantryItem,
  recipe,
  recipeImage,
  recipeIngredient,
  recipeStep,
  recurringItem,
  shoppingList,
  shoppingListItem,
  store,
} from "@yumi/db/schema";
import {
  HOUSEHOLD_TRANSFER_MAX_IMAGE_BYTES,
  type HouseholdTransfer,
} from "@yumi/shared";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db";
import { ownedData, serializeArchive } from "./export-format";

const LIMIT = 10_001;

export async function exportHousehold(
  householdId: string,
): Promise<HouseholdTransfer> {
  return db.transaction(
    async (tx) => {
      const recipes = await tx
        .select()
        .from(recipe)
        .where(eq(recipe.householdId, householdId))
        .limit(LIMIT);
      const recipeIngredients = (
        await tx
          .select({ row: recipeIngredient })
          .from(recipeIngredient)
          .innerJoin(recipe, eq(recipe.id, recipeIngredient.recipeId))
          .where(eq(recipe.householdId, householdId))
          .limit(LIMIT)
      ).map(({ row }) => row);
      const steps = (
        await tx
          .select({ row: recipeStep })
          .from(recipeStep)
          .innerJoin(recipe, eq(recipe.id, recipeStep.recipeId))
          .where(eq(recipe.householdId, householdId))
          .limit(LIMIT)
      ).map(({ row }) => row);
      const imageSize = await tx
        .select({
          bytes: sql<number>`coalesce(sum(octet_length(${recipeImage.thumb}) + octet_length(${recipeImage.full})), 0)::bigint`,
        })
        .from(recipeImage)
        .innerJoin(recipe, eq(recipe.id, recipeImage.recipeId))
        .where(eq(recipe.householdId, householdId));
      if (Number(imageSize[0]?.bytes) > HOUSEHOLD_TRANSFER_MAX_IMAGE_BYTES)
        throw new HTTPException(413, {
          message: "household_transfer_too_large",
        });
      const images = (
        await tx
          .select({ row: recipeImage })
          .from(recipeImage)
          .innerJoin(recipe, eq(recipe.id, recipeImage.recipeId))
          .where(eq(recipe.householdId, householdId))
          .limit(LIMIT)
      ).map(({ row }) => row);
      const stores = await tx
        .select()
        .from(store)
        .where(eq(store.householdId, householdId))
        .limit(LIMIT);
      const lists = await tx
        .select()
        .from(shoppingList)
        .where(eq(shoppingList.householdId, householdId))
        .limit(LIMIT);
      const items = (
        await tx
          .select({ row: shoppingListItem })
          .from(shoppingListItem)
          .innerJoin(shoppingList, eq(shoppingList.id, shoppingListItem.listId))
          .where(eq(shoppingList.householdId, householdId))
          .limit(LIMIT)
      ).map(({ row }) => row);
      const queue = await tx
        .select()
        .from(mealQueueEntry)
        .where(eq(mealQueueEntry.householdId, householdId))
        .limit(LIMIT);
      const pantry = await tx
        .select()
        .from(pantryItem)
        .where(eq(pantryItem.householdId, householdId))
        .limit(LIMIT);
      const recurring = await tx
        .select()
        .from(recurringItem)
        .where(eq(recurringItem.householdId, householdId))
        .limit(LIMIT);
      const leftovers = await tx
        .select()
        .from(leftover)
        .where(eq(leftover.householdId, householdId))
        .limit(LIMIT);
      const cookLogs = await tx
        .select()
        .from(cookLog)
        .where(eq(cookLog.householdId, householdId))
        .limit(LIMIT);
      const referencedIngredients = [
        ...recipeIngredients,
        ...items,
        ...pantry,
        ...recurring,
        ...leftovers,
      ].flatMap((record) => (record.ingredientId ? [record.ingredientId] : []));
      const ingredients = await tx
        .select()
        .from(ingredient)
        .where(
          or(
            eq(ingredient.householdId, householdId),
            and(
              isNull(ingredient.householdId),
              inArray(ingredient.id, referencedIngredients),
            ),
          ),
        )
        .limit(LIMIT);
      const ingredientIds = new Set(ingredients.map((record) => record.id));
      if (referencedIngredients.some((id) => !ingredientIds.has(id)))
        throw new HTTPException(422, {
          message: "invalid_household_reference",
        });
      const categories = await tx.select().from(ingredientCategory);
      const categoryKeys = new Map(
        categories.map((record) => [record.id, record.key]),
      );
      const categoryKey = (id: string | null) => {
        if (id === null) return null;
        const key = categoryKeys.get(id);
        if (!key)
          throw new HTTPException(422, { message: "unavailable_category" });
        return key;
      };
      const recipeIds = new Set(recipes.map((record) => record.id));
      const queueIds = new Set(queue.map((record) => record.id));
      const recurringIds = new Set(recurring.map((record) => record.id));
      const ingredientRecipes = new Map(
        recipeIngredients.map((record) => [record.id, record.recipeId]),
      );
      const archive = {
        format: "yumi-household",
        version: 1,
        exportedAt: new Date().toISOString(),
        ingredients: ingredients.map((record) => {
          if (record.householdId === null) {
            if (!record.key)
              throw new HTTPException(422, {
                message: "unavailable_global_ingredient",
              });
            return { id: record.id, kind: "global", key: record.key };
          }
          const { categoryId, key: _key, ...data } = ownedData(record);
          return {
            ...data,
            kind: "custom",
            categoryKey: categoryKey(categoryId),
          };
        }),
        recipes: recipes.map((record) => {
          const {
            imageKey: _imageKey,
            createdBy: _createdBy,
            ...data
          } = ownedData(record);
          return data;
        }),
        images: images.map((record) => ({
          recipeId: record.recipeId,
          thumb: Buffer.from(record.thumb).toString("base64"),
          full: Buffer.from(record.full).toString("base64"),
        })),
        recipeIngredients,
        steps: steps.map((record) => ({
          ...record,
          ingredientRefs: record.ingredientRefs.filter(
            (id) => ingredientRecipes.get(id) === record.recipeId,
          ),
        })),
        stores: stores.map((record) => {
          const {
            learningResetAt: _learningResetAt,
            categoryOrder,
            ...data
          } = ownedData(record);
          return {
            ...data,
            categoryOrder: categoryOrder?.map((id) => categoryKey(id)) ?? null,
          };
        }),
        lists: lists.map(ownedData),
        items: items.map(({ categoryId, ...record }) => ({
          ...record,
          categoryKey: categoryKey(categoryId),
          sources: record.sources.filter((source) =>
            ({ recipe: recipeIds, queue: queueIds, recurring: recurringIds })[
              source.kind
            ].has(source.id),
          ),
        })),
        queue: queue.map(ownedData),
        pantry: pantry.map(ownedData),
        recurring: recurring.map((record) => {
          const { categoryId, ...data } = ownedData(record);
          return { ...data, categoryKey: categoryKey(categoryId) };
        }),
        leftovers: leftovers.map((record) => ({
          ...ownedData(record),
          sourceEntryIds: record.sourceEntryIds.filter((id) =>
            queueIds.has(id),
          ),
        })),
        cookLogs: cookLogs.map(({ id, recipeId, cookedAt }) => ({
          id,
          recipeId,
          cookedAt,
        })),
      };
      return serializeArchive(archive);
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
