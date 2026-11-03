import { parseIngredientLine } from "@yumi/shared";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono/validator";
import { z } from "zod";
import { matchParsedLine } from "../catalog";
import { type HouseholdEnv, requireAuth, requireHousehold } from "../context";
import {
  importRecipe,
  RecipeImportError,
  type RecipeImportErrorCode,
} from "../recipe-import";
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
) {
  let imported: Awaited<ReturnType<typeof importRecipe>>;
  try {
    imported = await importRecipe(url, transport);
  } catch (error) {
    if (error instanceof RecipeImportError) throw apiError(error.code);
    throw error;
  }
  const ingredients = await Promise.all(
    imported.draft.ingredients.map(async (line) => {
      const match = await matchParsedLine(
        householdId,
        parseIngredientLine(line.rawText),
      );
      return { ...line, ingredientId: match.ingredient?.id ?? null };
    }),
  );
  return {
    draft: { ...imported.draft, ingredients },
    method: imported.method,
    image: imported.image && {
      mimeType: imported.image.mimeType,
      dataBase64: Buffer.from(imported.image.bytes).toString("base64"),
    },
    warnings: imported.warnings,
  };
}

export const recipeImport = new Hono<HouseholdEnv>()
  .use(requireAuth, requireHousehold)
  .post(
    "/import",
    validator("json", (value) => importInputSchema.parse(value)),
    async (c) =>
      c.json(
        await importRecipeDraft(c.get("householdId"), c.req.valid("json").url),
      ),
  );
