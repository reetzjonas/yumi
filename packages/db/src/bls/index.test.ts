import { expect, test } from "bun:test";
import { nutritionValuesSchema } from "@yumi/shared";
import { BLS_CODES } from "../seed/bls-codes";
import { blsFood, searchBls } from "./index";

const codes = (query: string, limit = 5) =>
  searchBls(query, limit).map((food) => food.code);

test("every catalog BLS code resolves to a complete profile", () => {
  const invalid = Object.values(BLS_CODES).filter(
    (code) => !nutritionValuesSchema.safeParse(blsFood(code)?.values).success,
  );
  expect(invalid).toEqual([]);
});

test.each([
  ["Lauch", "G470100"], // Porree/Lauch, roh before Lauch dishes
  ["Kirschtomaten", "G561100"], // compound finds Tomate roh
  ["Crème fraîche", "M176800"], // accents are ignored
  ["Hähnchenbrustfilet", "V416100"],
  ["Zwiebeln", "G480100"], // plural, and Speisezwiebel before Brötchen mit Zwiebeln
  ["chicken thighs", "V4A5100"], // English names match too
])("%s offers %s", (query, code) => {
  expect(codes(query)).toContain(code);
});

test("raw foods rank before prepared ones and dishes", () => {
  expect(codes("Blätterteig", 1)).toEqual(["D072000"]);
  expect(codes("Kochschinken", 1)).toEqual(["W424000"]);
});

test("a query without words of three letters finds nothing", () => {
  expect(searchBls("Ei")).toEqual([]);
});
