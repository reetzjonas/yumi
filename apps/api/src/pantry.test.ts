import { expect, test } from "bun:test";
import { type Client, householdMember } from "./test/client";

async function catalogId(c: Client, q: string) {
  const [row] = (await (
    await c.request(`/api/ingredients?q=${encodeURIComponent(q)}&limit=1`)
  ).json()) as { id: string }[];
  if (!row) throw new Error(`seeded ${q} missing`);
  return row.id;
}

test("recipe additions skip staples and return them to double-check", async () => {
  const c = await householdMember("pantry-skip");
  const salt = await catalogId(c, "Salz");
  const flour = await catalogId(c, "Weizenmehl");
  expect(
    (await c.request(`/api/pantry/${salt}`, { method: "PUT" })).status,
  ).toBe(204);
  expect(
    (await c.request(`/api/pantry/${salt}`, { method: "PUT" })).status,
  ).toBe(204);
  expect(await (await c.request("/api/pantry")).json()).toMatchObject([
    { ingredientId: salt },
  ]);
  const list = (await (
    await c.request("/api/shopping/lists", {
      method: "POST",
      body: JSON.stringify({ name: "Weekly" }),
    })
  ).json()) as { id: string };
  const recipe = (await (
    await c.request("/api/recipes", {
      method: "POST",
      body: JSON.stringify({
        title: "Bread",
        servings: 1,
        ingredients: [
          {
            rawText: "500 g Mehl",
            quantity: 500,
            unit: "g",
            ingredientId: flour,
          },
          {
            rawText: "1 TL Salz",
            quantity: 1,
            unit: "tsp",
            ingredientId: salt,
          },
        ],
      }),
    })
  ).json()) as { id: string };
  const res = await c.request(`/api/shopping/lists/${list.id}/recipes`, {
    method: "POST",
    body: JSON.stringify({ recipeId: recipe.id, locale: "de" }),
  });
  expect(await res.json()).toMatchObject({
    added: 1,
    staples: [
      {
        ingredientId: salt,
        quantity: 1,
        unit: "tsp",
        sources: [{ kind: "recipe", id: recipe.id }],
      },
    ],
  });
  const detail = (await (
    await c.request(`/api/shopping/lists/${list.id}`)
  ).json()) as { items: { ingredientId: string }[] };
  expect(detail.items.map((item) => item.ingredientId)).toEqual([flour]);
  expect(
    (await c.request(`/api/pantry/${salt}`, { method: "DELETE" })).status,
  ).toBe(204);
  expect(await (await c.request("/api/pantry")).json()).toEqual([]);
});

test("pantry is scoped to the household and to visible ingredients", async () => {
  const owner = await householdMember("pantry-owner");
  const outsider = await householdMember("pantry-outsider");
  const salt = await catalogId(owner, "Salz");
  await owner.request(`/api/pantry/${salt}`, { method: "PUT" });
  expect(await (await outsider.request("/api/pantry")).json()).toEqual([]);
  await outsider.request(`/api/pantry/${salt}`, { method: "DELETE" });
  expect(await (await owner.request("/api/pantry")).json()).toHaveLength(1);
  const own = (await (
    await owner.request("/api/ingredients", {
      method: "POST",
      body: JSON.stringify({ nameDe: "Hausgewürz" }),
    })
  ).json()) as { id: string };
  expect(
    (await outsider.request(`/api/pantry/${own.id}`, { method: "PUT" })).status,
  ).toBe(404);
});
