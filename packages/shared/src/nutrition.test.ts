import { describe, expect, test } from "bun:test";
import { ingredientInputSchema } from "./catalog";
import {
  calculateRecipeNutrition,
  type NutritionValues,
  nutritionValuesSchema,
  type RecipeNutritionLine,
} from "./nutrition";

const profile: NutritionValues = {
  energyKcal: 200,
  proteinG: 12,
  fatG: 8,
  carbsG: 30,
  sugarG: 4,
  fiberG: 6,
  saltG: 0.25,
};
const ingredient = {
  nutritionPer100g: profile,
  densityGPerMl: 0.8,
  pieceWeightG: 50,
};
const line: RecipeNutritionLine = { quantity: 100, unit: "g", ingredient };

describe("nutrition input", () => {
  test("missing nutrition stays unknown while a complete profile is retained", () => {
    expect(
      ingredientInputSchema.parse({ nameEn: "Unknown" }).nutritionPer100g,
    ).toBeNull();
    expect(nutritionValuesSchema.parse(profile)).toEqual(profile);
  });

  test.each([
    "energyKcal",
    "proteinG",
    "fatG",
    "carbsG",
    "sugarG",
    "fiberG",
    "saltG",
  ] as const)(
    "%s must be present, finite, nonnegative, and within its cap",
    (key) => {
      const { [key]: _omitted, ...incomplete } = profile;
      expect(nutritionValuesSchema.safeParse(incomplete).success).toBe(false);
      for (const value of [-1, Number.NaN, Infinity, -Infinity]) {
        expect(
          nutritionValuesSchema.safeParse({ ...profile, [key]: value }).success,
        ).toBe(false);
      }
      const cap = key === "energyKcal" ? 1000 : 100;
      expect(
        nutritionValuesSchema.safeParse({ ...profile, [key]: cap }).success,
      ).toBe(true);
      expect(
        nutritionValuesSchema.safeParse({ ...profile, [key]: cap + 0.01 })
          .success,
      ).toBe(false);
    },
  );
});

describe("calculateRecipeNutrition", () => {
  test.each([
    ["g", 33, 33],
    ["kg", 0.25, 250],
    ["ml", 125, 100],
    ["l", 0.5, 400],
    ["tbsp", 2, 24],
    ["tsp", 2, 8],
    ["cup", 1, 192],
    ["pcs", 3, 150],
    [null, 2, 100],
  ] as const)(
    "converts %s to grams before dividing the whole recipe by servings",
    (unit, quantity, grams) => {
      const result = calculateRecipeNutrition(
        [{ quantity, unit, ingredient }],
        3,
      );

      expect(result).toEqual({
        perServing: {
          energyKcal: (200 * grams) / 100 / 3,
          proteinG: (12 * grams) / 100 / 3,
          fatG: (8 * grams) / 100 / 3,
          carbsG: (30 * grams) / 100 / 3,
          sugarG: (4 * grams) / 100 / 3,
          fiberG: (6 * grams) / 100 / 3,
          saltG: (0.25 * grams) / 100 / 3,
        },
        includedIngredients: 1,
        totalIngredients: 1,
        excludedIngredients: [],
      });
    },
  );

  test("aggregates only covered lines and explains every excluded position", () => {
    const result = calculateRecipeNutrition(
      [
        line,
        { ...line, quantity: null },
        { ...line, ingredient: null },
        { ...line, ingredient: { ...ingredient, nutritionPer100g: null } },
        {
          ...line,
          unit: "ml",
          ingredient: { ...ingredient, densityGPerMl: null },
        },
        {
          ...line,
          unit: null,
          ingredient: { ...ingredient, pieceWeightG: null },
        },
        { ...line, quantity: 50 },
      ],
      2,
    );

    expect(result).toEqual({
      perServing: {
        energyKcal: 150,
        proteinG: 9,
        fatG: 6,
        carbsG: 22.5,
        sugarG: 3,
        fiberG: 4.5,
        saltG: 0.1875,
      },
      includedIngredients: 2,
      totalIngredients: 7,
      excludedIngredients: [
        { position: 1, reason: "quantity" },
        { position: 2, reason: "nutrition" },
        { position: 3, reason: "nutrition" },
        { position: 4, reason: "conversion" },
        { position: 5, reason: "conversion" },
      ],
    });
  });

  test.each(["pinch", "bunch", "can", "pack"] as const)(
    "%s has no assumed gram weight even with density and piece weight",
    (unit) => {
      const result = calculateRecipeNutrition([line, { ...line, unit }], 1);

      expect(result).toMatchObject({
        perServing: profile,
        includedIngredients: 1,
        excludedIngredients: [{ position: 1, reason: "conversion" }],
      });
    },
  );

  test.each([
    { lines: [] },
    { lines: [{ ...line, quantity: null }] },
    { lines: [{ ...line, ingredient: null }] },
    { lines: [{ ...line, unit: "pack" }] },
  ] satisfies readonly { readonly lines: readonly RecipeNutritionLine[] }[])(
    "returns no estimate when no line has usable data: %p",
    ({ lines }) => {
      expect(calculateRecipeNutrition(lines, 2)).toBeNull();
    },
  );

  test("known zero quantities and complete zero profiles still count as covered", () => {
    const zeroProfile: NutritionValues = {
      energyKcal: 0,
      proteinG: 0,
      fatG: 0,
      carbsG: 0,
      sugarG: 0,
      fiberG: 0,
      saltG: 0,
    };

    const result = calculateRecipeNutrition(
      [
        { ...line, quantity: 0 },
        {
          ...line,
          ingredient: { ...ingredient, nutritionPer100g: zeroProfile },
        },
      ],
      2,
    );

    expect(result).toEqual({
      perServing: zeroProfile,
      includedIngredients: 2,
      totalIngredients: 2,
      excludedIngredients: [],
    });
  });
});
