import { expect, test } from "bun:test";
import { type Client, householdMember } from "./test/client";

type Category = { id: string; key: string };
type Tile = { id: string; nameEn: string; categoryId: string };

async function addItems(c: Client, listId: string, payloads: object[]) {
  const res = await c.request(`/api/shopping/lists/${listId}/events`, {
    method: "POST",
    body: JSON.stringify({
      events: payloads.map((payload) => ({
        id: crypto.randomUUID(),
        itemId: crypto.randomUUID(),
        clientTs: new Date().toISOString(),
        type: "item_added",
        payload,
      })),
    }),
  });
  expect(res.status).toBe(200);
}

test("category tiles list the catalog ingredients of one category", async () => {
  const c = await householdMember("quick-tiles");
  const categories = (await (
    await c.request("/api/ingredients/categories")
  ).json()) as Category[];
  const dairy = categories.find((cat) => cat.key === "dairy");
  if (!dairy) throw new Error("seeded dairy category missing");
  const res = await c.request(
    `/api/ingredients/categories/${dairy.id}/ingredients`,
  );
  const tiles = (await res.json()) as Tile[];
  expect(tiles.some((tile) => tile.nameEn === "Milk")).toBe(true);
  expect(tiles.every((tile) => tile.categoryId === dairy.id)).toBe(true);
});

test("recent items are newest first, deduplicated and skip recipe additions", async () => {
  const c = await householdMember("quick-recent");
  const outsider = await householdMember("quick-recent-outsider");
  const list = (await (
    await c.request("/api/shopping/lists", {
      method: "POST",
      body: JSON.stringify({ name: "Weekly" }),
    })
  ).json()) as { id: string };
  const [milk] = (await (
    await c.request("/api/ingredients?q=Milch&limit=1")
  ).json()) as { id: string }[];
  if (!milk) throw new Error("seeded milk missing");
  await addItems(c, list.id, [{ label: "Milch", ingredientId: milk.id }]);
  await addItems(c, list.id, [{ label: "Kerzen" }]);
  await addItems(c, list.id, [
    { label: "Milch", ingredientId: milk.id, quantity: 1, unit: "l" },
  ]);
  await addItems(c, list.id, [
    { label: "Mehl", sources: [{ kind: "recipe", id: crypto.randomUUID() }] },
  ]);
  const recent = (await (await c.request("/api/shopping/recent")).json()) as {
    label: string;
    ingredient: { id: string } | null;
  }[];
  expect(recent.map((item) => item.label)).toEqual(["Milch", "Kerzen"]);
  expect(recent[0]?.ingredient?.id).toBe(milk.id);
  expect(await (await outsider.request("/api/shopping/recent")).json()).toEqual(
    [],
  );
});
