import { describe, expect, test } from "bun:test";
import { formatScaledQuantity, servingsSearch } from "./recipes";

describe("servings display", () => {
  test("keeps spoon fractions readable in both languages", () => {
    expect(formatScaledQuantity(1, "tbsp", 4, 2, "en")).toBe("\u00bd tbsp");
    expect(formatScaledQuantity(1, "tbsp", 4, 2, "de")).toBe("\u00bd EL");
    expect(formatScaledQuantity(1, "tsp", 4, 7, "en")).toBe("1\u00be tsp");
    expect(formatScaledQuantity(1, "cup", 4, 3, "de")).toBe("\u00be Tasse");
  });

  test("formats rounded mass and whole pieces", () => {
    expect(formatScaledQuantity(123, "g", 4, 2, "en")).toBe("60 g");
    expect(formatScaledQuantity(3, "pcs", 4, 2, "en")).toBe("2 pcs");
    expect(formatScaledQuantity(617, "g", 2, 4, "de")).toBe("1,25 kg");
  });

  test("preserves unquantified ingredients and locale-specific decimals", () => {
    expect(formatScaledQuantity(null, "g", 4, 2, "en")).toBeNull();
    expect(formatScaledQuantity(1.5, null, 4, 3, "de")).toBe("1,13");
    expect(formatScaledQuantity(1.5, null, 4, 3, "en")).toBe("1.13");
  });
});

describe("servings URL state", () => {
  test.each(["1", "7", "100"])("accepts %p servings", (value) => {
    expect(servingsSearch({ servings: value })).toEqual({
      servings: Number(value),
    });
  });

  test.each([undefined, "", "0", "101", "2.5", "invalid"])(
    "uses the recipe base servings for invalid URL value %p",
    (value) => {
      expect(servingsSearch({ servings: value })).toEqual({});
    },
  );
});
