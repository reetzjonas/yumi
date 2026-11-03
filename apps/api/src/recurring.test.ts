import { expect, test } from "bun:test";
import { recurringItem } from "@yumi/db/schema";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { type Client, householdMember } from "./test/client";

type Item = { label: string; quantity: number | null; sources: unknown[] };

async function newList(c: Client) {
  return (
    (await (
      await c.request("/api/shopping/lists", {
        method: "POST",
        body: JSON.stringify({ name: "Weekly" }),
      })
    ).json()) as { id: string }
  ).id;
}

async function items(c: Client, listId: string) {
  return (
    (await (await c.request(`/api/shopping/lists/${listId}`)).json()) as {
      items: (Item & { id: string })[];
    }
  ).items;
}

test("a due rule adds its item once and again after it was bought", async () => {
  const c = await householdMember("recurring-due");
  const listId = await newList(c);
  const created = await c.request(`/api/shopping/lists/${listId}/recurring`, {
    method: "POST",
    body: JSON.stringify({ label: "Milk", quantity: 2, unit: "l", weekday: 6 }),
  });
  expect(created.status).toBe(201);
  const rule = (await created.json()) as { id: string; nextDue: string };
  expect(new Date(`${rule.nextDue}T00:00:00Z`).getUTCDay()).toBe(6);
  expect(await items(c, listId)).toEqual([]);

  await db
    .update(recurringItem)
    .set({ nextDue: "2026-01-03" })
    .where(eq(recurringItem.id, rule.id));
  const [added] = await items(c, listId);
  expect(added).toMatchObject({
    label: "Milk",
    quantity: 2,
    sources: [{ kind: "recurring", id: rule.id }],
  });
  expect(await items(c, listId)).toHaveLength(1);

  // due again while the last one is still unchecked: not doubled
  await db
    .update(recurringItem)
    .set({ nextDue: "2026-01-03" })
    .where(eq(recurringItem.id, rule.id));
  expect(await items(c, listId)).toHaveLength(1);

  await c.request(`/api/shopping/lists/${listId}/events`, {
    method: "POST",
    body: JSON.stringify({
      events: [
        {
          id: crypto.randomUUID(),
          itemId: added?.id,
          clientTs: new Date().toISOString(),
          type: "item_removed",
        },
      ],
    }),
  });
  await db
    .update(recurringItem)
    .set({ nextDue: "2026-01-03" })
    .where(eq(recurringItem.id, rule.id));
  expect(await items(c, listId)).toHaveLength(1);
  const [stored] = await db
    .select({ nextDue: recurringItem.nextDue })
    .from(recurringItem)
    .where(eq(recurringItem.id, rule.id));
  expect(stored && stored.nextDue > new Date().toISOString().slice(0, 10)).toBe(
    true,
  );
});

test("recurring rules are scoped to the household", async () => {
  const owner = await householdMember("recurring-owner");
  const outsider = await householdMember("recurring-outsider");
  const listId = await newList(owner);
  const rule = (await (
    await owner.request(`/api/shopping/lists/${listId}/recurring`, {
      method: "POST",
      body: JSON.stringify({ label: "Bread", weekday: 1, intervalWeeks: 2 }),
    })
  ).json()) as { id: string };
  expect(
    (await outsider.request(`/api/shopping/lists/${listId}/recurring`)).status,
  ).toBe(404);
  expect(
    (
      await outsider.request(`/api/shopping/lists/${listId}/recurring`, {
        method: "POST",
        body: JSON.stringify({ label: "Sneaky", weekday: 1 }),
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await outsider.request(`/api/shopping/recurring/${rule.id}`, {
        method: "DELETE",
      })
    ).status,
  ).toBe(404);
  const own = (await (
    await owner.request("/api/ingredients", {
      method: "POST",
      body: JSON.stringify({ nameDe: "Hausbrot" }),
    })
  ).json()) as { id: string };
  const outsiderList = await newList(outsider);
  expect(
    (
      await outsider.request(`/api/shopping/lists/${outsiderList}/recurring`, {
        method: "POST",
        body: JSON.stringify({ label: "x", ingredientId: own.id, weekday: 1 }),
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await owner.request(`/api/shopping/recurring/${rule.id}`, {
        method: "DELETE",
      })
    ).status,
  ).toBe(204);
});
