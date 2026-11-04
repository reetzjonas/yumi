import { expect, test } from "bun:test";
import { z } from "zod";
import { type Client, householdMember } from "./test/client";

const idSchema = z.object({ id: z.uuid() });
const orderSchema = z.object({
  ingredients: z.array(
    z.object({ id: z.uuid(), score: z.number(), sampleCount: z.number() }),
  ),
  categories: z.array(
    z.object({ id: z.uuid(), score: z.number(), sampleCount: z.number() }),
  ),
});

async function setup(c: Client) {
  const list = idSchema.parse(
    await (
      await c.request("/api/shopping/lists", {
        method: "POST",
        body: JSON.stringify({ name: "Learning" }),
      })
    ).json(),
  );
  const store = idSchema.parse(
    await (
      await c.request("/api/stores", {
        method: "POST",
        body: JSON.stringify({ name: "Market" }),
      })
    ).json(),
  );
  const ingredients = z
    .array(z.object({ id: z.uuid(), categoryId: z.uuid().nullable() }))
    .parse(await (await c.request("/api/ingredients?q=milk")).json());
  const first = ingredients[0];
  const second = ingredients[1];
  if (!first || !second) throw new Error("Seed requires two milk ingredients");
  const itemIds = [crypto.randomUUID(), crypto.randomUUID()];
  const events = itemIds.map((itemId, i) => ({
    id: crypto.randomUUID(),
    itemId,
    clientTs: "2026-11-01T09:00:00Z",
    type: "item_added",
    payload: { label: "Milk", ingredientId: i === 0 ? first.id : second.id },
  }));
  expect(
    (
      await c.request(`/api/shopping/lists/${list.id}/events`, {
        method: "POST",
        body: JSON.stringify({ events }),
      })
    ).status,
  ).toBe(200);
  return { list, store, itemIds, first, second };
}

test("check-off learning survives item deletion and event replay", async () => {
  const c = await householdMember("learning");
  const { list, store, itemIds, first, second } = await setup(c);
  const events = itemIds.map((itemId, i) => ({
    id: crypto.randomUUID(),
    itemId,
    clientTs: `2026-11-01T09:0${i}:00Z`,
    type: "item_checked",
    storeId: store.id,
  }));
  for (const batch of [events, events]) {
    expect(
      (
        await c.request(`/api/shopping/lists/${list.id}/events`, {
          method: "POST",
          body: JSON.stringify({ events: batch }),
        })
      ).status,
    ).toBe(200);
  }
  await c.request(`/api/shopping/lists/${list.id}/events`, {
    method: "POST",
    body: JSON.stringify({
      events: itemIds.map((itemId) => ({
        id: crypto.randomUUID(),
        itemId,
        type: "item_removed",
        clientTs: "2026-11-01T09:03:00Z",
      })),
    }),
  });
  const result = orderSchema.parse(
    await (await c.request(`/api/stores/${store.id}/order`)).json(),
  );
  expect(result.ingredients).toEqual(
    expect.arrayContaining([
      { id: first.id, score: 0, sampleCount: 1 },
      { id: second.id, score: 1, sampleCount: 1 },
    ]),
  );
  expect(result.ingredients).toHaveLength(2);
});

test("reset forgets store learning and manual overrides without touching other stores", async () => {
  const c = await householdMember("learning-reset");
  const { list, store, itemIds, first } = await setup(c);
  await c.request(`/api/shopping/lists/${list.id}/events`, {
    method: "POST",
    body: JSON.stringify({
      events: itemIds.map((itemId, i) => ({
        id: crypto.randomUUID(),
        itemId,
        clientTs: `2026-11-01T09:0${i}:00Z`,
        type: "item_checked",
        storeId: store.id,
      })),
    }),
  });
  await c.request(`/api/stores/${store.id}`, {
    method: "PUT",
    body: JSON.stringify({
      name: "Market",
      categoryOrder: first.categoryId ? [first.categoryId] : [],
    }),
  });
  const other = await setup(c);
  await c.request(`/api/shopping/lists/${other.list.id}/events`, {
    method: "POST",
    body: JSON.stringify({
      events: other.itemIds.map((itemId, i) => ({
        id: crypto.randomUUID(),
        itemId,
        clientTs: `2026-11-01T09:0${i}:00Z`,
        type: "item_checked",
        storeId: other.store.id,
      })),
    }),
  });
  const before = orderSchema.parse(
    await (await c.request(`/api/stores/${store.id}/order`)).json(),
  );
  expect(before.ingredients).toHaveLength(2);
  expect(
    (await c.request(`/api/stores/${store.id}/order`, { method: "DELETE" }))
      .status,
  ).toBe(204);
  expect(
    await (await c.request(`/api/stores/${store.id}/order`)).json(),
  ).toEqual({
    ingredients: [],
    categories: [],
  });
  const stores = z
    .array(
      z.object({ id: z.uuid(), categoryOrder: z.array(z.uuid()).nullable() }),
    )
    .parse(await (await c.request("/api/stores")).json());
  expect(stores.find((row) => row.id === store.id)?.categoryOrder).toEqual([]);
  const retained = orderSchema.parse(
    await (await c.request(`/api/stores/${other.store.id}/order`)).json(),
  );
  expect(retained.ingredients).toHaveLength(2);
});

test("store learning and reset reject another household", async () => {
  const owner = await householdMember("learning-owner");
  const outsider = await householdMember("learning-outsider");
  const { store } = await setup(owner);
  for (const method of ["GET", "DELETE"]) {
    expect(
      (await outsider.request(`/api/stores/${store.id}/order`, { method }))
        .status,
    ).toBe(404);
  }
});
