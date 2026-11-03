import { expect, test } from "bun:test";
import { cookLog } from "@yumi/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { type Client, client, householdMember, signUp } from "./test/client";

const entrySchema = z.object({
  id: z.uuid(),
  recipeId: z.uuid(),
  servings: z.number(),
  plannedFor: z.string().nullable(),
  status: z.enum(["queued", "cooked", "skipped"]),
});
const entriesSchema = z.array(entrySchema);

async function newRecipe(c: Client, title = "Queue soup") {
  const response = await c.request("/api/recipes", {
    method: "POST",
    body: JSON.stringify({ title, servings: 2 }),
  });
  expect(response.status).toBe(201);
  return z.object({ id: z.uuid() }).parse(await response.json()).id;
}

async function addEntry(c: Client, recipeId: string) {
  const response = await c.request("/api/queue", {
    method: "POST",
    body: JSON.stringify({ recipeId, servings: 4 }),
  });
  expect(response.status).toBe(201);
  return entrySchema.parse(await response.json());
}

async function entries(c: Client) {
  const response = await c.request("/api/queue");
  expect(response.status).toBe(200);
  return entriesSchema.parse(await response.json());
}

test("queue keeps duplicate recipes as separate meals and persists servings and date", async () => {
  const c = await householdMember("queue-edit");
  const recipeId = await newRecipe(c);
  const first = await addEntry(c, recipeId);
  const second = await addEntry(c, recipeId);

  const response = await c.request(`/api/queue/${first.id}`, {
    method: "PATCH",
    body: JSON.stringify({ servings: 3, plannedFor: "2026-11-05" }),
  });

  expect(response.status).toBe(200);
  expect(await entries(c)).toEqual([
    { ...first, servings: 3, plannedFor: "2026-11-05" },
    second,
  ]);
  const detail = z
    .array(z.object({ recipe: z.object({ id: z.uuid(), title: z.string() }) }))
    .parse(await (await c.request("/api/queue")).json());
  expect(detail[0]?.recipe).toEqual({ id: recipeId, title: "Queue soup" });
  await c.request(`/api/queue/${first.id}`, {
    method: "PATCH",
    body: JSON.stringify({ plannedFor: null }),
  });
  expect((await entries(c))[0]?.plannedFor).toBeNull();
});

test("reordering persists the complete queue without losing entries", async () => {
  const c = await householdMember("queue-order");
  const recipeId = await newRecipe(c);
  const first = await addEntry(c, recipeId);
  const second = await addEntry(c, recipeId);
  const third = await addEntry(c, recipeId);

  const response = await c.request("/api/queue/order", {
    method: "PUT",
    body: JSON.stringify({ ids: [third.id, first.id, second.id] }),
  });

  expect(response.status).toBe(200);
  expect((await entries(c)).map((entry) => entry.id)).toEqual([
    third.id,
    first.id,
    second.id,
  ]);
});

test.each(["cooked", "skipped"] as const)(
  "%s removes an entry from the active queue and cooking writes exactly one log",
  async (status) => {
    const c = await householdMember(`queue-${status}`);
    const recipeId = await newRecipe(c);
    const entry = await addEntry(c, recipeId);

    const responses = await Promise.all(
      [1, 2].map(() =>
        c.request(`/api/queue/${entry.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        }),
      ),
    );

    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 404,
    ]);
    expect(await entries(c)).toEqual([]);
    const logs = await db
      .select()
      .from(cookLog)
      .where(eq(cookLog.recipeId, recipeId));
    expect(logs).toHaveLength(status === "cooked" ? 1 : 0);
    if (status === "cooked") {
      const me = z
        .object({ user: z.object({ id: z.string() }) })
        .parse(await (await c.request("/api/auth/get-session")).json());
      expect(logs[0]?.userId).toBe(me.user.id);
    }
  },
);

test("queue isolates households across reads, recipe references, edits and ordering", async () => {
  const owner = await householdMember("queue-owner");
  const outsider = await householdMember("queue-outsider");
  const recipeId = await newRecipe(owner);
  const entry = await addEntry(owner, recipeId);

  expect(await entries(outsider)).toEqual([]);
  for (const [path, method, body, expected] of [
    ["/api/queue", "POST", { recipeId, servings: 2 }, 404],
    [`/api/queue/${entry.id}`, "PATCH", { status: "cooked" }, 404],
    ["/api/queue/order", "PUT", { ids: [entry.id] }, 409],
  ] as const) {
    expect(
      (await outsider.request(path, { method, body: JSON.stringify(body) }))
        .status,
    ).toBe(expected);
  }
  expect(await entries(owner)).toEqual([entry]);
});

test("queue rejects malformed inputs and incomplete or duplicate reorder requests", async () => {
  const c = await householdMember("queue-validation");
  const recipeId = await newRecipe(c);
  const entry = await addEntry(c, recipeId);
  for (const [path, method, body, expected] of [
    ["/api/queue", "POST", { recipeId, servings: 0 }, 400],
    ["/api/queue", "POST", { recipeId, servings: 1.5 }, 400],
    ["/api/queue", "POST", { recipeId, servings: 101 }, 400],
    [
      "/api/queue",
      "POST",
      { recipeId, servings: 2, plannedFor: "2026-02-30" },
      400,
    ],
    [`/api/queue/${entry.id}`, "PATCH", {}, 400],
    [`/api/queue/${entry.id}`, "PATCH", { status: "queued" }, 400],
    ["/api/queue/order", "PUT", { ids: [] }, 409],
    ["/api/queue/order", "PUT", { ids: [entry.id, entry.id] }, 400],
    ["/api/queue/order", "PUT", { ids: [crypto.randomUUID()] }, 409],
  ] as const) {
    expect(
      (await c.request(path, { method, body: JSON.stringify(body) })).status,
    ).toBe(expected);
  }
  expect(await entries(c)).toEqual([entry]);
});

test("concurrent additions receive distinct ordered positions", async () => {
  const c = await householdMember("queue-concurrent");
  const recipeId = await newRecipe(c);
  await Promise.all([
    addEntry(c, recipeId),
    addEntry(c, recipeId),
    addEntry(c, recipeId),
  ]);
  const response = await c.request("/api/queue");
  const positions = z
    .array(z.object({ position: z.number() }))
    .parse(await response.json());
  expect(positions.map((entry) => entry.position)).toEqual([0, 1, 2]);
});

test("queue requires authentication and an active household", async () => {
  expect((await client().request("/api/queue")).status).toBe(401);
  const c = await signUp("queue-no-household");
  expect((await c.request("/api/queue")).status).toBe(409);
});
