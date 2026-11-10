import { expect, test } from "bun:test";
import { mergeShoppingItems, shoppingItemFieldsSchema } from "@yumi/shared";
import { z } from "zod";
import { type Client, householdMember } from "./test/client";

const idSchema = z.object({ id: z.uuid() });
const previewSchema = z.object({
  version: z.string(),
  items: z.array(
    z.object({
      label: z.string(),
      amounts: z.array(
        z.object({ quantity: z.number(), unit: z.string().nullable() }),
      ),
      sources: z.array(z.object({ kind: z.string(), id: z.string() })),
    }),
  ),
  staples: z.array(z.object({ label: z.string() })),
});
const listSchema = z.object({
  items: z.array(
    shoppingItemFieldsSchema.extend({
      id: z.uuid(),
      checked: z.boolean(),
    }),
  ),
});

async function create(c: Client, path: string, body: unknown) {
  const response = await c.request(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(201);
  return idSchema.parse(await response.json()).id;
}

async function fixture(name: string) {
  const c = await householdMember(name);
  const flour = await create(c, "/api/ingredients", {
    nameDe: "Mehl",
    nameEn: "Flour",
  });
  const salt = await create(c, "/api/ingredients", {
    nameDe: "Salz",
    nameEn: "Salt",
  });
  const recipeId = await create(c, "/api/recipes", {
    title: "Bread",
    servings: 2,
    ingredients: [
      { rawText: "250 g Mehl", quantity: 250, unit: "g", ingredientId: flour },
      { rawText: "1 TL Salz", quantity: 1, unit: "tsp", ingredientId: salt },
      { rawText: "1 optional egg", quantity: 1, unit: "pcs", optional: true },
    ],
  });
  const first = await create(c, "/api/queue", { recipeId, servings: 4 });
  const second = await create(c, "/api/queue", { recipeId, servings: 2 });
  const listId = await create(c, "/api/shopping/lists", { name: "Weekly" });
  expect(
    (await c.request(`/api/pantry/${salt}`, { method: "PUT" })).status,
  ).toBe(204);
  return { c, flour, salt, recipeId, first, second, listId };
}

async function preview(c: Client, ids: string[]) {
  const response = await c.request("/api/queue/shopping-preview", {
    method: "POST",
    body: JSON.stringify({ ids, locale: "en" }),
  });
  expect(response.status).toBe(200);
  return previewSchema.parse(await response.json());
}

async function list(c: Client, listId: string) {
  return listSchema.parse(
    await (await c.request(`/api/shopping/lists/${listId}`)).json(),
  ).items;
}

test("queue preview scales and merges ingredients while separating pantry staples", async () => {
  const f = await fixture("queue-preview");
  const result = await preview(f.c, [f.first, f.second]);
  expect(result.items).toEqual([
    {
      label: "Flour",
      amounts: [{ quantity: 750, unit: "g" }],
      sources: expect.arrayContaining([
        { kind: "queue", id: f.first },
        { kind: "queue", id: f.second },
        { kind: "recipe", id: f.recipeId },
      ]),
    },
  ]);
  expect(result.staples).toEqual([{ label: "Salt" }]);
  expect(await list(f.c, f.listId)).toEqual([]);
  const entries = z
    .array(z.object({ onList: z.boolean() }))
    .parse(await (await f.c.request("/api/queue")).json());
  expect(entries.map((entry) => entry.onList)).toEqual([false, false]);
});

test("confirmed queue additions retain sources and replay without duplicate items", async () => {
  const f = await fixture("queue-push");
  const { version } = await preview(f.c, [f.first, f.second]);
  const body = JSON.stringify({
    ids: [f.first, f.second],
    locale: "en",
    listId: f.listId,
    version,
    requestId: crypto.randomUUID(),
  });
  const responses = await Promise.all(
    [1, 2].map(() =>
      f.c.request("/api/queue/shopping", { method: "POST", body }),
    ),
  );
  expect(responses.map((r) => r.status)).toEqual([201, 201]);
  expect(
    await Promise.all(
      responses.map(
        async (r) =>
          z.object({ added: z.number() }).parse(await r.json()).added,
      ),
    ),
  ).toEqual(expect.arrayContaining([2, 0]));
  const onList = async () =>
    z
      .array(z.object({ id: z.string(), onList: z.boolean() }))
      .parse(await (await f.c.request("/api/queue")).json());
  expect((await onList()).every((entry) => entry.onList)).toBe(true);
  const items = await list(f.c, f.listId);
  expect(items).toHaveLength(2);
  expect(mergeShoppingItems(items)[0]?.amounts).toEqual([
    { quantity: 750, unit: "g" },
  ]);
  expect(
    items
      .flatMap((item) => item.sources)
      .filter((source) => source.kind === "queue")
      .map((source) => source.id)
      .sort(),
  ).toEqual([f.first, f.second].sort());
});

test("the confirmation can explicitly include separated pantry staples", async () => {
  const f = await fixture("queue-staples");
  const { version } = await preview(f.c, [f.first]);
  const response = await f.c.request("/api/queue/shopping", {
    method: "POST",
    body: JSON.stringify({
      ids: [f.first],
      locale: "en",
      version,
      listId: f.listId,
      requestId: crypto.randomUUID(),
      includeStaples: true,
    }),
  });
  expect(response.status).toBe(201);
  expect((await list(f.c, f.listId)).map((item) => item.label).sort()).toEqual([
    "Flour",
    "Salt",
  ]);
});

test("a changed queue invalidates its preview without writing shopping items", async () => {
  const f = await fixture("queue-stale");
  const { version } = await preview(f.c, [f.first]);
  await f.c.request(`/api/queue/${f.first}`, {
    method: "PATCH",
    body: JSON.stringify({ servings: 3 }),
  });
  const response = await f.c.request("/api/queue/shopping", {
    method: "POST",
    body: JSON.stringify({
      ids: [f.first],
      locale: "en",
      version,
      listId: f.listId,
      requestId: crypto.randomUUID(),
    }),
  });
  expect(response.status).toBe(409);
  expect(await list(f.c, f.listId)).toEqual([]);
});

test.each(["true", "false"] as const)(
  "removing a queue entry with removeItems=%s preserves other contributions",
  async (removeItems) => {
    const f = await fixture(`queue-remove-${removeItems}`);
    const { version } = await preview(f.c, [f.first, f.second]);
    expect(
      (
        await f.c.request("/api/queue/shopping", {
          method: "POST",
          body: JSON.stringify({
            ids: [f.first, f.second],
            locale: "en",
            version,
            listId: f.listId,
            requestId: crypto.randomUUID(),
          }),
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await f.c.request(`/api/shopping/lists/${f.listId}/events`, {
          method: "POST",
          body: JSON.stringify({
            events: [
              {
                id: crypto.randomUUID(),
                itemId: crypto.randomUUID(),
                clientTs: new Date().toISOString(),
                type: "item_added",
                payload: {
                  label: "Flour",
                  ingredientId: f.flour,
                  quantity: 100,
                  unit: "g",
                },
              },
            ],
          }),
        })
      ).status,
    ).toBe(200);

    const response = await f.c.request(
      `/api/queue/${f.first}?removeItems=${removeItems}`,
      { method: "DELETE" },
    );

    expect(response.status).toBe(204);
    const remaining = await list(f.c, f.listId);
    expect(mergeShoppingItems(remaining)[0]?.amounts).toEqual([
      { quantity: removeItems === "true" ? 350 : 850, unit: "g" },
    ]);
    const queued = z
      .array(idSchema)
      .parse(await (await f.c.request("/api/queue")).json());
    expect(queued.map((entry) => entry.id)).toEqual([f.second]);
  },
);

test("queue shopping rejects foreign entries and destination lists without leaking data", async () => {
  const f = await fixture("queue-transfer-owner");
  const outsider = await householdMember("queue-transfer-outsider");
  const outsiderList = await create(outsider, "/api/shopping/lists", {
    name: "Other",
  });
  expect(
    (
      await outsider.request("/api/queue/shopping-preview", {
        method: "POST",
        body: JSON.stringify({ ids: [f.first] }),
      })
    ).status,
  ).toBe(404);
  const { version } = await preview(f.c, [f.first]);
  expect(
    (
      await f.c.request("/api/queue/shopping", {
        method: "POST",
        body: JSON.stringify({
          ids: [f.first],
          locale: "en",
          version,
          listId: outsiderList,
          requestId: crypto.randomUUID(),
        }),
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await outsider.request(`/api/queue/${f.first}?removeItems=true`, {
        method: "DELETE",
      })
    ).status,
  ).toBe(404);
  expect(await list(f.c, f.listId)).toEqual([]);
});
