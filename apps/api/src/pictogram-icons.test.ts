import { expect, onTestFinished, spyOn, test } from "bun:test";
import { z } from "zod";
import { ai, createAi, readAiConfig } from "./ai";
import { aiServer, completion } from "./ai/test-server";
import { householdMember } from "./test/client";

function configureAi(client: typeof ai) {
  // Forward the app's singleton to a real client and wire-level fake.
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

test.each(["POST", "PUT"])(
  "%s rejects an unsupported ingredient pictogram",
  async (method) => {
    const c = await householdMember(`icon-invalid-${method}`);
    const created = await c.request("/api/ingredients", {
      method: "POST",
      body: JSON.stringify({ nameEn: "Own apple", icon: "🍎" }),
    });
    const { id } = z.object({ id: z.uuid() }).parse(await created.json());

    const response = await c.request(
      method === "POST" ? "/api/ingredients" : `/api/ingredients/${id}`,
      {
        method,
        body: JSON.stringify({ nameEn: "Invalid icon", icon: "😀" }),
      },
    );

    expect(response.status).toBe(400);
  },
);

test.each(["ai", "disabled", "failed", "invalid-output"] as const)(
  "ingredient creation resolves its pictogram when AI is %s",
  async (mode) => {
    const c = await householdMember(`icon-create-${mode}`);
    const server = aiServer("ollama", ({ model }) =>
      mode === "failed"
        ? Response.json({ error: { message: "unavailable" } }, { status: 401 })
        : completion(
            "ollama",
            model,
            JSON.stringify({
              nameDe: "Spezialapfel",
              nameEn: "Special apple",
              synonyms: [],
              categoryKey: "produce",
              defaultUnit: "pcs",
              densityGPerMl: null,
              pieceWeightG: 150,
              nutritionPer100g: null,
              packSizes: [],
              icon: mode === "invalid-output" ? "😀" : "🍎",
            }),
          ),
    );
    const configured =
      mode === "disabled" ? createAi(readAiConfig({})) : server.client;
    configureAi(configured);

    const response = await c.request("/api/ingredients", {
      method: "POST",
      body: JSON.stringify({ nameEn: "Special apple" }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      nameEn: "Special apple",
      icon: mode === "ai" ? "🍎" : null,
    });
    expect(server.requests()).toBe(mode === "disabled" ? 0 : 1);
  },
);

test.each(["🍋", null])(
  "an explicit pictogram %s is saved without a second AI call",
  async (icon) => {
    const c = await householdMember(
      `icon-explicit-${icon ? "chosen" : "none"}`,
    );
    const server = aiServer();
    configureAi(server.client);

    const response = await c.request("/api/ingredients", {
      method: "POST",
      body: JSON.stringify({ nameEn: "Chosen pictogram", icon }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ icon });
    expect(server.requests()).toBe(0);
  },
);
