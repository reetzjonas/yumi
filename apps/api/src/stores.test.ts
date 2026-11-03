import { expect, test } from "bun:test";
import { type Client, householdMember } from "./test/client";

type Store = { id: string; name: string; categoryOrder: string[] | null };

async function categoryIds(c: Client) {
  const res = await c.request("/api/ingredients/categories");
  return ((await res.json()) as { id: string }[]).map((cat) => cat.id);
}

async function createStore(c: Client, body: unknown) {
  return c.request("/api/stores", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function createList(c: Client) {
  const res = await c.request("/api/shopping/lists", {
    method: "POST",
    body: JSON.stringify({ name: "Weekly" }),
  });
  return (await res.json()) as { id: string };
}

function assign(c: Client, listId: string, storeId: string | null) {
  return c.request(`/api/shopping/lists/${listId}/store`, {
    method: "PUT",
    body: JSON.stringify({ storeId }),
  });
}

test("stores keep a custom category order and reject unknown categories", async () => {
  const c = await householdMember("stores-order");
  const [first, second] = await categoryIds(c);
  const created = await createStore(c, { name: "Market" });
  expect(created.status).toBe(201);
  const store = (await created.json()) as Store;
  expect(store.categoryOrder).toEqual([]);
  const updated = await c.request(`/api/stores/${store.id}`, {
    method: "PUT",
    body: JSON.stringify({
      name: "Market hall",
      categoryOrder: [second, first],
    }),
  });
  expect(await updated.json()).toEqual({
    id: store.id,
    name: "Market hall",
    categoryOrder: [second, first],
  });
  expect(
    (
      await createStore(c, {
        name: "Bad",
        categoryOrder: [crypto.randomUUID()],
      })
    ).status,
  ).toBe(400);
  expect(
    (await createStore(c, { name: "Dup", categoryOrder: [first, first] }))
      .status,
  ).toBe(400);
});

test("a list's default store is cleared when the store is deleted", async () => {
  const c = await householdMember("stores-default");
  const store = (await (
    await createStore(c, { name: "Corner" })
  ).json()) as Store;
  const list = await createList(c);
  const res = await assign(c, list.id, store.id);
  expect(await res.json()).toEqual({ defaultStoreId: store.id });
  expect(
    (await c.request(`/api/stores/${store.id}`, { method: "DELETE" })).status,
  ).toBe(204);
  const detail = await c.request(`/api/shopping/lists/${list.id}`);
  expect(await detail.json()).toMatchObject({ defaultStoreId: null });
});

test("stores are scoped to their household", async () => {
  const owner = await householdMember("stores-owner");
  const outsider = await householdMember("stores-outsider");
  const store = (await (
    await createStore(owner, { name: "Ours" })
  ).json()) as Store;
  const outsiderList = await createList(outsider);
  expect(await (await outsider.request("/api/stores")).json()).toEqual([]);
  expect(
    (
      await outsider.request(`/api/stores/${store.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: "Theirs" }),
      })
    ).status,
  ).toBe(404);
  expect(
    (await outsider.request(`/api/stores/${store.id}`, { method: "DELETE" }))
      .status,
  ).toBe(404);
  expect((await assign(outsider, outsiderList.id, store.id)).status).toBe(404);
  const ownerList = await createList(owner);
  expect((await assign(outsider, ownerList.id, null)).status).toBe(404);
});
