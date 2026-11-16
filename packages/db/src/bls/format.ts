import type { NutritionValues } from "@yumi/shared";

/** Column order of the seven values in bls-4.0.json rows. */
export const NUTRIENT_KEYS = [
  "energyKcal",
  "proteinG",
  "fatG",
  "carbsG",
  "sugarG",
  "fiberG",
  "saltG",
] as const satisfies readonly (keyof NutritionValues)[];
