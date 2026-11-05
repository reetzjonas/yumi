import {
  cookLog,
  ingredient,
  ingredientCategory,
  leftover,
  mealQueueEntry,
  member,
  pantryItem,
  recipe,
  recipeImage,
  recipeIngredient,
  recipeRating,
  recipeStep,
  recurringItem,
  shoppingEvent,
  shoppingList,
  shoppingListItem,
  store,
} from "@yumi/db/schema";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "../db";
import { household } from "./test-app";

export async function fixture() {
  const source = await household("transfer-source");
  const [category] = await db.select().from(ingredientCategory).limit(1);
  const [global] = await db
    .select()
    .from(ingredient)
    .where(and(isNull(ingredient.householdId), isNotNull(ingredient.key)))
    .limit(1);
  if (!category || !global?.key) throw new Error("catalog seed missing");
  const [owner] = await db
    .select()
    .from(member)
    .where(eq(member.organizationId, source.id));
  if (!owner) throw new Error("household member missing");
  const [custom] = await db
    .insert(ingredient)
    .values({
      householdId: source.id,
      nameDe: "Hausgewürz",
      nameEn: "House spice",
      categoryId: category.id,
      synonyms: ["Spice mix"],
      defaultUnit: "g",
      densityGPerMl: 0.7,
      pieceWeightG: 12,
      nutritionSource: "household",
      nutritionPer100g: {
        energyKcal: 100,
        proteinG: 2,
        fatG: 3,
        carbsG: 10,
        sugarG: 1,
        fiberG: 2,
        saltG: 0.1,
      },
      packSizes: [{ quantity: 100, unit: "g" }],
      icon: "spice",
    })
    .returning();
  if (!custom) throw new Error("custom ingredient missing");
  const [dish] = await db
    .insert(recipe)
    .values({
      householdId: source.id,
      title: "Transfer soup",
      description: "Rich soup",
      servings: 3,
      prepMinutes: 10,
      cookMinutes: 20,
      sourceUrl: "https://example.com/soup",
      language: "en",
      tags: ["soup", "quick"],
      createdBy: owner.userId,
    })
    .returning();
  if (!dish) throw new Error("recipe missing");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
    "base64",
  );
  const image = await new Bun.Image(png).webp().bytes();
  const [photo] = await db
    .insert(recipeImage)
    .values({ recipeId: dish.id, thumb: image, full: image })
    .returning();
  if (!photo) throw new Error("image missing");
  await db
    .update(recipe)
    .set({ imageKey: photo.id })
    .where(eq(recipe.id, dish.id));
  const lines = await db
    .insert(recipeIngredient)
    .values([
      {
        recipeId: dish.id,
        position: 0,
        ingredientId: custom.id,
        rawText: "20 g spice",
        quantity: 20,
        unit: "g",
        section: "Soup",
        note: "fresh",
        optional: true,
        excludeFromNutrition: true,
      },
      {
        recipeId: dish.id,
        position: 1,
        ingredientId: global.id,
        rawText: "100 g ingredient",
        quantity: 100,
        unit: "g",
      },
    ])
    .returning();
  await db.insert(recipeStep).values({
    recipeId: dish.id,
    position: 0,
    text: "Simmer the spices.",
    ingredientRefs: lines.map((line) => line.id),
    ingredientRefsManual: true,
    timers: [{ seconds: 120, label: "Simmer" }],
  });
  const [shop] = await db
    .insert(store)
    .values({
      householdId: source.id,
      name: "Market",
      categoryOrder: [category.id],
      learningResetAt: new Date(),
    })
    .returning();
  if (!shop) throw new Error("store missing");
  const [list] = await db
    .insert(shoppingList)
    .values({
      householdId: source.id,
      name: "Weekend",
      defaultStoreId: shop.id,
    })
    .returning();
  if (!list) throw new Error("list missing");
  const [queued] = await db
    .insert(mealQueueEntry)
    .values({
      householdId: source.id,
      recipeId: dish.id,
      servings: 4,
      position: 0,
      plannedFor: "2026-11-07",
      status: "queued",
    })
    .returning();
  if (!queued) throw new Error("queue missing");
  const [repeated] = await db
    .insert(recurringItem)
    .values({
      householdId: source.id,
      listId: list.id,
      ingredientId: custom.id,
      label: "Weekly spice",
      quantity: 2,
      unit: "g",
      categoryId: category.id,
      weekday: 6,
      intervalWeeks: 2,
      nextDue: "2026-11-07",
    })
    .returning();
  if (!repeated) throw new Error("recurring missing");
  const [item] = await db
    .insert(shoppingListItem)
    .values({
      listId: list.id,
      ingredientId: custom.id,
      label: "Spice",
      quantity: 20,
      unit: "g",
      categoryId: category.id,
      checked: true,
      sources: [
        { kind: "recipe", id: dish.id },
        { kind: "queue", id: queued.id },
        { kind: "recurring", id: repeated.id },
      ],
    })
    .returning();
  if (!item) throw new Error("item missing");
  await db.insert(pantryItem).values([
    { householdId: source.id, ingredientId: global.id },
    { householdId: source.id, ingredientId: custom.id },
  ]);
  await db.insert(leftover).values({
    householdId: source.id,
    ingredientId: custom.id,
    quantity: 80,
    unit: "g",
    sourceEntryIds: [queued.id],
  });
  await db.insert(cookLog).values({
    householdId: source.id,
    recipeId: dish.id,
    userId: owner.userId,
  });
  await db
    .insert(recipeRating)
    .values({ recipeId: dish.id, userId: owner.userId, stars: 5 });
  await db.insert(shoppingEvent).values({
    id: crypto.randomUUID(),
    listId: list.id,
    itemId: item.id,
    type: "item_added",
    payload: { privateAudit: "do-not-transfer" },
    userId: owner.userId,
    storeId: shop.id,
    clientTs: new Date(),
  });
  return {
    ...source,
    global,
    custom,
    dish,
    list,
    queued,
    repeated,
    photo,
    image,
  };
}
