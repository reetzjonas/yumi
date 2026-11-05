import {
  cookLog,
  ingredient,
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
import type { HouseholdImportResult, HouseholdTransfer } from "@yumi/shared";
import { eq, max } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db";
import { lockQueue } from "../routes/queue";
import { resolveTransferCatalog } from "./import-catalog";
import { readTransferImages } from "./import-images";

function dates<T extends { createdAt: string; updatedAt: string }>(record: T) {
  return {
    ...record,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  };
}

export async function importHousehold(
  householdId: string,
  archive: HouseholdTransfer,
): Promise<HouseholdImportResult> {
  // Decode and validate the bounded image payload before opening a transaction.
  const images = await readTransferImages(archive.images);
  const imageIds = new Map(images.map((image) => [image.recipeId, image.id]));
  return db.transaction(async (tx) => {
    await lockQueue(tx, householdId);
    const { globalId, categoryId } = await resolveTransferCatalog(tx, archive);
    // Separate maps also allow the same archive-local handle in different tables.
    const maps = {
      ingredients: new Map<string, string>(),
      recipes: new Map(
        archive.recipes.map((row) => [row.id, crypto.randomUUID()]),
      ),
      recipeIngredients: new Map(
        archive.recipeIngredients.map((row) => [row.id, crypto.randomUUID()]),
      ),
      stores: new Map(
        archive.stores.map((row) => [row.id, crypto.randomUUID()]),
      ),
      lists: new Map(archive.lists.map((row) => [row.id, crypto.randomUUID()])),
      queue: new Map(archive.queue.map((row) => [row.id, crypto.randomUUID()])),
      recurring: new Map(
        archive.recurring.map((row) => [row.id, crypto.randomUUID()]),
      ),
    };
    const mapped = (table: keyof typeof maps, id: string): string => {
      const value = maps[table].get(id);
      if (!value)
        throw new HTTPException(400, { message: "dangling_reference" });
      return value;
    };
    for (const record of archive.ingredients)
      maps.ingredients.set(
        record.id,
        record.kind === "global" ? globalId(record.key) : crypto.randomUUID(),
      );
    for (const record of archive.ingredients) {
      if (record.kind === "global") continue;
      const { kind: _kind, categoryKey, ...data } = dates(record);
      await tx.insert(ingredient).values({
        ...data,
        id: mapped("ingredients", record.id),
        householdId,
        key: null,
        categoryId: categoryId(categoryKey),
      });
    }
    for (const record of archive.recipes)
      await tx.insert(recipe).values({
        ...dates(record),
        id: mapped("recipes", record.id),
        householdId,
        imageKey: imageIds.get(record.id) ?? null,
      });
    for (const record of archive.recipeIngredients)
      await tx.insert(recipeIngredient).values({
        ...record,
        id: mapped("recipeIngredients", record.id),
        recipeId: mapped("recipes", record.recipeId),
        ingredientId:
          record.ingredientId === null
            ? null
            : mapped("ingredients", record.ingredientId),
      });
    for (const record of archive.steps)
      await tx.insert(recipeStep).values({
        ...record,
        id: crypto.randomUUID(),
        recipeId: mapped("recipes", record.recipeId),
        ingredientRefs: record.ingredientRefs.map((id) =>
          mapped("recipeIngredients", id),
        ),
      });
    for (const image of images) {
      const recipeId = mapped("recipes", image.recipeId);
      await tx.insert(recipeImage).values({ ...image, recipeId });
    }
    for (const record of archive.stores) {
      const { categoryOrder, ...data } = dates(record);
      await tx.insert(store).values({
        ...data,
        id: mapped("stores", record.id),
        householdId,
        categoryOrder: categoryOrder?.map((key) => categoryId(key)) ?? null,
      });
    }
    for (const record of archive.lists)
      await tx.insert(shoppingList).values({
        ...dates(record),
        id: mapped("lists", record.id),
        householdId,
        defaultStoreId:
          record.defaultStoreId === null
            ? null
            : mapped("stores", record.defaultStoreId),
      });
    const [tail] = await tx
      .select({ position: max(mealQueueEntry.position) })
      .from(mealQueueEntry)
      .where(eq(mealQueueEntry.householdId, householdId));
    let position = (tail?.position ?? -1) + 1;
    for (const record of [...archive.queue].sort(
      (a, b) => a.position - b.position,
    ))
      await tx.insert(mealQueueEntry).values({
        ...dates(record),
        id: mapped("queue", record.id),
        householdId,
        recipeId: mapped("recipes", record.recipeId),
        position: position++,
      });
    for (const record of archive.recurring) {
      const { categoryKey, ...data } = dates(record);
      await tx.insert(recurringItem).values({
        ...data,
        id: mapped("recurring", record.id),
        householdId,
        listId: mapped("lists", record.listId),
        ingredientId:
          record.ingredientId === null
            ? null
            : mapped("ingredients", record.ingredientId),
        categoryId: categoryId(categoryKey),
      });
    }
    for (const record of archive.items) {
      const { categoryKey, ...data } = dates(record);
      await tx.insert(shoppingListItem).values({
        ...data,
        id: crypto.randomUUID(),
        listId: mapped("lists", record.listId),
        ingredientId:
          record.ingredientId === null
            ? null
            : mapped("ingredients", record.ingredientId),
        categoryId: categoryId(categoryKey),
        sources: record.sources.map((source) => ({
          kind: source.kind,
          id: mapped(
            (
              {
                recipe: "recipes",
                queue: "queue",
                recurring: "recurring",
              } as const
            )[source.kind],
            source.id,
          ),
        })),
      });
    }
    let pantryCount = 0;
    for (const record of archive.pantry) {
      const inserted = await tx
        .insert(pantryItem)
        .values({
          ...dates(record),
          id: crypto.randomUUID(),
          householdId,
          ingredientId: mapped("ingredients", record.ingredientId),
        })
        .onConflictDoNothing({
          target: [pantryItem.householdId, pantryItem.ingredientId],
        })
        .returning({ id: pantryItem.id });
      pantryCount += inserted.length;
    }
    for (const record of archive.leftovers)
      await tx.insert(leftover).values({
        ...dates(record),
        id: crypto.randomUUID(),
        householdId,
        ingredientId: mapped("ingredients", record.ingredientId),
        sourceEntryIds: record.sourceEntryIds.map((id) => mapped("queue", id)),
      });
    for (const record of archive.cookLogs)
      await tx.insert(cookLog).values({
        id: crypto.randomUUID(),
        householdId,
        recipeId: mapped("recipes", record.recipeId),
        cookedAt: new Date(record.cookedAt),
      });
    return {
      imported: {
        recipes: archive.recipes.length,
        ingredients: archive.ingredients.filter(
          (record) => record.kind === "custom",
        ).length,
        lists: archive.lists.length,
        items: archive.items.length,
        queue: archive.queue.length,
        stores: archive.stores.length,
        pantry: pantryCount,
        recurring: archive.recurring.length,
        leftovers: archive.leftovers.length,
        cookLogs: archive.cookLogs.length,
      },
    };
  });
}
