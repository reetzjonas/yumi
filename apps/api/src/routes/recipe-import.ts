import { ingredient, ingredientCategory } from "@yumi/db/schema";
import {
  ingredientWeightG,
  PHOTO_IMPORT_MAX_BYTES,
  PHOTO_IMPORT_MAX_COUNT,
  type Unit,
} from "@yumi/shared";
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

/** AI proposals per import: new ingredients plus incomplete ones to fill in. */
const MAX_INGREDIENT_PROPOSALS = 20;
const PROPOSAL_CONCURRENCY = 4;
const AI_NUTRITION_SOURCE = "AI estimate";

type Suggestion = Awaited<ReturnType<typeof suggestIngredient>>;

/**
 * Creates a household ingredient for a line without a catalog match. The AI
 * suggestion is only a draft; the entry is saved because the import review
 * needs a stable ingredient id and complete nutrition data.
 */
async function createMissingIngredient(
  householdId: string,
  parsed: ParsedImportLine,
  suggestion: Suggestion,
) {
  const existing = await matchParsedLine(householdId, {
    ...parsed,
    name: suggestion.draft.nameDe,
    unitText: null,
  });
  if (existing.ingredient)
    return {
      id: existing.ingredient.id,
      categoryId: existing.ingredient.categoryId,
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
  return created ?? null;
}

/**
 * A household ingredient that cannot feed the recipe's nutrition: it has no
 * profile, or the line's amount does not convert to grams. Global entries are
 * maintained by the seed and never completed here.
 */
function isIncomplete(householdId: string, line: ParsedImportLine) {
  const row = line.ingredient;
  if (!row || row.householdId !== householdId) return false;
  if (!row.nutritionPer100g) return true;
  return (
    line.quantity !== null &&
    ingredientWeightG(line.quantity, line.unit ?? "pcs", row) === null
  );
}

/** Fills only what the ingredient leaves open; values the household set stay. */
async function completeIngredient(
  row: NonNullable<ParsedImportLine["ingredient"]>,
  suggestion: Suggestion,
) {
  if (suggestion.method !== "ai") return row.categoryId;
  const { draft } = suggestion;
  const fillNutrition = !row.nutritionPer100g && draft.nutritionPer100g;
  const [updated] = await db
    .update(ingredient)
    .set({
      nutritionPer100g: row.nutritionPer100g ?? draft.nutritionPer100g,
      nutritionSource: fillNutrition
        ? AI_NUTRITION_SOURCE
        : row.nutritionSource,
      densityGPerMl: row.densityGPerMl ?? draft.densityGPerMl,
      pieceWeightG: row.pieceWeightG ?? draft.pieceWeightG,
      packSizes: row.packSizes.length ? row.packSizes : draft.packSizes,
      categoryId: row.categoryId ?? draft.categoryId,
      defaultUnit: row.defaultUnit ?? draft.defaultUnit,
      icon: row.icon ?? draft.icon ?? null,
    })
    .where(eq(ingredient.id, row.id))
    .returning({ categoryId: ingredient.categoryId });
  return updated?.categoryId ?? row.categoryId;
}

/** Runs the tasks with a small pool, so an import does not wait on one call at a time. */
async function pooled<T>(tasks: readonly (() => Promise<T>)[], limit: number) {
  const results: T[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (next < tasks.length) {
        const index = next++;
        const task = tasks[index];
        if (task) results[index] = await task();
      }
    }),
  );
  return results;
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

  // One proposal per distinct name, for lines without a match and for
  // incomplete household ingredients.
  const proposalName = (line: ParsedImportLine) => {
    if (line.ingredient)
      return isIncomplete(householdId, line) ? line.ingredient.nameDe : null;
    const name = line.name.trim();
    return name && name.length <= 100 ? name : null;
  };
  const wanted = new Map<string, { name: string; unit: Unit | null }>();
  for (const line of parsed) {
    const name = proposalName(line);
    const key = name?.toLowerCase();
    if (!name || !key || wanted.has(key)) continue;
    if (wanted.size >= MAX_INGREDIENT_PROPOSALS) break;
    wanted.set(key, { name, unit: line.unit });
  }
  const proposed = await pooled(
    [...wanted.values()].map(
      ({ name, unit }) =>
        () =>
          suggestIngredient(name, client, unit),
    ),
    PROPOSAL_CONCURRENCY,
  );
  const suggestions = new Map(
    [...wanted.keys()].map((key, index) => [key, proposed[index]] as const),
  );

  const completed = new Map<string, string | null>();
  const ingredients: RecipeImportDraft["ingredients"] = [];
  for (const [index, line] of draft.ingredients.entries()) {
    const match = parsed[index];
    let ingredientId = match?.ingredient?.id ?? null;
    let categoryId = match?.ingredient?.categoryId ?? null;
    const suggestion =
      match && suggestions.get(proposalName(match)?.toLowerCase() ?? "");
    if (match && suggestion && !match.ingredient) {
      const created = await createMissingIngredient(
        householdId,
        match,
        suggestion,
      );
      ingredientId = created?.id ?? null;
      categoryId = created?.categoryId ?? categoryId;
    } else if (match?.ingredient && suggestion) {
      const row = match.ingredient;
      if (!completed.has(row.id))
        completed.set(row.id, await completeIngredient(row, suggestion));
      categoryId = completed.get(row.id) ?? categoryId;
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
