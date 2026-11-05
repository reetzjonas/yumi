import { describe, expect, test } from "bun:test";
import { HOUSEHOLD_TRANSFER_MAX_BYTES } from "@yumi/shared";
import { exported, household, request, transferApp } from "./test-app";
import { fixture } from "./test-fixtures";

describe("household transfer validation", () => {
  test("rejects malformed JSON, versions, unknown ownership fields, duplicate IDs and dangling references", async () => {
    const source = await fixture();
    const target = await household("transfer-invalid");
    const archive = await exported(source.c);
    const badBodies: unknown[] = [
      { ...archive, version: 2 },
      { ...archive, householdId: source.id },
      { ...archive, recipes: [...archive.recipes, ...archive.recipes] },
      {
        ...archive,
        recipes: archive.recipes.map((row) => ({
          ...row,
          createdBy: "foreign-user",
        })),
      },
      {
        ...archive,
        recipes: archive.recipes.map((row) => ({
          ...row,
          sourceUrl: "javascript:alert(1)",
        })),
      },
      {
        ...archive,
        recipes: archive.recipes.map((row) => ({
          ...row,
          sourceUrl: "invalid-url",
        })),
      },
      {
        ...archive,
        queue: archive.queue.map((row) => ({
          ...row,
          recipeId: crypto.randomUUID(),
        })),
      },
      {
        ...archive,
        recipeIngredients: archive.recipeIngredients.map((row) => ({
          ...row,
          ingredientId: crypto.randomUUID(),
        })),
      },
      {
        ...archive,
        steps: archive.steps.map((row) => ({
          ...row,
          ingredientRefs: [crypto.randomUUID()],
        })),
      },
      {
        ...archive,
        items: archive.items.map((row) => ({
          ...row,
          sources: [{ kind: "queue", id: crypto.randomUUID() }],
        })),
      },
      {
        ...archive,
        leftovers: archive.leftovers.map((row) => ({
          ...row,
          sourceEntryIds: [crypto.randomUUID()],
        })),
      },
      {
        ...archive,
        ingredients: archive.ingredients.map((row) =>
          row.kind === "global" ? { ...row, key: "" } : row,
        ),
      },
      {
        ...archive,
        images: archive.images.map((row) => ({ ...row, full: "not-base64" })),
      },
      {
        ...archive,
        images: archive.images.map((row) => ({
          ...row,
          full: Buffer.from("RIFFxxxxWEBPbroken").toString("base64"),
        })),
      },
    ];
    for (const body of badBodies) {
      const response = await request(target.c, "import", body);
      expect(response.status).toBe(400);
    }
    const malformed = await transferApp.request("/transfer/import", {
      method: "POST",
      headers: { cookie: target.c.cookie, "content-type": "application/json" },
      body: "{",
    });
    expect(malformed.status).toBe(400);
    const wrongType = await transferApp.request("/transfer/import", {
      method: "POST",
      headers: { cookie: target.c.cookie, "content-type": "text/plain" },
      body: "{}",
    });
    expect(wrongType.status).toBe(415);
    expect((await exported(target.c)).recipes).toEqual([]);
    expect((await exported(target.c)).ingredients).toEqual([]);
  });

  test("rejects missing global keys and rolls back earlier inserts on a later unavailable category", async () => {
    const source = await fixture();
    const target = await household("transfer-atomic");
    const archive = await exported(source.c);
    const unavailableGlobal = {
      ...archive,
      ingredients: archive.ingredients.map((row) =>
        row.kind === "global" ? { ...row, key: "does-not-exist" } : row,
      ),
    };
    const missing = await request(target.c, "import", unavailableGlobal);
    expect(missing.status).toBe(422);
    expect(await missing.text()).toContain(
      "unavailable_global_ingredients:does-not-exist",
    );
    const unavailableLateCategory = {
      ...archive,
      recurring: archive.recurring.map((row) => ({
        ...row,
        categoryKey: "does-not-exist",
      })),
    };
    const failed = await request(target.c, "import", unavailableLateCategory);
    expect(failed.status).toBe(422);
    expect(await failed.text()).toContain(
      "unavailable_category:does-not-exist",
    );
    const unchanged = await exported(target.c);
    for (const value of Object.values(unchanged))
      if (Array.isArray(value)) expect(value).toEqual([]);
    expect((await request(target.c, "import", archive)).status).toBe(201);
  });

  test("bounds payloads and rejects cross-recipe ingredient references", async () => {
    const source = await fixture();
    const archive = await exported(source.c);
    const otherRecipe = { ...archive.recipes[0], id: crypto.randomUUID() };
    const crossRecipe = {
      ...archive,
      recipes: [...archive.recipes, otherRecipe],
      steps: archive.steps.map((row) => ({ ...row, recipeId: otherRecipe.id })),
    };
    expect((await request(source.c, "import", crossRecipe)).status).toBe(400);
    const oversized = await transferApp.request("/transfer/import", {
      method: "POST",
      headers: {
        cookie: source.c.cookie,
        "content-type": "application/json",
        "content-length": String(HOUSEHOLD_TRANSFER_MAX_BYTES + 1),
      },
      body: "{}",
    });
    expect(oversized.status).toBe(413);
    const tooMany = {
      ...archive,
      recipes: Array.from({ length: 10_001 }, () => ({
        ...archive.recipes[0],
        id: crypto.randomUUID(),
      })),
    };
    expect((await request(source.c, "import", tooMany)).status).toBe(400);
  });
});
