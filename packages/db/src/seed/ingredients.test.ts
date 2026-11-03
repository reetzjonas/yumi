import { expect, test } from "bun:test";
import { SEED_INGREDIENTS } from "./ingredients";

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

test("conversion factors are positive", () => {
  const invalid = SEED_INGREDIENTS.filter(
    (i) =>
      (i.densityGPerMl !== undefined && i.densityGPerMl <= 0) ||
      (i.pieceWeightG !== undefined && i.pieceWeightG <= 0),
  ).map((i) => i.key);
  expect(invalid).toEqual([]);
});
