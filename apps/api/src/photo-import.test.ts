import { expect, onTestFinished, spyOn, test } from "bun:test";
import { recipe } from "@yumi/db/schema";
import {
  PHOTO_IMPORT_MAX_BYTES,
  PHOTO_IMPORT_MAX_COUNT,
  recipeInputSchema,
} from "@yumi/shared";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { ai, createAi, readAiConfig } from "./ai";
import { aiServer, completion } from "./ai/test-server";
import { db } from "./db";
import { importPhotoRecipe } from "./recipe-import/photos";
import {
  client,
  createHousehold,
  householdMember,
  signUp,
} from "./test/client";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBmkAAAAASUVORK5CYII=",
  "base64",
);
const photo = () => new File([png], "page.png", { type: "image/png" });
const oversizedPixels = Buffer.from(png);
oversizedPixels.writeUInt32BE(6000, 16);
oversizedPixels.writeUInt32BE(5000, 20);
const extracted = {
  title: "Onion soup",
  description: null,
  servings: 4,
  prepMinutes: 5,
  cookMinutes: 20,
  ingredients: ["3 onions"],
  steps: ["Slice.", "Simmer."],
};
const form = (files: readonly (File | string)[]) => {
  const data = new FormData();
  for (const file of files) data.append("photos[]", file);
  return data;
};

test("#32 multiple local pages become an unsaved review draft and save only on explicit submission", async () => {
  const wire = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const body = z
        .object({
          model: z.string(),
          messages: z.array(
            z.object({ role: z.string(), content: z.unknown() }),
          ),
        })
        .parse(await request.json());
      const parts = z
        .array(
          z.object({
            type: z.literal("image_url"),
            image_url: z.object({ url: z.string() }),
          }),
        )
        .parse(
          body.messages.find((message) => message.role === "user")?.content,
        );
      const dimensions = [];
      for (const part of parts) {
        const encoded = /^data:image\/webp;base64,(.+)$/.exec(
          part.image_url.url,
        );
        if (!encoded?.[1])
          return new Response("Local images required", { status: 400 });
        const metadata = await new Bun.Image(
          Buffer.from(encoded[1], "base64"),
        ).metadata();
        dimensions.push([metadata.width, metadata.height]);
      }
      // The wire contract checks that both images survive, in page order.
      if (
        JSON.stringify(dimensions) !==
        JSON.stringify([
          [1, 1],
          [2, 1],
        ])
      )
        return new Response("Missing or reordered pages", { status: 400 });
      return completion(
        "ollama",
        body.model,
        JSON.stringify({ recipe: extracted }),
      );
    },
  });
  onTestFinished(() => wire.stop(true));
  const vision = createAi(
    readAiConfig({
      AI_ENABLED: "true",
      AI_PROVIDER: "ollama",
      AI_MODEL: "configured-vision-model",
      AI_BASE_URL: `${wire.url}v1`,
    }),
    () => {},
  );
  const capability = spyOn(ai, "capability").mockImplementation(
    vision.capability,
  );
  const generate = spyOn(ai, "generateStructured").mockImplementation(
    vision.generateStructured,
  );
  onTestFinished(() => {
    capability.mockRestore();
    generate.mockRestore();
  });
  const c = await signUp(`photo-${crypto.randomUUID().slice(0, 8)}`);
  const householdId = await createHousehold(c, "Cookbook");
  const second = new File(
    [await new Bun.Image(png).resize(2, 1).jpeg().bytes()],
    "second.jpg",
    { type: "image/jpeg" },
  );

  const response = await c.request("/api/recipes/import/photos", {
    method: "POST",
    body: form([photo(), second]),
  });

  expect(response.status).toBe(200);
  const result = z
    .object({ draft: recipeInputSchema, image: z.null() })
    .parse(await response.json());
  expect(result.draft).toMatchObject({
    title: "Onion soup",
    sourceUrl: null,
    ingredients: [{ rawText: "3 onions", quantity: 3 }],
    steps: [{ text: "Slice." }, { text: "Simmer." }],
  });
  expect(result.draft.ingredients[0]?.ingredientId).toBeString();
  expect(
    await db.select().from(recipe).where(eq(recipe.householdId, householdId)),
  ).toEqual([]);

  const saved = await c.request("/api/recipes", {
    method: "POST",
    body: JSON.stringify({ ...result.draft, title: "Reviewed soup" }),
  });
  expect({ status: saved.status, body: await saved.json() }).toMatchObject({
    status: 201,
    body: { title: "Reviewed soup" },
  });
});

test.each([
  { name: "no pages", files: [], code: "photo_import_count" },
  {
    name: "too many pages",
    files: Array.from({ length: PHOTO_IMPORT_MAX_COUNT + 1 }, photo),
    code: "photo_import_count",
  },
  {
    name: "an image URL instead of an uploaded file",
    files: ["http://127.0.0.1/private.png"],
    code: "photo_import_count",
  },
  {
    name: "unsupported MIME",
    files: [new File([png], "page.svg", { type: "image/svg+xml" })],
    code: "photo_import_type",
  },
  {
    name: "empty image",
    files: [new File([], "empty.png", { type: "image/png" })],
    code: "photo_import_size",
  },
  {
    name: "oversized image",
    files: [
      new File([new Uint8Array(PHOTO_IMPORT_MAX_BYTES + 1)], "large.png", {
        type: "image/png",
      }),
    ],
    code: "photo_import_size",
  },
])("the upload boundary rejects $name", async ({ files, code }) => {
  const c = await householdMember(
    `bad-photo-${crypto.randomUUID().slice(0, 8)}`,
  );

  const response = await c.request("/api/recipes/import/photos", {
    method: "POST",
    body: form(files),
  });

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: code });
});

test.each([
  {
    name: "MIME that does not match the decoded format",
    file: new File([png], "fake.jpg", { type: "image/jpeg" }),
    message: "photo_import_type",
  },
  {
    name: "invalid image bytes",
    file: new File(["not an image"], "fake.png", { type: "image/png" }),
    message: "photo_import_invalid",
  },
  {
    name: "a decompression bomb",
    file: new File([oversizedPixels], "large-dimensions.png", {
      type: "image/png",
    }),
    message: "photo_import_invalid",
  },
])("$name never reaches the AI provider", async ({ file, message }) => {
  const server = aiServer();

  const error = await importPhotoRecipe([file], server.client).catch(
    (error: unknown) => error,
  );

  expect(error).toMatchObject({ status: 400, message });
  expect(server.requests()).toBe(0);
});

test.each([
  {
    output: JSON.stringify({ recipe: null }),
    message: "photo_import_no_recipe",
  },
  { output: "not JSON", message: "photo_import_failed" },
  {
    output: JSON.stringify({ recipe: { ...extracted, servings: 0 } }),
    message: "photo_import_failed",
  },
  { output: "provider-error", message: "photo_import_failed" },
])(
  "unusable vision output retains a useful error: $message",
  async ({ output, message }) => {
    const server = aiServer("ollama", ({ model }) =>
      output === "provider-error"
        ? Response.json(
            { error: { message: "no vision support" } },
            { status: 400 },
          )
        : completion("ollama", model, output),
    );

    const error = await importPhotoRecipe([photo()], server.client).catch(
      (error: unknown) => error,
    );

    expect(error).toMatchObject({ status: 422, message });
  },
);

test("disabled photo AI never contacts the provider", async () => {
  const server = aiServer();

  const error = await importPhotoRecipe(
    [photo()],
    createAi({ ...server.config, enabled: false }),
  ).catch((error: unknown) => error);

  expect(error).toMatchObject({
    status: 503,
    message: "photo_import_unavailable",
  });
  expect(server.requests()).toBe(0);
});

test("photo import requires authentication and an active household", async () => {
  const anonymous = await client().request("/api/recipes/import/photos", {
    method: "POST",
    body: form([photo()]),
  });
  expect(anonymous.status).toBe(401);
  const signedIn = await signUp(
    `no-home-photo-${crypto.randomUUID().slice(0, 8)}`,
  );

  const response = await signedIn.request("/api/recipes/import/photos", {
    method: "POST",
    body: form([photo()]),
  });

  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "no_active_household" });
});
