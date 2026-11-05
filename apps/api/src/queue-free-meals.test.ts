import { expect, test } from "bun:test";
import { cookLog, mealQueueEntry } from "@yumi/db/schema";
import { householdTransferSchema } from "@yumi/shared";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import {
  type Client,
  createHousehold,
  householdMember,
  signUp,
} from "./test/client";

const mealSchema = z.object({
  id: z.uuid(),
  recipeId: z.uuid().nullable(),
  title: z.string().nullable(),
  note: z.string().nullable(),
  plannedFor: z.string().nullable(),
  status: z.enum(["queued", "cooked", "skipped"]),
});

async function freeMeal(c: Client) {
  const response = await c.request("/api/queue", {
    method: "POST",
    body: JSON.stringify({
      title: "  Pizza bestellen  ",
      note: "  Mit Freunden  ",
      servings: 1,
      plannedFor: "2026-11-12",
    }),
  });
  expect(response.status).toBe(201);
  return mealSchema.parse(await response.json());
}

test("#69 free meals keep title, note and date through edits and mixed queue ordering", async () => {
  const c = await householdMember("free-meal-edit");
  const first = await freeMeal(c);
  const recipe = z.object({ id: z.uuid() }).parse(
    await (
      await c.request("/api/recipes", {
        method: "POST",
        body: JSON.stringify({ title: "Soup", servings: 2 }),
      })
    ).json(),
  );
  const linked = z.object({ id: z.uuid() }).parse(
    await (
      await c.request("/api/queue", {
        method: "POST",
        body: JSON.stringify({ recipeId: recipe.id, servings: 2 }),
      })
    ).json(),
  );
  const patch = await c.request(`/api/queue/${first.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      title: "Essen bei Oma",
      note: null,
      plannedFor: null,
    }),
  });
  expect(patch.status).toBe(200);
  const order = await c.request("/api/queue/order", {
    method: "PUT",
    body: JSON.stringify({ ids: [linked.id, first.id] }),
  });
  expect(order.status).toBe(200);
  const rows = z
    .array(mealSchema.extend({ recipe: z.object({ id: z.uuid() }).nullable() }))
    .parse(await (await c.request("/api/queue")).json());
  expect(rows.map((row) => row.id)).toEqual([linked.id, first.id]);
  expect(rows[0]).toMatchObject({ title: "Soup", recipe: { id: recipe.id } });
  expect(rows[1]).toMatchObject({
    title: "Essen bei Oma",
    recipeId: null,
    recipe: null,
    note: null,
    plannedFor: null,
  });
  expect(first).toMatchObject({
    title: "Pizza bestellen",
    note: "Mit Freunden",
  });
});

test.each(["cooked", "skipped"] as const)(
  "#69 marking a free meal %s leaves the active queue without creating recipe cook logs",
  async (status) => {
    const c = await signUp(`free-meal-${status}`);
    const householdId = await createHousehold(c, `free-meal-${status}`);
    const entry = await freeMeal(c);

    const response = await c.request(`/api/queue/${entry.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });

    expect(response.status).toBe(200);
    expect(await (await c.request("/api/queue")).json()).toEqual([]);
    expect(
      await db
        .select()
        .from(cookLog)
        .where(eq(cookLog.householdId, householdId)),
    ).toEqual([]);
    expect(
      (
        await db
          .select()
          .from(mealQueueEntry)
          .where(eq(mealQueueEntry.id, entry.id))
      )[0]?.status,
    ).toBe(status);
  },
);

test("#69 free meals are household scoped and excluded from recipe shopping previews", async () => {
  const owner = await householdMember("free-meal-owner");
  const outsider = await householdMember("free-meal-outsider");
  const entry = await freeMeal(owner);

  expect(await (await outsider.request("/api/queue")).json()).toEqual([]);
  expect(
    (
      await outsider.request(`/api/queue/${entry.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: "Changed" }),
      })
    ).status,
  ).toBe(404);
  expect(
    (await outsider.request(`/api/queue/${entry.id}`, { method: "DELETE" }))
      .status,
  ).toBe(404);
  expect(
    (
      await owner.request("/api/queue/shopping-preview", {
        method: "POST",
        body: JSON.stringify({ ids: [entry.id], locale: "de" }),
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await owner.request("/api/recipes", {
        method: "POST",
        body: JSON.stringify({ title: "Suggestion soup" }),
      })
    ).status,
  ).toBe(201);
  const suggestions = await owner.request(
    "/api/leftovers/suggestions?similar=true",
  );
  expect(suggestions.status).toBe(200);
  expect(await suggestions.json()).toEqual([]);
  expect(
    (await owner.request(`/api/queue/${entry.id}`, { method: "DELETE" }))
      .status,
  ).toBe(204);
  expect(await (await owner.request("/api/queue")).json()).toEqual([]);
});

test("#69 rejects meals without identity, blank titles, competing identities and oversized notes", async () => {
  const c = await householdMember("free-meal-invalid");
  for (const input of [
    {},
    { title: " " },
    { title: "x".repeat(201) },
    { title: "Pizza", recipeId: crypto.randomUUID() },
    { title: "Pizza", note: "x".repeat(2001) },
    { title: "Pizza", plannedFor: "2026-02-30" },
  ]) {
    const response = await c.request("/api/queue", {
      method: "POST",
      body: JSON.stringify({ servings: 1, ...input }),
    });
    expect(response.status).toBe(400);
  }
});

test.each(["current", "legacy"] as const)(
  "#69 imports %s household archives without losing meals",
  async (mode) => {
    const source = await householdMember(`free-meal-archive-${mode}`);
    if (mode === "current") await freeMeal(source);
    else {
      const recipe = z.object({ id: z.uuid() }).parse(
        await (
          await source.request("/api/recipes", {
            method: "POST",
            body: JSON.stringify({ title: "Old soup" }),
          })
        ).json(),
      );
      await source.request("/api/queue", {
        method: "POST",
        body: JSON.stringify({ recipeId: recipe.id, servings: 2 }),
      });
    }
    const archive = householdTransferSchema.parse(
      await (await source.request("/api/household-transfer/export")).json(),
    );
    const portable =
      mode === "current"
        ? archive
        : {
            ...archive,
            queue: archive.queue.map(
              ({ title: _title, note: _note, ...record }) => record,
            ),
          };
    const target = await householdMember(`free-meal-target-${mode}`);
    const imported = await target.request("/api/household-transfer/import", {
      method: "POST",
      body: JSON.stringify(portable),
    });
    expect(imported.status).toBe(201);
    const meals = z
      .array(mealSchema)
      .parse(await (await target.request("/api/queue")).json());
    expect(meals).toHaveLength(1);
    expect(meals[0]).toMatchObject(
      mode === "current"
        ? {
            recipeId: null,
            title: "Pizza bestellen",
            note: "Mit Freunden",
            plannedFor: "2026-11-12",
          }
        : { title: "Old soup", note: null },
    );
    expect(meals[0]?.id).not.toBe(archive.queue[0]?.id);
  },
);

test("#69 database constraint rejects a queue entry with neither recipe nor title", async () => {
  const c = await signUp("free-meal-db");
  const householdId = await createHousehold(c, "free-meal-db");
  await expect(
    db
      .insert(mealQueueEntry)
      .values({
        householdId,
        recipeId: null,
        title: null,
        servings: 1,
        position: 0,
      })
      .execute(),
  ).rejects.toThrow();
});
