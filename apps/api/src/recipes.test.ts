import { describe, expect, test } from "bun:test";
import { cookLog, recipeStep } from "@yumi/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { type Client, client, householdMember, signUp } from "./test/client";

const recipeSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  tags: z.array(z.string()),
  ingredients: z.array(
    z.object({
      id: z.uuid(),
      section: z.string().nullable(),
      rawText: z.string(),
      quantity: z.number().nullable(),
      unit: z.string().nullable(),
      ingredientId: z.uuid().nullable(),
      optional: z.boolean(),
      excludeFromNutrition: z.boolean(),
      ingredient: z.object({ nameDe: z.string() }).nullable(),
    }),
  ),
  steps: z.array(
    z.object({
      text: z.string(),
      ingredientRefs: z.array(z.uuid()),
      ingredientPositions: z.array(z.number()).nullable(),
    }),
  ),
});
type Recipe = z.infer<typeof recipeSchema>;

async function onionId(c: Client) {
  const res = await c.request("/api/ingredients?q=Zwiebel&limit=1");
  const [onion] = (await res.json()) as { id: string }[];
  if (!onion) throw new Error("seed onion missing");
  return onion.id;
}

async function createRecipe(c: Client, body: object) {
  const res = await c.request("/api/recipes", {
    method: "POST",
    body: JSON.stringify(body),
  });
  expect(res.status).toBe(201);
  return recipeSchema.parse(await res.json());
}

describe("recipes", () => {
  test("create, read, update and delete keep order and links", async () => {
    const c = await householdMember("chef");
    const onion = await onionId(c);
    const created = await createRecipe(c, {
      title: "Zwiebelkuchen",
      servings: 4,
      tags: ["herbst", "herbst", "vegetarisch"],
      sourceUrl: "https://example.com/zwiebelkuchen",
      ingredients: [
        { section: "Teig", rawText: "250 g Mehl", quantity: 250, unit: "g" },
        {
          section: "Belag",
          rawText: "1 kg Zwiebeln",
          quantity: 1,
          unit: "kg",
          ingredientId: onion,
        },
      ],
      steps: [{ text: "Teig kneten" }, { text: "Zwiebeln schmoren" }],
    });
    expect(created.tags).toEqual(["herbst", "vegetarisch"]);
    expect(created.ingredients.map((i) => i.section)).toEqual([
      "Teig",
      "Belag",
    ]);
    expect(created.ingredients[1]?.ingredient?.nameDe).toBe("Zwiebel");
    expect(created.ingredients[0]?.ingredient).toBeNull();
    expect(created.ingredients.map((i) => i.excludeFromNutrition)).toEqual([
      false,
      false,
    ]);

    const updated = await c.request(`/api/recipes/${created.id}`, {
      method: "PUT",
      body: JSON.stringify({
        title: "Schwäbischer Zwiebelkuchen",
        steps: [{ text: "Zwiebeln schmoren" }, { text: "Teig kneten" }],
      }),
    });
    expect(updated.status).toBe(200);
    const after = (await updated.json()) as Recipe;
    expect(after.steps.map((s) => s.text)).toEqual([
      "Zwiebeln schmoren",
      "Teig kneten",
    ]);
    expect(after.ingredients).toEqual([]);

    expect(
      (await c.request(`/api/recipes/${created.id}`, { method: "DELETE" }))
        .status,
    ).toBe(204);
    expect((await c.request(`/api/recipes/${created.id}`)).status).toBe(404);
  });

  test("list filters by search text and tag", async () => {
    const c = await householdMember("lister");
    await createRecipe(c, { title: "Linsensuppe", tags: ["suppe"] });
    await createRecipe(c, {
      title: "Tomatensuppe",
      tags: ["suppe", "schnell"],
    });
    await createRecipe(c, { title: "Pfannkuchen", tags: ["süß"] });

    const titles = async (query: string) =>
      (
        (await (await c.request(`/api/recipes${query}`)).json()) as Recipe[]
      ).map((r) => r.title);
    expect((await titles("?q=suppe")).sort()).toEqual([
      "Linsensuppe",
      "Tomatensuppe",
    ]);
    expect(await titles("?tag=schnell")).toEqual(["Tomatensuppe"]);
    expect(await titles("?q=50%25")).toEqual([]);
    expect(await (await c.request("/api/recipes/tags")).json()).toEqual([
      "schnell",
      "suppe",
      "süß",
    ]);
  });

  test("list search also matches ingredient names", async () => {
    const c = await householdMember("ingredient-search");
    const onion = await onionId(c);
    await createRecipe(c, {
      title: "Herbstkuchen",
      ingredients: [{ rawText: "2 Zwiebeln", ingredientId: onion }],
    });
    await createRecipe(c, {
      title: "Ofengemüse",
      ingredients: [{ rawText: "1 Zucchini" }],
    });
    await createRecipe(c, { title: "Pfannkuchen" });

    const titles = async (q: string) =>
      (
        (await (
          await c.request(`/api/recipes?q=${encodeURIComponent(q)}`)
        ).json()) as Recipe[]
      ).map((r) => r.title);
    expect(await titles("zucchini")).toEqual(["Ofengemüse"]);
    // Matches the linked catalog name in the other language too.
    expect(await titles("onion")).toEqual(["Herbstkuchen"]);
    expect(await titles("kuchen")).toEqual(
      expect.arrayContaining(["Herbstkuchen", "Pfannkuchen"]),
    );
  });

  test("saving automatically links catalog translations and parsed raw names", async () => {
    const c = await householdMember("recipe-auto-steps");
    const onion = await onionId(c);
    const created = await createRecipe(c, {
      title: "Step ingredients",
      ingredients: [
        { rawText: "1 Knolle", ingredientId: onion },
        { rawText: "250 g Mehl, gesiebt" },
      ],
      steps: [
        { text: "Zwiebeln schneiden" },
        { text: "Mix onions with Mehl", ingredientPositions: null },
        { text: "Servieren" },
      ],
    });
    expect(created.steps.map((step) => step.ingredientPositions)).toEqual([
      null,
      null,
      null,
    ]);
    const onionLineId = z.uuid().parse(created.ingredients[0]?.id);
    expect(created.steps[0]?.ingredientRefs).toEqual([onionLineId]);
    expect(created.steps[1]?.ingredientRefs).toEqual(
      created.ingredients.map((line) => line.id),
    );
    expect(created.steps[2]?.ingredientRefs).toEqual([]);
    const stored = await db
      .select()
      .from(recipeStep)
      .where(eq(recipeStep.recipeId, created.id))
      .orderBy(recipeStep.position);
    expect(stored.map((step) => step.ingredientRefsManual)).toEqual([
      false,
      false,
      false,
    ]);
    expect(stored.map((step) => step.ingredientRefs)).toEqual([
      [onionLineId],
      created.ingredients.map((line) => line.id),
      [],
    ]);

    const loaded = recipeSchema.parse(
      await (await c.request(`/api/recipes/${created.id}`)).json(),
    );
    expect(loaded.steps).toEqual(created.steps);
  });

  test("manual references override matches and rebind to new ingredient IDs on edit", async () => {
    const c = await householdMember("recipe-manual-steps");
    const created = await createRecipe(c, {
      title: "Manual steps",
      ingredients: [{ rawText: "1 Zwiebel" }, { rawText: "200 g Mehl" }],
      steps: [
        { text: "Zwiebeln schneiden", ingredientPositions: [1, 1] },
        { text: "Mehl sieben", ingredientPositions: [] },
      ],
    });
    expect(created.steps[0]?.ingredientPositions).toEqual([1]);
    const oldFlourId = z.uuid().parse(created.ingredients[1]?.id);
    expect(created.steps[0]?.ingredientRefs).toEqual([oldFlourId]);
    expect(created.steps[1]?.ingredientRefs).toEqual([]);

    const response = await c.request(`/api/recipes/${created.id}`, {
      method: "PUT",
      body: JSON.stringify({
        title: created.title,
        ingredients: [{ rawText: "200 g Mehl" }, { rawText: "1 Zwiebel" }],
        steps: [
          { text: "Zwiebeln schneiden", ingredientPositions: [0] },
          { text: "Mehl sieben", ingredientPositions: [] },
          { text: "Zwiebeln schneiden", ingredientPositions: null },
        ],
      }),
    });
    expect(response.status).toBe(200);
    const updated = recipeSchema.parse(await response.json());
    expect(updated.steps.map((step) => step.ingredientPositions)).toEqual([
      [0],
      [],
      null,
    ]);
    const newFlourId = z.uuid().parse(updated.ingredients[0]?.id);
    const newOnionId = z.uuid().parse(updated.ingredients[1]?.id);
    expect(updated.steps[0]?.ingredientRefs).toEqual([newFlourId]);
    expect(updated.steps[2]?.ingredientRefs).toEqual([newOnionId]);
    expect(updated.ingredients.map((line) => line.id)).not.toContain(
      oldFlourId,
    );
    const loaded = recipeSchema.parse(
      await (await c.request(`/api/recipes/${created.id}`)).json(),
    );
    expect(loaded.steps).toEqual(updated.steps);
  });

  test("legacy empty references auto-match while explicit empty selections stay manual", async () => {
    const c = await householdMember("recipe-legacy-steps");
    const recipe = await createRecipe(c, {
      title: "Legacy steps",
      ingredients: [{ rawText: "2 Zwiebeln" }],
      steps: [{ text: "Zwiebeln schneiden", ingredientPositions: [] }],
    });
    await db.insert(recipeStep).values({
      recipeId: recipe.id,
      position: 1,
      text: "Zwiebeln schneiden",
    });

    const loaded = recipeSchema.parse(
      await (await c.request(`/api/recipes/${recipe.id}`)).json(),
    );

    expect(loaded.steps.map((step) => step.ingredientPositions)).toEqual([
      [],
      null,
    ]);
    const onionId = z.uuid().parse(recipe.ingredients[0]?.id);
    expect(loaded.steps.map((step) => step.ingredientRefs)).toEqual([
      [],
      [onionId],
    ]);
    const stored = await db
      .select()
      .from(recipeStep)
      .where(eq(recipeStep.recipeId, recipe.id))
      .orderBy(recipeStep.position);
    expect(stored.map((step) => step.ingredientRefsManual)).toEqual([
      true,
      false,
    ]);
    expect(stored.map((step) => step.ingredientRefs)).toEqual([[], []]);
  });

  test("cooking a recipe records the actor once for concurrent retries", async () => {
    const c = await householdMember("recipe-cooked");
    const recipe = await createRecipe(c, { title: "Cook me" });
    const requestId = crypto.randomUUID();
    const me = z
      .object({
        user: z.object({ id: z.string() }),
        session: z.object({ activeOrganizationId: z.string() }),
      })
      .parse(await (await c.request("/api/auth/get-session")).json());

    const responses = await Promise.all(
      [1, 2].map(() =>
        c.request(`/api/recipes/${recipe.id}/cooked`, {
          method: "POST",
          body: JSON.stringify({ requestId }),
        }),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    for (const response of responses)
      expect(await response.json()).toEqual({ ok: true });
    const logs = await db
      .select()
      .from(cookLog)
      .where(eq(cookLog.recipeId, recipe.id));
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      id: requestId,
      householdId: me.session.activeOrganizationId,
      recipeId: recipe.id,
      userId: me.user.id,
    });
  });

  test("cooking rejects foreign recipes and request IDs bound to another recipe or household", async () => {
    const owner = await householdMember("recipe-cook-owner");
    const outsider = await householdMember("recipe-cook-outsider");
    const recipe = await createRecipe(owner, { title: "Owned" });
    const second = await createRecipe(owner, { title: "Second" });
    const foreign = await createRecipe(outsider, { title: "Foreign" });
    const requestId = crypto.randomUUID();
    const cooked = (c: Client, id: string) =>
      c.request(`/api/recipes/${id}/cooked`, {
        method: "POST",
        body: JSON.stringify({ requestId }),
      });

    expect((await cooked(outsider, recipe.id)).status).toBe(404);
    expect(
      await db.select().from(cookLog).where(eq(cookLog.id, requestId)),
    ).toEqual([]);
    expect((await cooked(owner, recipe.id)).status).toBe(200);
    for (const [c, id] of [
      [owner, second.id],
      [outsider, foreign.id],
    ] as const) {
      const response = await cooked(c, id);
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "request_id_conflict" });
      expect(
        await db.select().from(cookLog).where(eq(cookLog.recipeId, id)),
      ).toEqual([]);
    }
    expect((await cooked(owner, crypto.randomUUID())).status).toBe(404);
  });

  test("cooking validates request IDs and requires an active household", async () => {
    const c = await householdMember("recipe-cook-invalid");
    const recipe = await createRecipe(c, { title: "Validate cooking" });
    const path = `/api/recipes/${recipe.id}/cooked`;
    for (const body of [{}, { requestId: "invalid" }]) {
      expect(
        (await c.request(path, { method: "POST", body: JSON.stringify(body) }))
          .status,
      ).toBe(400);
    }
    const body = JSON.stringify({ requestId: crypto.randomUUID() });
    expect(
      (await client().request(path, { method: "POST", body })).status,
    ).toBe(401);
    const noHousehold = await signUp("recipe-cook-no-household");
    expect(
      (await noHousehold.request(path, { method: "POST", body })).status,
    ).toBe(409);
    expect(
      await db.select().from(cookLog).where(eq(cookLog.recipeId, recipe.id)),
    ).toEqual([]);
  });

  test("recipes and household ingredients stay within their household", async () => {
    const a = await householdMember("recipe-a");
    const b = await householdMember("recipe-b");
    const recipe = await createRecipe(a, { title: "Geheimrezept" });
    const own = await a.request("/api/ingredients", {
      method: "POST",
      body: JSON.stringify({ nameDe: "Hausgewürz" }),
    });
    const spice = (await own.json()) as { id: string };

    expect((await b.request(`/api/recipes/${recipe.id}`)).status).toBe(404);
    expect(await (await b.request("/api/recipes")).json()).toEqual([]);
    expect(
      (
        await b.request(`/api/recipes/${recipe.id}`, {
          method: "PUT",
          body: JSON.stringify({ title: "Geklaut" }),
        })
      ).status,
    ).toBe(404);
    expect(
      (await b.request(`/api/recipes/${recipe.id}`, { method: "DELETE" }))
        .status,
    ).toBe(404);

    const foreign = await b.request("/api/recipes", {
      method: "POST",
      body: JSON.stringify({
        title: "Mit fremder Zutat",
        ingredients: [{ rawText: "1 TL Hausgewürz", ingredientId: spice.id }],
      }),
    });
    expect(foreign.status).toBe(400);
    expect(await foreign.json()).toEqual({ error: "invalid_ingredient" });
  });

  test("invalid input is rejected", async () => {
    const c = await householdMember("recipe-invalid");
    for (const body of [
      {},
      { title: " " },
      { title: "X", sourceUrl: "javascript:alert(1)" },
      { title: "X", ingredients: [{ rawText: "1 x", unit: "bucket" }] },
      { title: "X", steps: [{ text: "Mix", ingredientPositions: [0] }] },
      {
        title: "X",
        ingredients: [{ rawText: "1 onion" }],
        steps: [{ text: "Mix", ingredientPositions: [1] }],
      },
      { title: "X", steps: [{ text: "Mix", ingredientPositions: [-1] }] },
      { title: "X", steps: [{ text: "Mix", ingredientPositions: [0.5] }] },
    ]) {
      const res = await c.request("/api/recipes", {
        method: "POST",
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(400);
    }
  });

  test("an uploaded image is resized to WebP and served per household", async () => {
    const c = await householdMember("photographer");
    const other = await householdMember("photo-other");
    const recipe = await createRecipe(c, { title: "Mit Foto" });
    const png = await new Bun.Image(
      Uint8Array.from(
        atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
        ),
        (ch) => ch.charCodeAt(0),
      ),
    )
      .resize(1600, 1000)
      .png()
      .bytes();
    const upload = async (bytes: Uint8Array) => {
      const form = new FormData();
      form.append("image", new File([bytes], "photo.png"));
      return c.request(`/api/recipes/${recipe.id}/image`, {
        method: "PUT",
        body: form,
      });
    };

    const res = await upload(png);
    expect(res.status).toBe(200);
    const { imageKey } = (await res.json()) as { imageKey: string };
    const detail = (await (
      await c.request(`/api/recipes/${recipe.id}`)
    ).json()) as { imageKey: string };
    expect(detail.imageKey).toBe(imageKey);

    const thumb = await c.request(`/api/recipes/${recipe.id}/image/thumb`);
    expect(thumb.headers.get("content-type")).toBe("image/webp");
    const size = new Bun.Image(new Uint8Array(await thumb.arrayBuffer()));
    expect(await size.metadata()).toMatchObject({ width: 400, height: 250 });
    expect(
      (await other.request(`/api/recipes/${recipe.id}/image/full`)).status,
    ).toBe(404);

    const broken = await upload(new Uint8Array([1, 2, 3]));
    expect(broken.status).toBe(400);
    expect(await broken.json()).toEqual({ error: "invalid_image" });

    expect(
      (
        await c.request(`/api/recipes/${recipe.id}/image`, {
          method: "DELETE",
        })
      ).status,
    ).toBe(204);
    expect(
      (await c.request(`/api/recipes/${recipe.id}/image/thumb`)).status,
    ).toBe(404);
  });
});
