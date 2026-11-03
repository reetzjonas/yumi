import { expect, test } from "bun:test";
import type { ShoppingEvent } from "@yumi/shared";
import { type Client, householdMember } from "./test/client";

async function listFor(c: Client) {
  const response = await c.request("/api/shopping/lists", {
    method: "POST",
    body: JSON.stringify({ name: "Weekend" }),
  });
  expect(response.status).toBe(201);
  return (await response.json()) as { id: string };
}

async function events(c: Client, listId: string, batch: ShoppingEvent[]) {
  return c.request(`/api/shopping/lists/${listId}/events`, {
    method: "POST",
    body: JSON.stringify({ events: batch }),
  });
}

test("shopping events replay without applying an old quantity twice", async () => {
  const c = await householdMember("shopping-replay");
  const list = await listFor(c);
  const itemId = crypto.randomUUID();
  const add: ShoppingEvent = {
    id: crypto.randomUUID(),
    itemId,
    clientTs: "2026-11-03T12:00:00Z",
    type: "item_added",
    payload: { label: "Milk", quantity: 500, unit: "ml" },
  };
  const update: ShoppingEvent = {
    ...add,
    id: crypto.randomUUID(),
    type: "item_updated",
    payload: { quantity: 750 },
  };
  expect((await events(c, list.id, [add, update])).status).toBe(200);
  const replay = await events(c, list.id, [add, update]);
  expect(await replay.json()).toEqual({ applied: [] });
  const result = await c.request(`/api/shopping/lists/${list.id}`);
  expect(await result.json()).toMatchObject({
    items: [{ id: itemId, label: "Milk", quantity: 750, unit: "ml" }],
  });
});

test("another household cannot read or alter a shopping list", async () => {
  const owner = await householdMember("shopping-owner");
  const outsider = await householdMember("shopping-outsider");
  const list = await listFor(owner);
  expect(
    (await outsider.request(`/api/shopping/lists/${list.id}`)).status,
  ).toBe(404);
  expect(
    (
      await events(outsider, list.id, [
        {
          id: crypto.randomUUID(),
          itemId: crypto.randomUUID(),
          clientTs: "2026-11-03T12:00:00Z",
          type: "item_removed",
        },
      ])
    ).status,
  ).toBe(404);
  expect(await (await outsider.request("/api/shopping/lists")).json()).toEqual(
    [],
  );
});

test("events cannot alter an item on a different list", async () => {
  const c = await householdMember("shopping-list-scope");
  const first = await listFor(c);
  const second = await listFor(c);
  const itemId = crypto.randomUUID();
  await events(c, first.id, [
    {
      id: crypto.randomUUID(),
      itemId,
      clientTs: "2026-11-03T12:00:00Z",
      type: "item_added",
      payload: { label: "Bread" },
    },
  ]);
  await events(c, second.id, [
    {
      id: crypto.randomUUID(),
      itemId,
      clientTs: "2026-11-03T12:00:01Z",
      type: "item_checked",
    },
  ]);
  expect(
    await (await c.request(`/api/shopping/lists/${first.id}`)).json(),
  ).toMatchObject({ items: [{ id: itemId, checked: false }] });
});

test("adding a recipe scales quantities and keeps its source", async () => {
  const c = await householdMember("shopping-recipe");
  const list = await listFor(c);
  const response = await c.request("/api/recipes", {
    method: "POST",
    body: JSON.stringify({
      title: "Pancakes",
      servings: 2,
      ingredients: [
        { rawText: "200 g flour", quantity: 200, unit: "g" },
        { rawText: "Salt", optional: true },
      ],
    }),
  });
  const recipe = (await response.json()) as { id: string };
  const added = await c.request(`/api/shopping/lists/${list.id}/recipes`, {
    method: "POST",
    body: JSON.stringify({ recipeId: recipe.id, servings: 4, locale: "en" }),
  });
  expect(await added.json()).toEqual({ added: 1, staples: [] });
  expect(
    await (await c.request(`/api/shopping/lists/${list.id}`)).json(),
  ).toMatchObject({
    items: [
      {
        label: "flour",
        quantity: 400,
        unit: "g",
        sources: [{ kind: "recipe", id: recipe.id }],
      },
    ],
    recipes: [{ id: recipe.id, title: "Pancakes" }],
  });
});

test("foreign ingredient references cannot link another household's data", async () => {
  const owner = await householdMember("shopping-private-ingredient");
  const other = await householdMember("shopping-foreign-ingredient");
  const ingredient = await owner.request("/api/ingredients", {
    method: "POST",
    body: JSON.stringify({ nameDe: "Private spice" }),
  });
  const privateIngredient = (await ingredient.json()) as { id: string };
  const list = await listFor(other);
  const response = await events(other, list.id, [
    {
      id: crypto.randomUUID(),
      itemId: crypto.randomUUID(),
      clientTs: "2026-11-03T12:00:00Z",
      type: "item_added",
      payload: { label: "My spice", ingredientId: privateIngredient.id },
    },
  ]);
  expect(response.status).toBe(200);
  expect(
    await (await other.request(`/api/shopping/lists/${list.id}`)).json(),
  ).toMatchObject({
    items: [{ label: "My spice", ingredientId: null, ingredient: null }],
  });
});

test("malformed recipe source identifiers are rejected at the event boundary", async () => {
  const c = await householdMember("shopping-invalid-source");
  const list = await listFor(c);
  const response = await c.request(`/api/shopping/lists/${list.id}/events`, {
    method: "POST",
    body: JSON.stringify({
      events: [
        {
          id: crypto.randomUUID(),
          itemId: crypto.randomUUID(),
          clientTs: "2026-11-03T12:00:00Z",
          type: "item_added",
          payload: {
            label: "Salt",
            sources: [{ kind: "recipe", id: "invalid" }],
          },
        },
      ],
    }),
  });
  expect(response.status).toBe(400);
});
