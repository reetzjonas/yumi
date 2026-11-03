import { expect, test } from "bun:test";
import { Readable } from "node:stream";
import { HTTPException } from "hono/http-exception";
import type { RecipeHttpTransport } from "./recipe-import/transport";
import { importRecipeDraft } from "./routes/recipe-import";
import {
  client,
  createHousehold,
  householdMember,
  signUp,
} from "./test/client";

const page = `<html><head><script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Recipe",
      name: "Zwiebelsuppe",
      recipeYield: "4 Portionen",
      prepTime: "PT15M",
      cookTime: "PT1H",
      image: "https://example.org/soup.png",
      recipeIngredient: ["3 Zwiebeln", "1 Prise Glitzerstaub"],
      recipeInstructions: [
        { "@type": "HowToStep", text: "Zwiebeln schneiden." },
      ],
    },
  ],
})}</script></head><body></body></html>`;
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBmkAAAAASUVORK5CYII=",
  "base64",
);

const transport: RecipeHttpTransport = {
  resolve: async () => [{ address: "93.184.216.34", family: 4 }],
  request: async (url) =>
    url.pathname.endsWith(".png")
      ? {
          status: 200,
          headers: new Headers({ "content-type": "image/png" }),
          body: Readable.from([png]),
        }
      : {
          status: 200,
          headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
          body: Readable.from([page]),
        },
};

async function householdId() {
  const c = await signUp(`import-${crypto.randomUUID().slice(0, 8)}`);
  return createHousehold(c, "Import");
}

test("an import returns an unsaved draft with catalog links and the image", async () => {
  const result = await importRecipeDraft(
    await householdId(),
    "https://example.org/zwiebelsuppe",
    transport,
  );

  expect(result.draft).toMatchObject({
    title: "Zwiebelsuppe",
    servings: 4,
    prepMinutes: 15,
    cookMinutes: 60,
    sourceUrl: "https://example.org/zwiebelsuppe",
    steps: [{ text: "Zwiebeln schneiden." }],
  });
  const [onion, unknown] = result.draft.ingredients;
  expect(onion?.ingredientId).toEqual(expect.any(String));
  expect(unknown?.ingredientId).toBeNull();
  expect(result.image).toEqual({
    mimeType: "image/png",
    dataBase64: png.toString("base64"),
  });
});

test.each([
  [
    "a page without recipe data",
    "<html><body>Hallo</body></html>",
    422,
    "import_no_recipe",
  ],
  ["a non-HTML response", null, 422, "import_failed"],
] as const)(
  "%s is rejected with the matching error code",
  async (_name, body, status, message) => {
    const failing: RecipeHttpTransport = {
      ...transport,
      request: async () => ({
        status: 200,
        headers: new Headers({
          "content-type": body ? "text/html" : "application/pdf",
        }),
        body: Readable.from([body ?? "%PDF"]),
      }),
    };
    const error = await importRecipeDraft(
      await householdId(),
      "https://example.org/x",
      failing,
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HTTPException);
    expect(error).toMatchObject({ status, message });
  },
);

test("the import endpoint rejects private targets and anonymous callers", async () => {
  const c = await householdMember("import-route");
  const blocked = await c.request("/api/recipes/import", {
    method: "POST",
    body: JSON.stringify({ url: "http://127.0.0.1/recipe" }),
  });
  expect(blocked.status).toBe(400);
  expect(await blocked.json()).toEqual({ error: "import_invalid_url" });
  const malformed = await c.request("/api/recipes/import", {
    method: "POST",
    body: JSON.stringify({ url: "file:///etc/passwd" }),
  });
  expect(malformed.status).toBe(400);
  const anonymous = await client().request("/api/recipes/import", {
    method: "POST",
    body: JSON.stringify({ url: "https://example.org/" }),
  });
  expect(anonymous.status).toBe(401);
});
