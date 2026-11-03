import { describe, expect, test } from "bun:test";
import {
  convertQuantity,
  humanizeQuantity,
  parseUnit,
  roundForDisplay,
  UNITS,
  type Unit,
} from "./units";

describe("parseUnit", () => {
  test("every unit code parses to itself", () => {
    for (const unit of UNITS) expect(parseUnit(unit)).toBe(unit);
  });

  test.each([
    ["EL", "tbsp"],
    ["Esslöffel", "tbsp"],
    ["tbsp.", "tbsp"],
    ["TL", "tsp"],
    ["Teaspoons", "tsp"],
    ["Stück", "pcs"],
    ["Stk.", "pcs"],
    ["Päckchen", "pack"],
    ["Pck.", "pack"],
    ["Dose", "can"],
    ["tins", "can"],
    ["Prise", "pinch"],
    ["Bund", "bunch"],
    ["Tassen", "cup"],
    ["Liter", "l"],
    ["Gramm", "g"],
    [" kg ", "kg"],
  ] as const)("%p -> %p", (text, unit) => {
    expect(parseUnit(text)).toBe(unit);
  });

  test("decomposed umlauts are normalized", () => {
    expect(parseUnit("Pa\u0308ckchen")).toBe("pack");
  });

  test("unknown text yields null", () => {
    expect(parseUnit("Mehl")).toBeNull();
    expect(parseUnit("")).toBeNull();
  });
});

describe("convertQuantity", () => {
  test.each([
    [1.5, "kg", "g", 1500],
    [250, "ml", "l", 0.25],
    [1, "tbsp", "tsp", 3],
    [2, "cup", "ml", 480],
    [3, "pack", "pack", 3],
  ] as const)("%p %p -> %p within a dimension", (q, from, to, expected) => {
    expect(convertQuantity(q, from, to)).toBeCloseTo(expected);
  });

  test("volume and mass bridge via density", () => {
    const flour = { densityGPerMl: 0.55 };
    expect(convertQuantity(1, "cup", "g", flour)).toBeCloseTo(132);
    expect(convertQuantity(132, "g", "cup", flour)).toBeCloseTo(1);
  });

  test("count and mass bridge via piece weight", () => {
    const onion = { pieceWeightG: 150 };
    expect(convertQuantity(2, "pcs", "kg", onion)).toBeCloseTo(0.3);
    expect(convertQuantity(450, "g", "pcs", onion)).toBeCloseTo(3);
  });

  test("count and volume bridge via piece weight and density", () => {
    const egg = { pieceWeightG: 50, densityGPerMl: 1 };
    expect(convertQuantity(2, "pcs", "ml", egg)).toBeCloseTo(100);
  });

  test.each([
    [1, "cup", "g"],
    [1, "pcs", "g"],
    [1, "g", "pcs"],
    [1, "pinch", "g"],
    [1, "can", "pack"],
    [1, "bunch", "pcs"],
  ] as const)("%p %p -> %p without factors is null", (q, from, to) => {
    expect(convertQuantity(q, from, to)).toBeNull();
  });

  test("a zero factor counts as missing", () => {
    expect(convertQuantity(1, "l", "g", { densityGPerMl: 0 })).toBeNull();
  });
});

describe("display rounding", () => {
  test.each([
    [123, "g", 125],
    [333, "g", 330],
    [2.3, "g", 2.5],
    [0.1, "g", 0.5],
    [1.33, "pcs", 1.25],
    [4.3, "tbsp", 4.5],
    [12.4, "pcs", 12],
    [0.2, "pinch", 1],
  ] as const)("%p %p rounds to %p", (q, unit, expected) => {
    expect(roundForDisplay(q, unit)).toBe(expected);
  });

  test.each<[number, Unit, number, Unit]>([
    [1234, "g", 1.25, "kg"],
    [999.6, "g", 1, "kg"],
    [0.25, "l", 250, "ml"],
    [0.4, "kg", 400, "g"],
    [1500, "ml", 1.5, "l"],
    [750, "g", 750, "g"],
    [3, "tbsp", 3, "tbsp"],
  ])("%p %p shows as %p %p", (q, unit, quantity, expectedUnit) => {
    expect(humanizeQuantity(q, unit)).toEqual({
      quantity,
      unit: expectedUnit,
    });
  });
});
