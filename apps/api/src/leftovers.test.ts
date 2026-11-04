import { expect, test } from "bun:test";
import { convertQuantity, unitSchema } from "@yumi/shared";
import { z } from "zod";
import { type Client, householdMember } from "./test/client";

const idSchema = z.object({ id: z.uuid() });
const leftoversSchema = z.array(
  z.object({
    id: z.uuid(),
    ingredientId: z.uuid(),
    quantity: z.number(),
    unit: unitSchema,
  }),
);

async function create(c: Client, path: string, input: unknown) {
  const result = await c.request(path, {
    method: "POST",
    body: JSON.stringify(input),
  });
  expect(result.status).toBe(201);
  return idSchema.parse(await result.json()).id;
}

async function fixture(name: string) {
  const c = await householdMember(name);
  const ingredientId = await create(c, "/api/ingredients", {
    nameDe: "Sahne",
    nameEn: "Cream",
    defaultUnit: "ml",
    densityGPerMl: 1,
    packSizes: [{ quantity: 200, unit: "ml" }],
  });
  const recipeId = await create(c, "/api/recipes", {
    title: "Cream soup",
    servings: 2,
    ingredients: [
      { rawText: "100 ml cream", ingredientId, quantity: 100, unit: "ml" },
    ],
  });
  const entryId = await create(c, "/api/queue", { recipeId, servings: 2 });
  const listId = await create(c, "/api/shopping/lists", { name: "Weekly" });
  return { c, ingredientId, recipeId, entryId, listId };
}

async function confirm(
  f: Awaited<ReturnType<typeof fixture>>,
  ids = [f.entryId],
) {
  const response = await f.c.request("/api/queue/shopping-preview", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
  expect(response.status).toBe(200);
  const { version } = z
    .object({ version: z.string() })
    .parse(await response.json());
  const body = JSON.stringify({
    ids,
    listId: f.listId,
    version,
    requestId: crypto.randomUUID(),
  });
  expect(
    (await f.c.request("/api/queue/shopping", { method: "POST", body })).status,
  ).toBe(201);
  return body;
}

async function remaining(c: Client) {
  return leftoversSchema.parse(
    await (await c.request("/api/leftovers")).json(),
  );
}

test("confirmed needs are merged before estimating packs and replay cannot restore dismissed leftovers", async () => {
  const f = await fixture("leftovers-confirm");
  const secondRecipe = await create(f.c, "/api/recipes", {
    title: "More cream",
    servings: 2,
    ingredients: [
      {
        rawText: "0.05 l cream",
        ingredientId: f.ingredientId,
        quantity: 0.05,
        unit: "l",
      },
    ],
  });
  const second = await create(f.c, "/api/queue", {
    recipeId: secondRecipe,
    servings: 2,
  });
  const body = await confirm(f, [f.entryId, second]);
  const rows = await remaining(f.c);
  expect(
    rows.map((row) => ({
      ...row,
      quantity: convertQuantity(row.quantity, row.unit, "ml"),
      unit: "ml",
    })),
  ).toEqual([
    {
      id: expect.any(String),
      ingredientId: f.ingredientId,
      quantity: 50,
      unit: "ml",
    },
  ]);
  const row = rows[0];
  if (!row) throw new Error("Expected a pack leftover");
  await f.c.request(`/api/leftovers/${row.id}`, { method: "DELETE" });
  await f.c.request("/api/queue/shopping", { method: "POST", body });
  expect(await remaining(f.c)).toEqual([]);
});

test("cooking preserves its own expected remainder and consumes reused quantities once with scaled servings", async () => {
  const f = await fixture("leftovers-cook");
  await confirm(f);
  await f.c.request(`/api/queue/${f.entryId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "cooked" }),
  });
  expect((await remaining(f.c)).map((row) => row.quantity)).toEqual([100]);
  const recipeId = await create(f.c, "/api/recipes", {
    title: "Use the rest",
    servings: 2,
    ingredients: [
      {
        rawText: "25 g cream",
        ingredientId: f.ingredientId,
        quantity: 25,
        unit: "g",
      },
    ],
  });
  const entryId = await create(f.c, "/api/queue", { recipeId, servings: 4 });
  const responses = await Promise.all(
    [1, 2].map(() =>
      f.c.request(`/api/queue/${entryId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "cooked" }),
      }),
    ),
  );
  expect(responses.map((row) => row.status).sort()).toEqual([200, 404]);
  expect((await remaining(f.c)).map((row) => row.quantity)).toEqual([50]);
});

test("reuse suggestions rank consumption, optionally include ingredient overlap and exclude staples", async () => {
  const f = await fixture("leftovers-suggest");
  await confirm(f);
  const large = await create(f.c, "/api/recipes", {
    title: "Full reuse",
    servings: 2,
    ingredients: [
      {
        rawText: "100 ml cream",
        ingredientId: f.ingredientId,
        quantity: 100,
        unit: "ml",
      },
    ],
  });
  const small = await create(f.c, "/api/recipes", {
    title: "Partial reuse",
    servings: 2,
    ingredients: [
      {
        rawText: "25 ml cream",
        ingredientId: f.ingredientId,
        quantity: 25,
        unit: "ml",
      },
    ],
  });
  const similar = await create(f.c, "/api/recipes", {
    title: "Cream to taste",
    servings: 2,
    ingredients: [{ rawText: "cream to taste", ingredientId: f.ingredientId }],
  });
  const suggestions = z.array(
    z.object({
      id: z.uuid(),
      leftoverCoverage: z.number(),
      overlap: z.number(),
    }),
  );
  expect(
    suggestions.parse(
      await (await f.c.request("/api/leftovers/suggestions")).json(),
    ),
  ).toEqual([
    { id: large, leftoverCoverage: 1, overlap: 1 },
    { id: small, leftoverCoverage: 0.25, overlap: 1 },
  ]);
  expect(
    suggestions
      .parse(
        await (
          await f.c.request("/api/leftovers/suggestions?similar=true")
        ).json(),
      )
      .map((row) => row.id),
  ).toEqual([large, small, similar]);
  await f.c.request(`/api/pantry/${f.ingredientId}`, { method: "PUT" });
  expect(
    await (await f.c.request("/api/leftovers/suggestions?similar=true")).json(),
  ).toEqual([]);
});

test("leftover edits and suggestions stay within the household", async () => {
  const f = await fixture("leftovers-owner");
  const outsider = await householdMember("leftovers-outsider");
  await confirm(f);
  const [row] = await remaining(f.c);
  if (!row) throw new Error("Expected a pack leftover");
  expect(await remaining(outsider)).toEqual([]);
  expect(
    await (
      await outsider.request("/api/leftovers/suggestions?similar=true")
    ).json(),
  ).toEqual([]);
  for (const method of ["PATCH", "DELETE"]) {
    expect(
      (
        await outsider.request(`/api/leftovers/${row.id}`, {
          method,
          ...(method === "PATCH"
            ? { body: JSON.stringify({ quantity: 30, unit: "ml" }) }
            : {}),
        })
      ).status,
    ).toBe(404);
  }
  expect(
    (
      await f.c.request(`/api/leftovers/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ quantity: 30, unit: "ml" }),
      })
    ).status,
  ).toBe(200);
  expect((await remaining(f.c)).map((row) => row.quantity)).toEqual([30]);
});

test("suggestion coverage uses the combined stock across separate expected remainders", async () => {
  const f = await fixture("leftovers-combined");
  await confirm(f);
  const otherEntry = await create(f.c, "/api/queue", {
    recipeId: f.recipeId,
    servings: 2,
  });
  await confirm(f, [otherEntry]);
  const candidate = await create(f.c, "/api/recipes", {
    title: "Use half of the stock",
    servings: 2,
    ingredients: [
      {
        rawText: "100 ml cream",
        ingredientId: f.ingredientId,
        quantity: 100,
        unit: "ml",
      },
    ],
  });
  const scores = z
    .array(z.object({ id: z.uuid(), leftoverCoverage: z.number() }))
    .parse(await (await f.c.request("/api/leftovers/suggestions")).json());
  expect(scores).toEqual([{ id: candidate, leftoverCoverage: 0.5 }]);
});

test.each([0, -1, 1_000_001])(
  "leftover edits reject invalid quantity %s",
  async (quantity) => {
    const f = await fixture(`leftovers-invalid-${quantity}`);
    expect(
      (
        await f.c.request(`/api/leftovers/${crypto.randomUUID()}`, {
          method: "PATCH",
          body: JSON.stringify({ quantity, unit: "ml" }),
        })
      ).status,
    ).toBe(400);
  },
);
