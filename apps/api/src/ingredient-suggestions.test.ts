import { expect, test } from "bun:test";
import { ingredient, ingredientCategory } from "@yumi/db/schema";
import { ingredientInputSchema } from "@yumi/shared";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createAi, readAiConfig } from "./ai";
import { aiServer, completion } from "./ai/test-server";
import { db } from "./db";
import { suggestIngredient } from "./ingredient-suggestions";
import { client, createHousehold, signUp } from "./test/client";

const nutrition = {
  energyKcal: 25,
  proteinG: 0.1,
  fatG: 0,
  carbsG: 5,
  sugarG: 2,
  fiberG: 1,
  saltG: 0.01,
};
const suggestion = {
  nameDe: "Yuzusaft",
  nameEn: "Yuzu juice",
  synonyms: ["Yuzu"],
  categoryKey: "fruit",
  defaultUnit: "ml",
  densityGPerMl: 1,
  pieceWeightG: null,
  nutritionPer100g: nutrition,
  packSizes: [{ quantity: 100, unit: "ml" }],
  icon: null,
};

test("AI ingredient proposals map categories and never save before confirmation", async () => {
  const [category] = await db.select().from(ingredientCategory).limit(1);
  if (!category) throw new Error("Seed category missing");
  const server = aiServer("ollama", ({ model }) =>
    completion(
      "ollama",
      model,
      JSON.stringify({
        ...suggestion,
        categoryKey: category.key,
      }),
    ),
  );
  const before = await db.select({ id: ingredient.id }).from(ingredient);

  const result = await suggestIngredient("Yuzu juice", server.client);

  expect(result).toEqual({
    method: "ai",
    draft: ingredientInputSchema.parse({
      ...suggestion,
      categoryId: category.id,
    }),
  });
  expect(await db.select({ id: ingredient.id }).from(ingredient)).toEqual(
    before,
  );
});

test("AI cannot assign an invented category identifier", async () => {
  const server = aiServer("ollama", ({ model }) =>
    completion(
      "ollama",
      model,
      JSON.stringify({
        ...suggestion,
        categoryKey: crypto.randomUUID(),
      }),
    ),
  );

  const result = await suggestIngredient("Yuzu", server.client);

  expect(result.draft.categoryId).toBeNull();
  expect(result.method).toBe("ai");
});

test.each(["disabled", "invalid-output", "provider-error"])(
  "%s leaves a complete editable manual ingredient draft",
  async (mode) => {
    const server = aiServer("ollama", ({ model }) =>
      mode === "provider-error"
        ? Response.json({ error: { message: "failed" } }, { status: 401 })
        : completion(
            "ollama",
            model,
            JSON.stringify({ ...suggestion, defaultUnit: "bogus" }),
          ),
    );
    const ai = mode === "disabled" ? createAi(readAiConfig({})) : server.client;

    const result = await suggestIngredient("Yuzu", ai);

    expect(result).toEqual({
      method: "manual",
      draft: ingredientInputSchema.parse({ nameDe: "Yuzu", nameEn: "Yuzu" }),
    });
    if (mode === "disabled") expect(server.requests()).toBe(0);
  },
);

test("suggestion endpoints require authentication and reject invalid names", async () => {
  const anonymous = await client().request("/api/ingredients/suggest", {
    method: "POST",
    body: JSON.stringify({ name: "Yuzu" }),
  });
  expect(anonymous.status).toBe(401);
  const c = await signUp(`suggest-${crypto.randomUUID().slice(0, 8)}`);
  const noHousehold = await c.request("/api/ingredients/suggest", {
    method: "POST",
    body: JSON.stringify({ name: "Yuzu" }),
  });
  expect(noHousehold.status).toBe(409);
  await createHousehold(c, "Suggestions");
  const invalid = await c.request("/api/ingredients/suggest", {
    method: "POST",
    body: JSON.stringify({ name: " " }),
  });
  expect(invalid.status).toBe(400);
});

test("confirmed ingredient fields and pack sizes persist only in the active household", async () => {
  const c = await signUp(`confirm-${crypto.randomUUID().slice(0, 8)}`);
  const householdId = await createHousehold(c, "Confirm");
  const draft = ingredientInputSchema.parse(suggestion);

  const response = await c.request("/api/ingredients", {
    method: "POST",
    body: JSON.stringify(draft),
  });

  expect(response.status).toBe(201);
  const saved = ingredientInputSchema
    .and(z.object({ id: z.uuid(), householdId: z.string() }))
    .parse(await response.json());
  expect(saved).toMatchObject({ ...draft, householdId });
  const [stored] = await db
    .select()
    .from(ingredient)
    .where(eq(ingredient.id, saved.id));
  expect(stored?.packSizes).toEqual([{ quantity: 100, unit: "ml" }]);
  const other = await signUp(
    `other-confirm-${crypto.randomUUID().slice(0, 8)}`,
  );
  await createHousehold(other, "Other");
  const hidden = await other.request(`/api/ingredients/${saved.id}`);
  expect(hidden.status).toBe(404);
});

test.each([
  { quantity: 0, unit: "g" },
  { quantity: 500, unit: "invalid" },
])("invalid pack size %j is rejected at confirmation", async (packSize) => {
  const c = await signUp(`pack-${crypto.randomUUID().slice(0, 8)}`);
  await createHousehold(c, "Packs");

  const response = await c.request("/api/ingredients", {
    method: "POST",
    body: JSON.stringify({ nameDe: "Yuzu", packSizes: [packSize] }),
  });

  expect(response.status).toBe(400);
});
