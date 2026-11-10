import { describe, expect, test } from "bun:test";
import { parseIngredientLine } from "./ingredient-line";
import {
  type MergeableItem,
  mergeShoppingItems,
  quickAddFields,
  splitQuickAdd,
} from "./shopping";

const onion = "00000000-0000-4000-8000-000000000001";
const milk = "00000000-0000-4000-8000-000000000002";

function item(
  overrides: Partial<MergeableItem> & { id: string },
): MergeableItem {
  return {
    label: "Zwiebel",
    ingredientId: null,
    categoryId: null,
    quantity: null,
    unit: null,
    checked: false,
    sources: [],
    ...overrides,
  };
}

describe("mergeShoppingItems", () => {
  test("same ingredient sums quantities across convertible units", () => {
    const [merged, ...rest] = mergeShoppingItems([
      item({
        id: "a",
        label: "Milch",
        ingredientId: milk,
        quantity: 500,
        unit: "ml",
      }),
      item({
        id: "b",
        label: "Milch",
        ingredientId: milk,
        quantity: 1,
        unit: "l",
      }),
    ]);
    expect(rest).toEqual([]);
    expect(merged?.itemIds).toEqual(["a", "b"]);
    expect(merged?.amounts).toEqual([{ quantity: 1500, unit: "ml" }]);
  });

  test("piece weight bridges counted and weighed amounts", () => {
    const factors = { pieceWeightG: 150 };
    const [merged] = mergeShoppingItems([
      item({ id: "a", ingredientId: onion, quantity: 2, unit: "pcs", factors }),
      item({ id: "b", ingredientId: onion, quantity: 300, unit: "g", factors }),
    ]);
    expect(merged?.amounts).toEqual([{ quantity: 4, unit: "pcs" }]);
  });

  test("unconvertible units are listed side by side", () => {
    const [merged] = mergeShoppingItems([
      item({ id: "a", ingredientId: onion, quantity: 500, unit: "g" }),
      item({ id: "b", ingredientId: onion, quantity: 2, unit: "pcs" }),
      item({ id: "c", ingredientId: onion }),
    ]);
    expect(merged?.amounts).toEqual([
      { quantity: 500, unit: "g" },
      { quantity: 2, unit: "pcs" },
    ]);
    expect(merged?.itemIds).toEqual(["a", "b", "c"]);
  });

  test("free-text items merge by label, sources are de-duplicated", () => {
    const recipe = { kind: "recipe" as const, id: "r1" };
    const merged = mergeShoppingItems([
      item({ id: "a", label: "Kerzen", sources: [recipe] }),
      item({ id: "b", label: " kerzen ", sources: [recipe] }),
      item({ id: "c", label: "Servietten" }),
    ]);
    expect(merged.map((m) => m.itemIds)).toEqual([["a", "b"], ["c"]]);
    expect(merged[0]?.sources).toEqual([recipe]);
  });

  test("checked items never merge", () => {
    const merged = mergeShoppingItems([
      item({ id: "a", ingredientId: onion, checked: true }),
      item({ id: "b", ingredientId: onion, checked: true }),
      item({ id: "c", ingredientId: onion }),
    ]);
    expect(merged.map((m) => m.itemIds)).toEqual([["a"], ["b"], ["c"]]);
  });
});

describe("quickAddFields", () => {
  const milk = { id: crypto.randomUUID(), name: "Milch", categoryId: null };

  test("a count before the name becomes the quantity of the linked ingredient", () => {
    expect(quickAddFields(parseIngredientLine("2 Milch"), milk)).toEqual({
      label: "Milch",
      ingredientId: milk.id,
      categoryId: null,
      quantity: 2,
      unit: null,
    });
  });

  test("a glued unit is split off", () => {
    expect(
      quickAddFields(parseIngredientLine("500g Hack"), null),
    ).toMatchObject({
      label: "Hack",
      quantity: 500,
      unit: "g",
    });
  });

  test("a measure without a unit code stays in the label and is not linked", () => {
    expect(
      quickAddFields(parseIngredientLine("2 Becher Sahne"), milk),
    ).toMatchObject({ label: "Becher Sahne", ingredientId: null, quantity: 2 });
  });

  test("a range buys the upper bound", () => {
    expect(
      quickAddFields(parseIngredientLine("2-3 Zwiebeln"), null),
    ).toMatchObject({ label: "Zwiebeln", quantity: 3 });
  });
});

describe("splitQuickAdd", () => {
  test("splits on commas, semicolons and line breaks", () => {
    expect(splitQuickAdd("Milch, Eier;Butter\n2 Tomaten")).toEqual([
      "Milch",
      "Eier",
      "Butter",
      "2 Tomaten",
    ]);
  });
  test("keeps decimal commas and drops empty parts", () => {
    expect(splitQuickAdd("1,5 kg Mehl, , 0,5 l Milch,")).toEqual([
      "1,5 kg Mehl",
      "0,5 l Milch",
    ]);
    expect(splitQuickAdd("  ")).toEqual([]);
  });
});
