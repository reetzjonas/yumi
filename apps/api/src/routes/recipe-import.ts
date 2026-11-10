import { ingredient, ingredientCategory } from "@yumi/db/schema";
import { PHOTO_IMPORT_MAX_BYTES, PHOTO_IMPORT_MAX_COUNT } from "@yumi/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono/validator";
import { z } from "zod";
import { ai } from "../ai";
import { matchParsedLine } from "../catalog";
import { type HouseholdEnv, requireAuth, requireHousehold } from "../context";
import { db } from "../db";
import { parseIngredientLines } from "../ingredient-parsing";
import { suggestIngredient } from "../ingredient-suggestions";
import {
  importRecipe,
  type RecipeImportDraft,
  RecipeImportError,
  type RecipeImportErrorCode,
} from "../recipe-import";
import { importPhotoRecipe } from "../recipe-import/photos";
import { importRecipeText } from "../recipe-import/text";
import type { RecipeHttpTransport } from "../recipe-import/transport";

const importInputSchema = z.object({
  url: z.url({ protocol: /^https?$/ }).max(2000),
});

function apiError(code: RecipeImportErrorCode) {
  switch (code) {
    case "no_recipe":
    case "invalid_recipe":
      return new HTTPException(422, { message: "import_no_recipe" });
    case "invalid_url":
    case "blocked_url":
      return new HTTPException(400, { message: "import_invalid_url" });
    case "fetch_failed":
    case "timeout":
    case "response_too_large":
    case "redirect_limit":
    case "unsupported_content":
      return new HTTPException(422, { message: "import_failed" });
    default: {
      const exhaustive: never = code;
      return exhaustive;
    }
  }
}

/** Fetches a recipe page and returns an unsaved draft for the review screen. */
export async function importRecipeDraft(
  householdId: string,
  url: string,
  transport?: RecipeHttpTransport,
  client: typeof ai = ai,
) {
  let imported: Awaited<ReturnType<typeof importRecipe>>;
  try {
    imported = await importRecipe(url, transport, client);
  } catch (error) {
    if (error instanceof RecipeImportError) throw apiError(error.code);
    throw error;
  }
  return {
    draft: await linkDraftIngredients(householdId, imported.draft, client),
    method: imported.method,
    image: imported.image && {
      mimeType: imported.image.mimeType,
      dataBase64: Buffer.from(imported.image.bytes).toString("base64"),
    },
    warnings: imported.warnings,
  };
}

type ParsedImportLine = Awaited<
  ReturnType<typeof parseIngredientLines>
>[number];

const MAX_AUTO_CREATED_INGREDIENTS = 20;
const AI_NUTRITION_SOURCE = "AI estimate";

/**
 * Creates a household ingredient for a line without a catalog match. The AI
 * suggestion is only a draft; the entry is saved because the import review
 * needs a stable ingredient id and complete nutrition data.
 */
async function createMissingIngredient(
  householdId: string,
  parsed: ParsedImportLine,
  client: typeof ai,
) {
  const name = parsed.name.trim();
  if (!name || name.length > 100) return null;
  const suggestion = await suggestIngredient(name, client);
  const existing = await matchParsedLine(householdId, {
    ...parsed,
    name: suggestion.draft.nameDe,
    unitText: null,
  });
  if (existing.ingredient)
    return {
      id: existing.ingredient.id,
      categoryId: existing.ingredient.categoryId,
      created: false,
    };
  const [created] = await db
    .insert(ingredient)
    .values({
      ...suggestion.draft,
      householdId,
      nutritionSource:
        suggestion.method === "ai" && suggestion.draft.nutritionPer100g
          ? AI_NUTRITION_SOURCE
          : null,
    })
    .returning({ id: ingredient.id, categoryId: ingredient.categoryId });
  return created
    ? { id: created.id, categoryId: created.categoryId, created: true }
    : null;
}

async function linkDraftIngredients(
  householdId: string,
  draft: RecipeImportDraft,
  client: typeof ai,
) {
  const parsed = await parseIngredientLines(
    householdId,
    draft.ingredients.map((line) => line.rawText),
    client,
  );
  const [spices] = await db
    .select({ id: ingredientCategory.id })
    .from(ingredientCategory)
    .where(eq(ingredientCategory.key, "spices"))
    .limit(1);
  let createdIngredients = 0;
  const ingredients: RecipeImportDraft["ingredients"] = [];
  for (const [index, line] of draft.ingredients.entries()) {
    const match = parsed[index];
    let ingredientId = match?.ingredient?.id ?? null;
    let categoryId = match?.ingredient?.categoryId ?? null;
    if (
      !ingredientId &&
      match &&
      createdIngredients < MAX_AUTO_CREATED_INGREDIENTS
    ) {
      const created = await createMissingIngredient(householdId, match, client);
      ingredientId = created?.id ?? null;
      categoryId = created?.categoryId ?? categoryId;
      if (created?.created) createdIngredients += 1;
    }
    ingredients.push({
      ...line,
      quantity: match?.quantity ?? line.quantity,
      unit: match?.unit ?? line.unit,
      note: match?.note ?? line.note,
      optional: match?.optional ?? line.optional,
      excludeFromNutrition:
        match?.quantity === null &&
        categoryId !== null &&
        categoryId === spices?.id,
      ingredientId,
    });
  }
  return { ...draft, ingredients };
}

export const recipeImport = new Hono<HouseholdEnv>()
  .use(requireAuth, requireHousehold)
  .get("/import/capabilities", (c) =>
    c.json({ photos: ai.capability("recipe-import").available }),
  )
  .post(
    "/import/photos",
    bodyLimit({
      maxSize: PHOTO_IMPORT_MAX_COUNT * PHOTO_IMPORT_MAX_BYTES + 64 * 1024,
      onError: () => {
        throw new HTTPException(413, { message: "photo_import_size" });
      },
    }),
    validator("form", (value) => {
      const files = z
        .object({ "photos[]": z.array(z.instanceof(File)) })
        .strict()
        .safeParse(value);
      if (!files.success)
        throw new HTTPException(400, { message: "photo_import_count" });
      return files.data;
    }),
    async (c) => {
      const draft = await importPhotoRecipe(c.req.valid("form")["photos[]"]);
      return c.json({
        draft: await linkDraftIngredients(c.get("householdId"), draft, ai),
        method: "photos" as const,
        image: null,
        warnings: [],
      });
    },
  )
  .post(
    "/import/text",
    validator("json", (value) =>
      z.object({ text: z.string().trim().min(1).max(20_000) }).parse(value),
    ),
    async (c) => {
      let imported: Awaited<ReturnType<typeof importRecipeText>>;
      try {
        imported = await importRecipeText(c.req.valid("json").text, ai);
      } catch (error) {
        if (error instanceof RecipeImportError) throw apiError(error.code);
        throw error;
      }
      return c.json({
        draft: await linkDraftIngredients(
          c.get("householdId"),
          imported.draft,
          ai,
        ),
        method: imported.method,
        image: null,
        warnings: [],
      });
    },
  )
  .post(
    "/import",
    validator("json", (value) => importInputSchema.parse(value)),
    async (c) =>
      c.json(
        await importRecipeDraft(c.get("householdId"), c.req.valid("json").url),
      ),
  );
