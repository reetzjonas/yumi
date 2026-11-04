import { describe, expect, test } from "bun:test";
import { scaleRecipeQuantity } from "./servings";
import type { Unit } from "./units";

describe("scaleRecipeQuantity", () => {
  test.each([null, "g", "pcs", "tbsp"] as const)(
    "preserves a missing quantity with unit %p",
    (unit) => {
      const scaled = scaleRecipeQuantity(null, unit, 4, 7);

      expect(scaled).toBeNull();
    },
  );

  test.each([
    [250, 4, 8, 500],
    [250, 4, 2, 125],
    [1.25, 2, 3, 1.875],
    [0.125, 3, 3, 0.125],
  ])(
    "scales a unitless quantity %p from %p to %p servings without rounding",
    (quantity, baseServings, servings, expected) => {
      const scaled = scaleRecipeQuantity(
        quantity,
        null,
        baseServings,
        servings,
      );

      expect(scaled).toBe(expected);
    },
  );

  test.each([
    [3, 4, 2, 2],
    [2, 3, 2, 1],
    [1, 100, 1, 1],
    [2, 4, 8, 4],
    [2, 2, 2, 2],
  ])(
    "keeps %p pieces whole when scaling from %p to %p servings",
    (quantity, baseServings, servings, expected) => {
      const scaled = scaleRecipeQuantity(
        quantity,
        "pcs",
        baseServings,
        servings,
      );

      expect(scaled).toBe(expected);
    },
  );

  test.each(["tbsp", "tsp", "cup"] as const)(
    "keeps practical fractions for %p",
    (unit) => {
      const scaled = scaleRecipeQuantity(1, unit, 4, 3);

      expect(scaled).toBe(0.75);
    },
  );

  test.each<[number, Unit, number, number, number]>([
    [1, "tbsp", 3, 1, 0.25],
    [0.5, "tsp", 100, 1, 0.25],
    [3, "cup", 4, 2, 1.5],
    [4.3, "tbsp", 1, 1, 4.5],
    [2, "pinch", 4, 1, 1],
    [1, "bunch", 4, 1, 0.25],
    [1, "can", 4, 2, 0.5],
    [1, "pack", 4, 3, 0.75],
  ])(
    "rounds %p %p from %p to %p servings to %p",
    (quantity, unit, baseServings, servings, expected) => {
      const scaled = scaleRecipeQuantity(
        quantity,
        unit,
        baseServings,
        servings,
      );

      expect(scaled).toBe(expected);
    },
  );

  test.each<[number, Unit, number, number, number]>([
    [123, "g", 4, 2, 60],
    [333, "ml", 2, 3, 500],
    [617, "g", 2, 4, 1250],
    [750, "ml", 2, 4, 1500],
    [0.246, "kg", 4, 2, 0.125],
    [0.246, "l", 4, 2, 0.125],
    [0.001, "kg", 2, 1, 0.0005],
    [0.001, "l", 2, 1, 0.0005],
    [999.6, "g", 2, 2, 1000],
  ])(
    "humanizes scaled %p %p from %p to %p servings in the original unit",
    (quantity, unit, baseServings, servings, expected) => {
      const scaled = scaleRecipeQuantity(
        quantity,
        unit,
        baseServings,
        servings,
      );

      expect(scaled).toBeCloseTo(expected, 10);
    },
  );

  test("uses the original quantity after repeated servings changes", () => {
    const originalQuantity = 1;
    const baseServings = 3;
    const targets = [2, 4, 1, 3, 2];

    const scaled = targets.map((servings) =>
      scaleRecipeQuantity(originalQuantity, "tbsp", baseServings, servings),
    );

    expect(scaled).toEqual([0.75, 1.25, 0.25, 1, 0.75]);
  });
});
