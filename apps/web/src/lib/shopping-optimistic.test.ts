import { describe, expect, test } from "bun:test";
import type { ShoppingEvent } from "@yumi/shared";
import type { ShoppingList } from "./shopping";
import { applyShoppingEvents } from "./shopping-optimistic";

const empty: ShoppingList = {
  id: "list",
  name: "Groceries",
  defaultStoreId: null,
  items: [],
  recipes: [],
};
const added: ShoppingEvent = {
  id: "add",
  itemId: "milk",
  clientTs: "2026-11-03T10:00:00.000Z",
  type: "item_added",
  payload: { label: "Milk", quantity: 2, unit: "l" },
};
const event = (
  type: "item_checked" | "item_unchecked" | "item_removed",
): ShoppingEvent => ({
  id: type,
  itemId: "milk",
  clientTs: "2026-11-03T10:01:00.000Z",
  type,
});

describe("optimistic shopping events", () => {
  test("adds an item with the same defaults as the API", () => {
    const list = applyShoppingEvents(empty, [added]);
    expect(list.items).toEqual([
      {
        id: "milk",
        label: "Milk",
        quantity: 2,
        unit: "l",
        ingredientId: null,
        categoryId: null,
        sources: [],
        checked: false,
        ingredient: null,
        updatedAt: added.clientTs,
      },
    ]);
    expect(empty.items).toEqual([]);
  });

  test("overlays add, partial update, check and undo in order", () => {
    const result = applyShoppingEvents(empty, [
      added,
      {
        id: "update",
        itemId: "milk",
        clientTs: added.clientTs,
        type: "item_updated",
        payload: { quantity: 3 },
      },
      event("item_checked"),
      event("item_unchecked"),
    ]);
    expect(result.items[0]).toMatchObject({
      quantity: 3,
      label: "Milk",
      checked: false,
    });
  });

  test("pending additions never duplicate or reset server-applied items", () => {
    const server = applyShoppingEvents(empty, [added, event("item_checked")]);
    const result = applyShoppingEvents(server, [added]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.checked).toBe(true);
  });

  test("removal stays removed when the outbox is overlaid repeatedly", () => {
    const pending = [added, event("item_removed")];
    const first = applyShoppingEvents(empty, pending);
    expect(applyShoppingEvents(first, pending).items).toEqual([]);
  });

  test("a changed ingredient clears stale catalog display metadata", () => {
    const list = applyShoppingEvents(empty, [added]);
    const item = list.items[0];
    if (!item) throw new Error("Expected added item");
    item.ingredientId = "original";
    item.ingredient = {
      nameDe: "Milch",
      nameEn: "Milk",
      icon: null,
      densityGPerMl: null,
      pieceWeightG: null,
    };
    const result = applyShoppingEvents(list, [
      {
        id: "unlink",
        itemId: "milk",
        clientTs: added.clientTs,
        type: "item_updated",
        payload: { ingredientId: null, label: "Oat drink" },
      },
    ]);
    expect(result.items[0]?.ingredient).toBeNull();
    expect(item.ingredient?.nameEn).toBe("Milk");
  });

  test("events for removed items cannot resurrect them", () => {
    expect(applyShoppingEvents(empty, [event("item_checked")]).items).toEqual(
      [],
    );
  });
});
