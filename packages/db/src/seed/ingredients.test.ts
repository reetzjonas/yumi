import { expect, test } from "bun:test";
import { nutritionValuesSchema, pictogramFile } from "@yumi/shared";
import { blsFood } from "../bls";
import { BLS_CODES } from "./bls-codes";
import { SEED_CATEGORIES } from "./categories";
import {
  SEED_CONVERSION_ESTIMATES,
  SEED_NUTRITION_ESTIMATES,
} from "./estimates";
import { conversionFor, nutritionFor } from "./index";
import { SEED_INGREDIENTS } from "./ingredients";
import { SEED_NUTRITION } from "./nutrition";

function duplicates(values: string[]) {
  const seen = new Set<string>();
  return values.filter((v) => seen.size === seen.add(v).size);
}

test("seed keys and names are unique", () => {
  expect(duplicates(SEED_INGREDIENTS.map((i) => i.key))).toEqual([]);
  expect(duplicates(SEED_INGREDIENTS.map((i) => i.de.toLowerCase()))).toEqual(
    [],
  );
  expect(duplicates(SEED_INGREDIENTS.map((i) => i.en.toLowerCase()))).toEqual(
    [],
  );
});

test("seed keys are kebab-case slugs", () => {
  const invalid = SEED_INGREDIENTS.map((i) => i.key).filter(
    (k) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(k),
  );
  expect(invalid).toEqual([]);
});

test("seed nutrition belongs to catalog keys and holds complete profiles", () => {
  const keys = new Set(SEED_INGREDIENTS.map((i) => i.key));
  const invalid = Object.entries(SEED_NUTRITION)
    .filter(
      ([key, { values }]) =>
        !keys.has(key) || !nutritionValuesSchema.safeParse(values).success,
    )
    .map(([key]) => key);
  expect(invalid).toEqual([]);
});

test("BLS codes belong to catalog keys and resolve to a generated profile", () => {
  const keys = new Set(SEED_INGREDIENTS.map((i) => i.key));
  const invalid = Object.entries(BLS_CODES)
    .filter(([key, code]) => !keys.has(key) || !blsFood(code))
    .map(([key]) => key);
  expect(invalid).toEqual([]);
});

test("BLS profiles win over estimates and USDA", () => {
  const pastry = nutritionFor("puff-pastry");
  expect(pastry.nutritionPer100g).toBe(blsFood("D072000")?.values ?? null);
  expect(pastry.nutritionSource).toBe(
    "BLS 4.0 (Max Rubner-Institut, CC BY 4.0), D072000 Blätterteig eifrei, roh",
  );
  expect(nutritionFor("quark").nutritionSource).toStartWith("BLS 4.0");
});

test("conversion factors are positive", () => {
  const invalid = SEED_INGREDIENTS.filter(
    (i) =>
      (i.densityGPerMl !== undefined && i.densityGPerMl <= 0) ||
      (i.pieceWeightG !== undefined && i.pieceWeightG <= 0),
  ).map((i) => i.key);
  expect(invalid).toEqual([]);
});

test("all seed ingredient and category icons have bundled pictograms", () => {
  const invalid = [
    ...SEED_INGREDIENTS,
    ...Object.values(SEED_CATEGORIES),
  ].filter((entry) => entry.icon && !pictogramFile(entry.icon));
  expect(invalid).toEqual([]);
});

test("estimates belong to catalog keys, are complete and never shadow a USDA profile", () => {
  const keys = new Set(SEED_INGREDIENTS.map((i) => i.key));
  const invalid = [
    ...Object.entries(SEED_NUTRITION_ESTIMATES)
      .filter(
        ([key, values]) =>
          !keys.has(key) ||
          key in SEED_NUTRITION ||
          !nutritionValuesSchema.safeParse(values).success,
      )
      .map(([key]) => key),
    ...Object.keys(SEED_CONVERSION_ESTIMATES).filter((key) => !keys.has(key)),
  ];
  expect(invalid).toEqual([]);
});

test("estimated macronutrients fit into 100 g and roughly explain the energy", () => {
  const invalid = Object.entries(SEED_NUTRITION_ESTIMATES)
    // Alcohol carries energy outside the three macronutrients.
    .filter(([key]) => key !== "sparkling-wine")
    .filter(([, v]) => {
      const mass = v.proteinG + v.fatG + v.carbsG + v.fiberG + v.saltG;
      const energy = 4 * v.proteinG + 9 * v.fatG + 4 * v.carbsG + 2 * v.fiberG;
      return (
        mass > 100 ||
        v.sugarG > v.carbsG ||
        Math.abs(energy - v.energyKcal) > Math.max(40, v.energyKcal * 0.35)
      );
    })
    .map(([key]) => key);
  expect(invalid).toEqual([]);
});

test("food with nutrition in a counted default unit can be weighed", () => {
  const unweighable = SEED_INGREDIENTS.filter((i) => {
    if (nutritionFor(i.key).nutritionPer100g === null) return false;
    const factors = conversionFor(i);
    if (i.unit === "pcs") return factors.pieceWeightG === null;
    if (i.unit === "bunch" || i.unit === "can" || i.unit === "pack")
      return factors.packSizes.length === 0;
    return false;
  }).map((i) => i.key);
  expect(unweighable).toEqual([]);
});
