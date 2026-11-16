import { expect, onTestFinished, spyOn, test } from "bun:test";
import { recipeInputSchema } from "@yumi/shared";
import { z } from "zod";
import { ai, createAi } from "./ai";
import { aiServer, completion } from "./ai/test-server";
import { type Client, householdMember as member } from "./test/client";

const householdMember = (name: string) =>
  member(`${name}-${crypto.randomUUID().slice(0, 8)}`);

function configureAi(client: typeof ai) {
  const capability = spyOn(ai, "capability").mockImplementation(
    client.capability,
  );
  const generate = spyOn(ai, "generateStructured").mockImplementation(
    client.generateStructured,
  );
  onTestFinished(() => {
    capability.mockRestore();
    generate.mockRestore();
  });
}

function answering(output: unknown) {
  const server = aiServer("ollama", ({ model }) =>
    completion("ollama", model, JSON.stringify(output)),
  );
  configureAi(server.client);
  return server;
}

const original = {
  title: "pancakes",
  description: "old text",
  servings: 2,
  tags: ["breakfast"],
  ingredients: [
    { rawText: "1 pinch salt", quantity: 1, unit: "pinch", note: "fine" },
    { rawText: "200 g flour", quantity: 200, unit: "g" },
    { rawText: "2 eggs", quantity: 2, unit: "pcs", optional: true },
  ],
  steps: [
    { text: "Batter:" },
    { text: "Mix flour and eggs. Then fry in a pan and salt." },
  ],
};

const structured = {
  title: "Fluffy pancakes",
  description: "New text",
  ingredients: [
    { index: 1, section: "Batter" },
    { index: 2, section: "Batter" },
    { index: 0, section: "To serve" },
  ],
  steps: [
    { text: "Mix flour and eggs.", ingredients: [1, 2] },
    { text: "Then fry in a pan and salt.", ingredients: [0] },
  ],
};

async function createRecipe(c: Client) {
  const response = await c.request("/api/recipes", {
    method: "POST",
    body: JSON.stringify(original),
  });
  expect(response.status).toBe(201);
  return z.object({ id: z.uuid() }).parse(await response.json()).id;
}

function optimize(c: Client, id: string, texts?: boolean) {
  return c.request(`/api/recipes/${id}/optimize`, {
    method: "POST",
    body: JSON.stringify(texts === undefined ? {} : { texts }),
  });
}

const draftResponse = z.object({ draft: recipeInputSchema });

test.each([
  { texts: false, title: "pancakes", description: "old text" },
  { texts: true, title: "Fluffy pancakes", description: "New text" },
])(
  "texts=$texts returns a reordered draft with unchanged ingredient lines and saves nothing",
  async ({ texts, title, description }) => {
    const c = await householdMember(`optimize-${texts}`);
    const id = await createRecipe(c);
    const before = await (await c.request(`/api/recipes/${id}`)).json();
    const server = answering(structured);

    const response = await optimize(c, id, texts);

    expect(response.status).toBe(200);
    const { draft } = draftResponse.parse(await response.json());
    expect(draft).toMatchObject({
      title,
      description,
      servings: 2,
      tags: ["breakfast"],
      ingredients: [
        { rawText: "200 g flour", quantity: 200, unit: "g", section: "Batter" },
        { rawText: "2 eggs", optional: true, section: "Batter" },
        { rawText: "1 pinch salt", note: "fine", section: "To serve" },
      ],
      steps: [
        { text: "Mix flour and eggs.", ingredientPositions: [0, 1] },
        { text: "Then fry in a pan and salt.", ingredientPositions: [2] },
      ],
    });
    expect(server.requests()).toBe(1);
    expect(await (await c.request(`/api/recipes/${id}`)).json()).toEqual(
      before,
    );
  },
);

test.each([
  {
    name: "a lost ingredient",
    change: { ingredients: [{ index: 0, section: null }] },
  },
  {
    name: "a duplicated ingredient",
    change: {
      ingredients: [0, 0, 1].map((index) => ({ index, section: null })),
    },
  },
  {
    name: "a foreign step ingredient",
    change: { steps: [{ text: "Mix.", ingredients: [7] }] },
  },
])("an answer with $name is rejected", async ({ change }) => {
  const c = await householdMember("optimize-invalid");
  const id = await createRecipe(c);
  answering({ ...structured, ...change });

  const response = await optimize(c, id);

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({ error: "optimize_failed" });
});

test("unavailable AI answers 503 without contacting a provider", async () => {
  const c = await householdMember("optimize-off");
  const id = await createRecipe(c);
  const server = aiServer();
  configureAi(createAi({ ...server.config, enabled: false }));

  const response = await optimize(c, id);

  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "optimize_unavailable" });
  expect(server.requests()).toBe(0);
});

test("a recipe of another household is not found", async () => {
  const owner = await householdMember("optimize-owner");
  const id = await createRecipe(owner);
  const other = await householdMember("optimize-other");
  const server = answering(structured);

  const response = await optimize(other, id);

  expect(response.status).toBe(404);
  expect(server.requests()).toBe(0);
});
