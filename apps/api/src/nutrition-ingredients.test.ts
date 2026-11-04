import { describe, expect, test } from "bun:test";
import { ingredient } from "@yumi/db/schema";
import { nutritionValuesSchema } from "@yumi/shared";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { type Client, householdMember } from "./test/client";

const profile = {
  energyKcal: 210,
  proteinG: 7,
  fatG: 4,
  carbsG: 32,
  sugarG: 3,
  fiberG: 5,
  saltG: 0.12,
};
const responseSchema = z.object({
  id: z.uuid(),
  nutritionPer100g: nutritionValuesSchema.nullable(),
  nutritionSource: z.string().nullable(),
});

async function create(c: Client, values: object) {
  const res = await c.request("/api/ingredients", {
    method: "POST",
    body: JSON.stringify({ nameEn: "Nutrition fixture", ...values }),
  });
  expect(res.status).toBe(201);
  return responseSchema.parse(await res.json());
}

describe("ingredient nutrition persistence", () => {
  test("complete values persist and client provenance is ignored", async () => {
    const c = await householdMember("nutrition-persist");
    const created = await create(c, {
      nutritionPer100g: profile,
      nutritionSource: "forged source",
    });

    const read = await c.request(`/api/ingredients/${created.id}`);

    expect(read.status).toBe(200);
    expect(responseSchema.parse(await read.json())).toEqual({
      id: created.id,
      nutritionPer100g: profile,
      nutritionSource: null,
    });
  });

  test("omitted nutrition is unknown", async () => {
    const c = await householdMember("nutrition-unknown");

    const created = await create(c, {});

    expect(created).toMatchObject({
      nutritionPer100g: null,
      nutritionSource: null,
    });
  });

  test.each([
    ["unchanged", profile, "seed provenance"],
    ["changed", { ...profile, saltG: 0.25 }, null],
    ["cleared", null, null],
  ] as const)(
    "provenance follows %s household nutrition",
    async (name, nutritionPer100g, nutritionSource) => {
      const c = await householdMember(`nutrition-${name}`);
      const created = await create(c, { nutritionPer100g: profile });
      await db
        .update(ingredient)
        .set({ nutritionSource: "seed provenance" })
        .where(eq(ingredient.id, created.id));

      const updated = await c.request(`/api/ingredients/${created.id}`, {
        method: "PUT",
        body: JSON.stringify({
          nameEn: "Renamed ingredient",
          nutritionPer100g,
          nutritionSource: "forged replacement",
        }),
      });

      expect(updated.status).toBe(200);
      expect(responseSchema.parse(await updated.json())).toEqual({
        id: created.id,
        nutritionPer100g,
        nutritionSource,
      });
    },
  );

  test.each([
    { energyKcal: 200 },
    { ...profile, proteinG: -1 },
    { ...profile, energyKcal: 1001 },
    { ...profile, saltG: 101 },
  ])(
    "rejects an incomplete or invalid profile: %p",
    async (nutritionPer100g) => {
      const c = await householdMember(
        `nutrition-invalid-${crypto.randomUUID()}`,
      );

      const result = await c.request("/api/ingredients", {
        method: "POST",
        body: JSON.stringify({ nameEn: "Invalid nutrition", nutritionPer100g }),
      });

      expect(result.status).toBe(400);
    },
  );

  test("recipe detail reports per-serving nutrition and partial coverage", async () => {
    const c = await householdMember("nutrition-recipe");
    const own = await create(c, { nutritionPer100g: profile });
    const [onion] = await db
      .select({
        id: ingredient.id,
        nutritionPer100g: ingredient.nutritionPer100g,
        nutritionSource: ingredient.nutritionSource,
      })
      .from(ingredient)
      .where(eq(ingredient.key, "onion"));
    expect(onion?.nutritionSource).toBe(
      "USDA FoodData Central SR Legacy 2018, FDC 170000",
    );
    const created = await c.request("/api/recipes", {
      method: "POST",
      body: JSON.stringify({
        title: "Nutrition soup",
        servings: 2,
        ingredients: [
          {
            rawText: "200 g fixture",
            quantity: 200,
            unit: "g",
            ingredientId: own.id,
          },
          { rawText: "1 onion", quantity: 1, ingredientId: onion?.id },
          { rawText: "salt to taste" },
        ],
      }),
    });
    expect(created.status).toBe(201);
    const { nutrition } = z
      .object({ nutrition: z.unknown() })
      .parse(await created.json());
    const onionKcal = ((onion?.nutritionPer100g?.energyKcal ?? 0) * 150) / 100;

    expect(nutrition).toMatchObject({
      perServing: { energyKcal: (210 * 2 + onionKcal) / 2 },
      includedIngredients: 2,
      totalIngredients: 3,
      excludedIngredients: [{ position: 2, reason: "quantity" }],
    });
  });

  test("generic recipe lines reach full nutrition coverage after catalog fixes", async () => {
    const c = await householdMember("nutrition-generic-lines");
    const lines = [
      "2 Möhre(n)",
      "250 g Nudeln (kurze)",
      "Salz und Pfeffer",
      "1 Zwiebel(n)",
      "1 Lauchstange(n)",
      "1 EL Öl",
      "300 g Hackfleisch, gemischtes",
      "Currypulver",
      "200 g Schlagsahne",
      "125 ml Brühe",
    ];
    const parsedResponse = await c.request("/api/ingredients/parse", {
      method: "POST",
      body: JSON.stringify({ lines }),
    });
    expect(parsedResponse.status).toBe(200);
    const parsed = z
      .array(
        z.object({
          quantity: z.number().nullable(),
          unit: z.string().nullable(),
          note: z.string().nullable(),
          optional: z.boolean(),
          ingredient: z.object({ id: z.uuid() }).nullable(),
        }),
      )
      .parse(await parsedResponse.json());

    const created = await c.request("/api/recipes", {
      method: "POST",
      body: JSON.stringify({
        title: "Curryrahm-Nudeln",
        servings: 4,
        ingredients: parsed.map((line, index) => ({
          rawText: lines[index],
          quantity: line.quantity,
          unit: line.unit,
          note: line.note,
          optional: line.optional,
          ingredientId: line.ingredient?.id ?? null,
        })),
      }),
    });

    expect(created.status).toBe(201);
    const { nutrition } = z
      .object({ nutrition: z.unknown() })
      .parse(await created.json());
    expect(nutrition).toMatchObject({
      includedIngredients: 8,
      totalIngredients: 10,
      excludedIngredients: [
        { position: 2, reason: "quantity" },
        { position: 7, reason: "quantity" },
      ],
    });
  });

  test("household nutrition cannot overwrite foreign or global ingredients", async () => {
    const owner = await householdMember("nutrition-owner");
    const other = await householdMember("nutrition-other");
    const own = await create(owner, { nutritionPer100g: profile });
    const inserted = await db
      .insert(ingredient)
      .values({
        nameDe: "Global nutrition fixture",
        nameEn: "Global nutrition fixture",
        nutritionPer100g: profile,
        nutritionSource: "global provenance",
      })
      .returning({ id: ingredient.id });
    const [global] = z.tuple([z.object({ id: z.uuid() })]).parse(inserted);

    for (const id of [own.id, global.id]) {
      const update = await other.request(`/api/ingredients/${id}`, {
        method: "PUT",
        body: JSON.stringify({ nameEn: "Overwrite", nutritionPer100g: null }),
      });

      expect(update.status).toBe(404);
      const read = await owner.request(`/api/ingredients/${id}`);
      expect(responseSchema.parse(await read.json())).toMatchObject({
        nutritionPer100g: profile,
        nutritionSource: id === own.id ? null : "global provenance",
      });
    }
  });
});
