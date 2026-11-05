import { expect } from "bun:test";
import { ingredient, recipeImage } from "@yumi/db/schema";
import { z } from "zod";
import { db } from "../db";
import { type Client, householdMember } from "./client";

export const linkSchema = z.object({
  id: z.uuid(),
  token: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.string().nullable(),
});
export const idSchema = z.object({ id: z.uuid() });
export const detailSchema = idSchema.extend({
  title: z.string(),
  imageKey: z.string().nullable(),
  ingredients: z.array(
    z.object({
      id: z.uuid(),
      rawText: z.string(),
      ingredientId: z.uuid().nullable(),
      excludeFromNutrition: z.boolean(),
    }),
  ),
  steps: z.array(
    z.object({
      text: z.string(),
      ingredientRefs: z.array(z.uuid()),
      ingredientPositions: z.array(z.number()).nullable(),
    }),
  ),
});

export async function fixture(name: string) {
  const owner = await householdMember(name);
  const me = z
    .object({ activeHouseholdId: z.string() })
    .parse(await (await owner.request("/api/me")).json());
  const [custom] = await db
    .insert(ingredient)
    .values({
      householdId: me.activeHouseholdId,
      nameDe: "Geheime Gewürzmischung",
      nameEn: "Secret spice blend",
      synonyms: ["House blend"],
      defaultUnit: "g",
      densityGPerMl: 0.8,
    })
    .returning({ id: ingredient.id });
  if (!custom) throw new Error("fixture ingredient missing");
  const response = await owner.request("/api/recipes", {
    method: "POST",
    body: JSON.stringify({
      title: "Shared soup",
      description: "A household recipe",
      servings: 3,
      ingredients: [
        {
          rawText: "2 g spice blend",
          quantity: 2,
          unit: "g",
          ingredientId: custom.id,
          excludeFromNutrition: true,
        },
        { rawText: "Water" },
        { rawText: "1 g spice blend", ingredientId: custom.id },
      ],
      steps: [{ text: "Mix the spice blend.", ingredientPositions: [0, 2] }],
    }),
  });
  expect(response.status).toBe(201);
  const recipe = detailSchema.parse(await response.json());
  await db.insert(recipeImage).values({
    recipeId: recipe.id,
    thumb: new Uint8Array([1, 2, 3]),
    full: new Uint8Array([4, 5, 6]),
  });
  return { owner, recipe, customId: custom.id };
}

export async function createShare(owner: Client, id: string) {
  const response = await owner.request(`/api/recipes/${id}/shares`, {
    method: "POST",
    body: JSON.stringify({ expiresAt: null }),
  });
  expect(response.status).toBe(201);
  return linkSchema.parse(await response.json());
}
