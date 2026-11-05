import { describe, expect, test } from "bun:test";
import {
  ingredient,
  mealQueueEntry,
  member,
  recurringItem,
  session,
} from "@yumi/db/schema";
import { householdTransferSchema } from "@yumi/shared";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { signUp } from "../test/client";
import { exported, household, request, transferApp } from "./test-app";
import { fixture } from "./test-fixtures";

describe("household transfer isolation", () => {
  test("exports only the active household and rejects unauthenticated or non-member sessions", async () => {
    const source = await fixture();
    const other = await household("transfer-isolation");
    const otherArchive = await exported(other.c);
    expect(otherArchive.recipes).toEqual([]);
    expect(otherArchive.ingredients).toEqual([]);
    expect(otherArchive.items).toEqual([]);
    expect(otherArchive.images).toEqual([]);
    expect(otherArchive.cookLogs).toEqual([]);
    const anonymous = await transferApp.request("/transfer/export");
    expect(anonymous.status).toBe(401);
    const anonymousImport = await transferApp.request("/transfer/import", {
      method: "POST",
    });
    expect(anonymousImport.status).toBe(401);
    const noHousehold = await signUp(`transfer-no-home-${crypto.randomUUID()}`);
    expect((await request(noHousehold, "export")).status).toBe(409);
    const [otherMember] = await db
      .select()
      .from(member)
      .where(eq(member.organizationId, other.id));
    if (!otherMember) throw new Error("member missing");
    await db
      .update(session)
      .set({ activeOrganizationId: source.id })
      .where(eq(session.userId, otherMember.userId));
    expect((await request(other.c, "export")).status).toBe(403);
    expect(
      (await request(other.c, "import", await exported(source.c))).status,
    ).toBe(403);
  });

  test("does not accept foreign existing IDs even when they exist in the database", async () => {
    const source = await fixture();
    const foreign = await fixture();
    const archive = await exported(source.c);
    const invalid = {
      ...archive,
      queue: archive.queue.map((row) => ({
        ...row,
        recipeId: foreign.dish.id,
      })),
    };
    expect((await request(source.c, "import", invalid)).status).toBe(400);
    const invalidIngredient = {
      ...archive,
      pantry: archive.pantry.map((row) => ({
        ...row,
        ingredientId: foreign.custom.id,
      })),
    };
    expect((await request(source.c, "import", invalidIngredient)).status).toBe(
      400,
    );
    // Even a database ID supplied as a valid local handle is cloned, never attached.
    const remapped = householdTransferSchema.parse(
      JSON.parse(
        JSON.stringify(archive).replaceAll(source.dish.id, foreign.dish.id),
      ),
    );
    expect((await request(source.c, "import", remapped)).status).toBe(201);
    const own = await exported(source.c);
    expect(own.recipes).toHaveLength(2);
    expect(own.recipes.some((row) => row.id === foreign.dish.id)).toBe(false);
    expect((await exported(foreign.c)).recipes).toHaveLength(1);
  });

  test("drops stale loose references left after normal household deletions", async () => {
    const source = await fixture();
    await db
      .delete(mealQueueEntry)
      .where(eq(mealQueueEntry.id, source.queued.id));
    await db
      .delete(recurringItem)
      .where(eq(recurringItem.id, source.repeated.id));
    const archive = await exported(source.c);
    expect(archive.items[0]?.sources).toEqual([
      { kind: "recipe", id: source.dish.id },
    ]);
    expect(archive.leftovers[0]?.sourceEntryIds).toEqual([]);
    const target = await household("transfer-stale");
    expect((await request(target.c, "import", archive)).status).toBe(201);
  });

  test("global catalog keys never resolve to a private ingredient", async () => {
    const source = await fixture();
    const target = await household("transfer-private-key");
    const archive = await exported(source.c);
    const privateKey = `private-${crypto.randomUUID()}`;
    await db
      .update(ingredient)
      .set({ key: privateKey })
      .where(eq(ingredient.id, source.custom.id));
    const disguised = {
      ...archive,
      ingredients: archive.ingredients.map((row) =>
        row.kind === "global" ? { ...row, key: privateKey } : row,
      ),
    };
    const response = await request(target.c, "import", disguised);
    expect(response.status).toBe(422);
    expect(await response.text()).toContain(
      `unavailable_global_ingredients:${privateKey}`,
    );
    expect((await exported(target.c)).recipes).toEqual([]);
  });
});
