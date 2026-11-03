import { expect, test } from "bun:test";
import { orderCategories } from "./stores";

const categories = [
  { id: "dairy", defaultPosition: 3 },
  { id: "produce", defaultPosition: 1 },
  { id: "bakery", defaultPosition: 2 },
  { id: "frozen", defaultPosition: 4 },
];

test("store order wins and unlisted categories follow by default position", () => {
  expect(
    orderCategories(categories, ["frozen", "bakery"]).map((c) => c.id),
  ).toEqual(["frozen", "bakery", "produce", "dairy"]);
});

test("missing or empty store order falls back to the default order", () => {
  for (const order of [null, []])
    expect(orderCategories(categories, order).map((c) => c.id)).toEqual([
      "produce",
      "bakery",
      "dairy",
      "frozen",
    ]);
});

test("unknown ids in a store order are ignored", () => {
  expect(
    orderCategories(categories, ["gone", "dairy"]).map((c) => c.id),
  ).toEqual(["dairy", "produce", "bakery", "frozen"]);
});
