import { expect, onTestFinished, spyOn, test } from "bun:test";
import { recipe } from "@yumi/db/schema";
import { recipeInputSchema } from "@yumi/shared";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { ai, createAi } from "./ai";
import { aiServer, completion } from "./ai/test-server";
import { db } from "./db";
import { type Client, createHousehold, signUp } from "./test/client";

const prompt = "Flammkuchen mit Feta, Zwiebeln, Speck und Roter Beete";
const written = {
  title: "Flammkuchen mit Feta und Roter Bete",
  description: "Knusprig, salzig und leicht süß.",
  servings: 2,
  prepMinutes: 20,
  cookMinutes: 12,
  ingredients: ["200 g Mehl", "100 g Feta", "2 Zwiebeln", "1 Rote Bete"],
  steps: ["Teig kneten.", "Belegen und bei 250 °C 12 Minuten backen."],
};

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

const messagesSchema = z.object({
  messages: z.array(z.object({ role: z.string(), content: z.unknown() })),
});

/** Answers the generation call; later ingredient calls get an unusable answer and fall back to rules. */
function answering(recipeOutput: unknown) {
  const prompts: unknown[] = [];
  const server = aiServer("ollama", ({ model, attempt, body }) => {
    if (attempt > 1) return completion("ollama", model, "{}");
    prompts.push(
      messagesSchema.parse(body).messages.find((m) => m.role === "user")
        ?.content,
    );
    return completion(
      "ollama",
      model,
      JSON.stringify({ recipe: recipeOutput }),
    );
  });
  configureAi(server.client);
  return { ...server, prompts };
}

async function member() {
  const c = await signUp(`generate-${crypto.randomUUID().slice(0, 8)}`);
  return { c, householdId: await createHousehold(c, "Kitchen") };
}

function generate(c: Client, text: string) {
  return c.request("/api/recipes/import/generate", {
    method: "POST",
    body: JSON.stringify({ prompt: text }),
  });
}

test("a short description becomes an unsaved, catalog-linked draft", async () => {
  const { c, householdId } = await member();
  const server = answering(written);

  const response = await generate(c, `  ${prompt} `);

  expect(response.status).toBe(200);
  const result = z
    .object({
      draft: recipeInputSchema,
      method: z.literal("generated"),
      image: z.null(),
    })
    .parse(await response.json());
  expect(result.draft).toMatchObject({
    title: written.title,
    servings: 2,
    prepMinutes: 20,
    cookMinutes: 12,
    ingredients: [
      { rawText: "200 g Mehl", quantity: 200, unit: "g" },
      { rawText: "100 g Feta", quantity: 100, unit: "g" },
      { rawText: "2 Zwiebeln", quantity: 2 },
      { rawText: "1 Rote Bete", quantity: 1 },
    ],
    steps: [
      { text: "Teig kneten." },
      { text: "Belegen und bei 250 °C 12 Minuten backen." },
    ],
  });
  expect(result.draft.ingredients[0]?.ingredientId).toBeString();
  expect(server.prompts).toEqual([prompt]);
  expect(
    await db.select().from(recipe).where(eq(recipe.householdId, householdId)),
  ).toEqual([]);
});

test("an answer without a recipe is rejected", async () => {
  const { c } = await member();
  answering(null);

  const response = await generate(c, "Wie spät ist es?");

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({ error: "generate_failed" });
});

test("unavailable AI answers 503 without contacting a provider", async () => {
  const { c } = await member();
  const server = aiServer();
  configureAi(createAi({ ...server.config, enabled: false }));

  const capabilities = await c.request("/api/recipes/import/capabilities");
  const response = await generate(c, prompt);

  expect(await capabilities.json()).toMatchObject({ generate: false });
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "generate_unavailable" });
  expect(server.requests()).toBe(0);
});

test.each([
  { name: "an empty prompt", text: "   " },
  { name: "an overlong prompt", text: "x".repeat(1001) },
])("$name is rejected before the AI is called", async ({ text }) => {
  const { c } = await member();
  const server = answering(written);

  const response = await generate(c, text);

  expect(response.status).toBe(400);
  expect(server.requests()).toBe(0);
});
