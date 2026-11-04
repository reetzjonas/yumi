import { z } from "zod";
import { convertQuantity, type Unit } from "./units";

const grams = z.number().finite().min(0).max(100);

export const nutritionValuesSchema = z.object({
  energyKcal: z.number().finite().min(0).max(1000),
  proteinG: grams,
  fatG: grams,
  carbsG: grams,
  sugarG: grams,
  fiberG: grams,
  saltG: grams,
});

export type NutritionValues = Readonly<z.infer<typeof nutritionValuesSchema>>;

const nutrientKeys = nutritionValuesSchema.keyof().options;

/** Scales per-serving values to a chosen number of portions. */
export function nutritionForPortions(
  perServing: NutritionValues,
  portions: number,
): NutritionValues {
  return {
    energyKcal: perServing.energyKcal * portions,
    proteinG: perServing.proteinG * portions,
    fatG: perServing.fatG * portions,
    carbsG: perServing.carbsG * portions,
    sugarG: perServing.sugarG * portions,
    fiberG: perServing.fiberG * portions,
    saltG: perServing.saltG * portions,
  };
}

export type RecipeNutritionLine = {
  readonly quantity: number | null;
  readonly unit: Unit | null;
  readonly ingredient: {
    readonly nutritionPer100g: NutritionValues | null;
    readonly densityGPerMl: number | null;
    readonly pieceWeightG: number | null;
  } | null;
  /** Intentionally left out, e.g. salt and pepper to taste. */
  readonly excludeFromNutrition?: boolean;
};

export type RecipeNutrition = {
  readonly perServing: NutritionValues;
  readonly includedIngredients: number;
  readonly totalIngredients: number;
  readonly ignoredIngredients: number;
  readonly excludedIngredients: readonly {
    readonly position: number;
    readonly reason: "quantity" | "nutrition" | "conversion";
  }[];
};

/** Base quantities cover the whole recipe; servings must be positive. */
export function calculateRecipeNutrition(
  lines: readonly RecipeNutritionLine[],
  servings: number,
): RecipeNutrition | null {
  // Mutable accumulator; a zero profile here never supplies missing nutrition.
  const perServing = {
    energyKcal: 0,
    proteinG: 0,
    fatG: 0,
    carbsG: 0,
    sugarG: 0,
    fiberG: 0,
    saltG: 0,
  };
  const excludedIngredients: {
    position: number;
    reason: "quantity" | "nutrition" | "conversion";
  }[] = [];
  let includedIngredients = 0;
  let ignoredIngredients = 0;

  for (const [position, line] of lines.entries()) {
    if (line.excludeFromNutrition) {
      ignoredIngredients += 1;
      continue;
    }
    if (line.quantity === null) {
      excludedIngredients.push({ position, reason: "quantity" });
      continue;
    }
    const ingredient = line.ingredient;
    if (ingredient === null || ingredient.nutritionPer100g === null) {
      excludedIngredients.push({ position, reason: "nutrition" });
      continue;
    }
    const weight = convertQuantity(
      line.quantity,
      line.unit ?? "pcs",
      "g",
      ingredient,
    );
    if (weight === null) {
      excludedIngredients.push({ position, reason: "conversion" });
      continue;
    }
    const profile = ingredient.nutritionPer100g;
    for (const nutrient of nutrientKeys) {
      perServing[nutrient] += (profile[nutrient] * weight) / 100 / servings;
    }
    includedIngredients += 1;
  }

  if (includedIngredients === 0) return null;
  return {
    perServing,
    includedIngredients,
    totalIngredients: lines.length - ignoredIngredients,
    ignoredIngredients,
    excludedIngredients,
  };
}
