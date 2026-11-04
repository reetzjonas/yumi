import { describe, expect, test } from "bun:test";
import { cookLog, recipeRating } from "@yumi/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { type Client, client, householdMember, signUp } from "./test/client";

const insightSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  myRating: z.number().nullable(),
  lastCookedAt: z.iso.datetime().nullable(),
});

async function createRecipe(c: Client, input: object) {
  const response = await c.request("/api/recipes", {
    method: "POST",
    body: JSON.stringify(input),
  });
  expect(response.status).toBe(201);
  return insightSchema.parse(await response.json());
}

async function identity(c: Client) {
  return z
    .object({
      user: z.object({ id: z.string(), name: z.string() }),
      activeHouseholdId: z.string(),
    })
    .parse(await (await c.request("/api/me")).json());
}

async function list(c: Client, query = "") {
  const response = await c.request(`/api/recipes${query}`);
  expect(response.status).toBe(200);
  return z.array(insightSchema).parse(await response.json());
}

async function rate(c: Client, id: string, stars: unknown) {
  return c.request(`/api/recipes/${id}/rating`, {
    method: "PUT",
    body: JSON.stringify({ stars }),
  });
}

async function join(owner: Client, guest: Client) {
  const invite = await owner.request("/api/household/invites", {
    method: "POST",
    body: "{}",
  });
  const { token } = z.object({ token: z.string() }).parse(await invite.json());
  expect(
    (
      await guest.request(`/api/invites/${token}/accept`, {
        method: "POST",
      })
    ).status,
  ).toBe(200);
}

describe("recipe insights", () => {
  test("ratings upsert once per user, stay personal, and can be cleared", async () => {
    const owner = await householdMember("insights-rater");
    const guest = await signUp("insights-guest");
    await join(owner, guest);
    const recipe = await createRecipe(owner, { title: "Shared soup" });
    expect(recipe.myRating).toBeNull();
    const responses = await Promise.all([
      rate(owner, recipe.id, 4),
      rate(owner, recipe.id, 4),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(
      await db
        .select()
        .from(recipeRating)
        .where(eq(recipeRating.recipeId, recipe.id)),
    ).toHaveLength(1);
    expect((await rate(guest, recipe.id, 2)).status).toBe(200);
    expect((await rate(owner, recipe.id, 5)).status).toBe(200);
    expect((await list(owner))[0]?.myRating).toBe(5);
    expect((await list(guest))[0]?.myRating).toBe(2);
    expect(
      (await list(owner, "?suggestion=favorites")).map((item) => item.id),
    ).toEqual([recipe.id]);
    expect(await list(guest, "?suggestion=favorites")).toEqual([]);
    expect((await rate(owner, recipe.id, null)).status).toBe(200);
    expect((await list(owner))[0]?.myRating).toBeNull();
    expect((await list(guest))[0]?.myRating).toBe(2);
    expect(
      await db
        .select()
        .from(recipeRating)
        .where(eq(recipeRating.recipeId, recipe.id)),
    ).toHaveLength(1);
  });

  test("rating and history routes reject foreign recipes, invalid stars and missing authorization", async () => {
    const owner = await householdMember("insights-owner");
    const foreign = await householdMember("insights-outsider");
    const recipe = await createRecipe(owner, { title: "Private" });
    for (const stars of [0, 6, 2.5, "5", undefined]) {
      expect((await rate(owner, recipe.id, stars)).status).toBe(400);
    }
    expect((await rate(foreign, recipe.id, 5)).status).toBe(404);
    expect((await rate(foreign, recipe.id, null)).status).toBe(404);
    expect(
      (await foreign.request(`/api/recipes/${recipe.id}/history`)).status,
    ).toBe(404);
    expect(await list(foreign, "?suggestion=neglected")).toEqual([]);
    expect(await list(foreign, "?suggestion=favorites")).toEqual([]);
    expect(await list(foreign, "?suggestion=quick")).toEqual([]);
    expect((await rate(client(), recipe.id, 5)).status).toBe(401);
    expect(
      (await client().request(`/api/recipes/${recipe.id}/history`)).status,
    ).toBe(401);
    const noHousehold = await signUp("insights-no-household");
    expect((await rate(noHousehold, recipe.id, 5)).status).toBe(409);
    expect((await owner.request("/api/recipes?suggestion=random")).status).toBe(
      400,
    );
    expect(
      await db
        .select()
        .from(recipeRating)
        .where(eq(recipeRating.recipeId, recipe.id)),
    ).toEqual([]);
  });

  test("suggestions combine search and tags with deterministic rating, duration and neglect order", async () => {
    const c = await householdMember("insights-suggestions");
    const me = await identity(c);
    const never = await createRecipe(c, {
      title: "A never",
      tags: ["meal"],
      prepMinutes: 5,
      cookMinutes: 10,
    });
    const old = await createRecipe(c, {
      title: "B old",
      tags: ["meal"],
      prepMinutes: 10,
      cookMinutes: 20,
    });
    const recent = await createRecipe(c, {
      title: "C recent",
      prepMinutes: 15,
      cookMinutes: 16,
    });
    const unknown = await createRecipe(c, {
      title: "D unknown",
      cookMinutes: 5,
    });
    const otherUnknown = await createRecipe(c, {
      title: "E unknown",
      prepMinutes: 5,
    });
    const zero = await createRecipe(c, {
      title: "F zero",
      prepMinutes: 0,
      cookMinutes: 0,
    });
    await db.insert(cookLog).values([
      {
        householdId: me.activeHouseholdId,
        recipeId: old.id,
        userId: me.user.id,
        cookedAt: new Date("2025-01-01T10:00:00Z"),
      },
      {
        householdId: me.activeHouseholdId,
        recipeId: recent.id,
        userId: me.user.id,
        cookedAt: new Date("2026-01-01T10:00:00Z"),
      },
    ]);
    for (const [id, stars] of [
      [never.id, 4],
      [old.id, 5],
      [recent.id, 3],
    ] as const)
      expect((await rate(c, id, stars)).status).toBe(200);
    const ids = async (query: string) =>
      (await list(c, query)).map((item) => item.id);
    expect(await ids("?suggestion=neglected")).toEqual([
      never.id,
      unknown.id,
      otherUnknown.id,
      zero.id,
      old.id,
      recent.id,
    ]);
    expect(await ids("?suggestion=favorites")).toEqual([old.id, never.id]);
    expect(await ids("?suggestion=quick")).toEqual([zero.id, never.id, old.id]);
    expect(await ids("?suggestion=neglected&tag=meal&q=old")).toEqual([old.id]);
  });

  test("last cooked and history use this household only and show its cooking actors", async () => {
    const owner = await householdMember("insights-history");
    const guest = await signUp("insights-cook-guest");
    await join(owner, guest);
    const outsider = await householdMember("insights-history-outsider");
    const me = await identity(owner);
    const guestMe = await identity(guest);
    const foreignMe = await identity(outsider);
    const recipe = await createRecipe(owner, { title: "History" });
    const at = "2025-06-01T12:00:00.000Z";
    await db.insert(cookLog).values([
      {
        householdId: me.activeHouseholdId,
        recipeId: recipe.id,
        userId: guestMe.user.id,
        cookedAt: new Date(at),
      },
      {
        householdId: foreignMe.activeHouseholdId,
        recipeId: recipe.id,
        userId: foreignMe.user.id,
        cookedAt: new Date("2026-06-01T12:00:00Z"),
      },
    ]);
    expect((await list(owner))[0]?.lastCookedAt).toBe(at);
    const detail = insightSchema.parse(
      await (await owner.request(`/api/recipes/${recipe.id}`)).json(),
    );
    expect(detail.lastCookedAt).toBe(at);
    const historyResponse = await guest.request(
      `/api/recipes/${recipe.id}/history`,
    );
    expect(historyResponse.status).toBe(200);
    const history = z
      .array(
        z.object({ cookedAt: z.string(), cookedBy: z.string().nullable() }),
      )
      .parse(await historyResponse.json());
    expect(history).toEqual([{ cookedAt: at, cookedBy: guestMe.user.name }]);
    expect(
      (await outsider.request(`/api/recipes/${recipe.id}/history`)).status,
    ).toBe(404);
  });
});
