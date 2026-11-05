import { describe, expect, test } from "bun:test";
import {
  mealQueueEntry,
  pantryItem,
  recipe,
  recipeImage,
} from "@yumi/db/schema";
import {
  householdImportResultSchema,
  householdTransferSchema,
} from "@yumi/shared";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { exported, household, request } from "./test-app";
import { fixture } from "./test-fixtures";

describe("household transfer roundtrip", () => {
  test("roundtrips complete household state, image bytes and remapped references additively", async () => {
    const source = await fixture();
    const target = await household("transfer-target");
    const [existing] = await db
      .insert(recipe)
      .values({ householdId: target.id, title: "Keep existing" })
      .returning();
    if (!existing) throw new Error("existing recipe missing");
    await db.insert(mealQueueEntry).values({
      householdId: target.id,
      recipeId: existing.id,
      servings: 2,
      position: 5,
    });
    await db
      .insert(pantryItem)
      .values({ householdId: target.id, ingredientId: source.global.id });
    const archive = await exported(source.c);
    const originalRecipe = archive.recipes[0];
    if (!originalRecipe) throw new Error("exported recipe missing");
    const serialized = JSON.stringify(archive);
    expect(serialized).not.toContain(source.id);
    expect(serialized).not.toContain("userId");
    expect(serialized).not.toContain("createdBy");
    expect(serialized).not.toContain("do-not-transfer");
    expect(serialized).not.toContain("stars");
    expect(serialized).not.toContain("learningResetAt");
    // Global IDs deliberately differ from the destination catalog's IDs.
    const globalHandle = crypto.randomUUID();
    const portable = householdTransferSchema.parse(
      JSON.parse(serialized.replaceAll(source.global.id, globalHandle)),
    );
    const response = await request(target.c, "import", portable);
    expect(response.status).toBe(201);
    const result = householdImportResultSchema.parse(await response.json());
    expect(result.imported).toEqual({
      recipes: 1,
      ingredients: 1,
      lists: 1,
      items: 1,
      queue: 1,
      stores: 1,
      pantry: 1,
      recurring: 1,
      leftovers: 1,
      cookLogs: 1,
    });
    const imported = await exported(target.c);
    const dish = imported.recipes.find(
      (record) => record.title === source.dish.title,
    );
    const custom = imported.ingredients.find(
      (record) => record.kind === "custom",
    );
    const queue = imported.queue.find((record) => record.recipeId === dish?.id);
    expect(dish).toBeDefined();
    expect(custom).toBeDefined();
    expect(queue).toBeDefined();
    if (!dish || !custom || !queue) throw new Error("import missing");
    expect(dish.id).not.toBe(source.dish.id);
    expect(custom.id).not.toBe(source.custom.id);
    expect(dish.tags).toEqual(["soup", "quick"]);
    expect(dish.createdAt).toBe(originalRecipe.createdAt);
    expect(dish.updatedAt).toBe(originalRecipe.updatedAt);
    expect(custom).toMatchObject({
      kind: "custom",
      packSizes: [{ quantity: 100, unit: "g" }],
      nutritionSource: "household",
      pieceWeightG: 12,
    });
    expect(queue.position).toBe(6);
    expect(imported.recipes.some((record) => record.id === existing.id)).toBe(
      true,
    );
    const line = imported.recipeIngredients.find(
      (record) => record.ingredientId === custom.id,
    );
    expect(line).toMatchObject({
      recipeId: dish.id,
      optional: true,
      excludeFromNutrition: true,
      note: "fresh",
    });
    expect(
      imported.recipeIngredients.some(
        (record) => record.ingredientId === source.global.id,
      ),
    ).toBe(true);
    const step = imported.steps[0];
    expect(step?.ingredientRefs).toEqual(
      imported.recipeIngredients.map((record) => record.id),
    );
    expect(step).toMatchObject({
      recipeId: dish.id,
      ingredientRefsManual: true,
      timers: [{ seconds: 120, label: "Simmer" }],
    });
    expect(imported.images[0]).toEqual({
      recipeId: dish.id,
      thumb: Buffer.from(source.image).toString("base64"),
      full: Buffer.from(source.image).toString("base64"),
    });
    const [dbDish] = await db
      .select()
      .from(recipe)
      .where(eq(recipe.id, dish.id));
    const [dbImage] = await db
      .select()
      .from(recipeImage)
      .where(eq(recipeImage.recipeId, dish.id));
    expect(dbDish?.imageKey).toBe(dbImage?.id);
    expect(dbImage?.id).not.toBe(source.photo.id);
    expect(imported.lists[0]?.defaultStoreId).toBe(imported.stores[0]?.id);
    expect(imported.stores[0]?.categoryOrder).toEqual(
      archive.stores[0]?.categoryOrder,
    );
    expect(imported.recurring[0]).toMatchObject({
      listId: imported.lists[0]?.id,
      ingredientId: custom.id,
      weekday: 6,
      intervalWeeks: 2,
      nextDue: "2026-11-07",
    });
    expect(imported.items[0]).toMatchObject({
      listId: imported.lists[0]?.id,
      ingredientId: custom.id,
      checked: true,
      sources: [
        { kind: "recipe", id: dish.id },
        { kind: "queue", id: queue.id },
        { kind: "recurring", id: imported.recurring[0]?.id },
      ],
    });
    expect(imported.leftovers[0]).toMatchObject({
      ingredientId: custom.id,
      quantity: 80,
      sourceEntryIds: [queue.id],
    });
    expect(imported.pantry).toHaveLength(2);
    expect(imported.cookLogs[0]?.recipeId).toBe(dish.id);
    expect((await exported(source.c)).recipes).toEqual(archive.recipes);
    const again = await request(target.c, "import", portable);
    expect(again.status).toBe(201);
    expect((await exported(target.c)).recipes).toHaveLength(3);
  });
});
