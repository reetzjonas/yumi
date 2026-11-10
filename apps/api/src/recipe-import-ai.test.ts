import { expect, test } from "bun:test";
import { Readable } from "node:stream";
import { recipe } from "@yumi/db/schema";
import { eq } from "drizzle-orm";
import { createAi, readAiConfig } from "./ai";
import { aiServer, completion } from "./ai/test-server";
import { db } from "./db";
import { parseIngredientLines } from "./ingredient-parsing";
import { importRecipe } from "./recipe-import";
import type { RecipeHttpTransport } from "./recipe-import/transport";
import { importRecipeDraft } from "./routes/recipe-import";
import { createHousehold, signUp } from "./test/client";

const sourceUrl = "https://example.org/soup";
const plainPage = `<nav>Ignore this menu</nav><script>private_script</script>
<main><h1>Onion soup</h1><p>Serves 4</p><p>3 onions</p><p>Slice and simmer.</p></main>`;
const generatedRecipe = {
  title: "Onion soup",
  description: null,
  servings: 4,
  prepMinutes: 5,
  cookMinutes: 20,
  ingredients: ["3 onions"],
  steps: ["Slice and simmer."],
};
const transport = (html: string): RecipeHttpTransport => ({
  resolve: async () => [{ address: "93.184.216.34", family: 4 }],
  request: async () => ({
    status: 200,
    headers: new Headers({ "content-type": "text/html" }),
    body: Readable.from([html]),
  }),
});

async function householdId() {
  return createHousehold(
    await signUp(`ai-import-${crypto.randomUUID().slice(0, 8)}`),
    "AI import",
  );
}

test("unstructured recipe text becomes a catalog-linked review draft without saving", async () => {
  const server = aiServer("ollama", ({ model }) =>
    completion("ollama", model, JSON.stringify({ recipe: generatedRecipe })),
  );
  const id = await householdId();

  const result = await importRecipeDraft(
    id,
    sourceUrl,
    transport(plainPage),
    server.client,
  );

  expect(result.method).toBe("ai");
  expect(result.draft).toMatchObject({
    title: "Onion soup",
    servings: 4,
    sourceUrl,
    ingredients: [
      {
        rawText: "3 onions",
        quantity: 3,
        unit: null,
        ingredientId: expect.any(String),
      },
    ],
    steps: [{ text: "Slice and simmer." }],
  });
  expect(
    await db.select().from(recipe).where(eq(recipe.householdId, id)),
  ).toEqual([]);
  expect(server.requests()).toBe(1);
});

test("structured recipes bypass recipe AI extraction", async () => {
  const server = aiServer();
  const page = `<script type="application/ld+json">${JSON.stringify({
    "@type": "Recipe",
    name: "Soup",
    recipeIngredient: ["3 onions"],
    recipeInstructions: "Simmer.",
  })}</script>`;

  const result = await importRecipe(sourceUrl, transport(page), server.client);

  expect(result.method).toBe("jsonld");
  expect(server.requests()).toBe(0);
});

test.each([
  JSON.stringify({ recipe: null }),
  JSON.stringify({ recipe: { ...generatedRecipe, servings: 0 } }),
  "not JSON",
  "provider-error",
])("unusable AI result %s retains the manual import path", async (output) => {
  const server = aiServer("ollama", ({ model }) =>
    output === "provider-error"
      ? Response.json({ error: { message: "failed" } }, { status: 401 })
      : completion("ollama", model, output),
  );

  const error = await importRecipe(
    sourceUrl,
    transport(plainPage),
    server.client,
  ).catch((error: unknown) => error);

  expect(error).toMatchObject({ code: "no_recipe", sourceUrl });
});

test("disabled AI leaves text-only import unavailable without contacting a provider", async () => {
  const server = aiServer();
  const client = createAi({ ...server.config, enabled: false });

  const error = await importRecipe(
    sourceUrl,
    transport(plainPage),
    client,
  ).catch((error: unknown) => error);

  expect(error).toMatchObject({ code: "no_recipe" });
  expect(server.requests()).toBe(0);
});

test("one AI batch repairs uncertain ingredient lines and preserves their original order", async () => {
  const server = aiServer("ollama", ({ model }) =>
    completion(
      "ollama",
      model,
      JSON.stringify({
        lines: [
          {
            index: 2,
            name: "Glitzerstaub",
            quantity: 3,
            unit: "pcs",
            note: "sliced",
            optional: false,
          },
          {
            index: 1,
            name: "Mehl",
            quantity: 250,
            unit: "g",
            note: null,
            optional: true,
          },
        ],
      }),
    ),
  );

  const result = await parseIngredientLines(
    await householdId(),
    ["2 Zwiebeln", "Mehl fuer den Teig", "Glitzerstaub nach Geschmack"],
    server.client,
  );
  expect(server.events).toMatchObject([{ status: "success" }]);

  expect(
    result.map((line) => ({
      quantity: line.quantity,
      unit: line.unit,
      optional: line.optional,
      linked: line.ingredient !== null,
    })),
  ).toEqual([
    { quantity: 2, unit: null, optional: false, linked: true },
    { quantity: 250, unit: "g", optional: true, linked: true },
    { quantity: 3, unit: "pcs", optional: false, linked: false },
  ]);
  expect(server.requests()).toBe(1);
});

test("confident lines with only a fuzzy catalog link go to the AI batch", async () => {
  const server = aiServer("ollama", ({ model }) =>
    completion(
      "ollama",
      model,
      JSON.stringify({
        lines: [
          {
            index: 0,
            name: "Bonitoflocken",
            quantity: null,
            unit: null,
            note: "Fischflocken",
            optional: false,
          },
        ],
      }),
    ),
  );
  const id = await householdId();
  const [fuzzy] = await parseIngredientLines(
    id,
    ["Flocken"],
    createAi(readAiConfig({})),
  );
  expect(fuzzy?.ingredient).not.toBeNull();
  expect(fuzzy?.confidentMatch).toBe(false);

  const [result] = await parseIngredientLines(id, ["Flocken"], server.client);

  expect(server.requests()).toBe(1);
  expect(result).toMatchObject({
    name: "Bonitoflocken",
    ingredient: { key: "bonito-flakes" },
    confidentMatch: true,
  });
});

test.each([{ indices: [] }, { indices: [0, 0] }, { indices: [0, 99] }])(
  "incomplete or foreign batch indices %j keep rule-based parsing",
  async ({ indices }) => {
    const server = aiServer("ollama", ({ model }) =>
      completion(
        "ollama",
        model,
        JSON.stringify({
          lines: indices.map((index) => ({
            index,
            name: "onions",
            quantity: 99,
            unit: "pcs",
            note: null,
            optional: false,
          })),
        }),
      ),
    );
    const id = await householdId();
    const input = ["Glitzerstaub", "Glitzerstaub"];
    const baseline = await parseIngredientLines(
      id,
      input,
      createAi(readAiConfig({})),
    );

    const result = await parseIngredientLines(id, input, server.client);

    expect(result).toEqual(baseline);
  },
);
