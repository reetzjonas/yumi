# Recipe import

Pipeline, cheapest step first:

1. **Fetch** the URL server-side (timeout, size limit, user agent, no private-network targets: SSRF guard).
2. **schema.org JSON-LD**: find `@type: Recipe` (also inside `@graph`), map name, recipeYield,
   recipeIngredient, recipeInstructions (HowToStep / HowToSection), times (ISO 8601 durations), image.
   Covers most large sites (e.g. Chefkoch).
3. **Microdata / heuristics** as a cheap second try.
4. **LLM fallback**: strip the HTML to readable text, extract with a Zod schema via the AI module.
5. **Ingredient lines** ("200 g Mehl, gesiebt") go through the rule-based parser in `packages/shared`
   (quantity incl. fractions and ranges, unit aliases de/en, name, note). `POST /api/ingredients/parse`
   parses and links lines to the catalog in one call. Lines with confidence below ~0.7 or no catalog
   match go to the LLM in one batched call. Unlinked lines offer a separate catalog creation
   dialog with optional AI suggestions and explicit user confirmation.
6. The user always gets a **review screen** before saving.

Status: steps 1-6 are implemented. `POST /api/recipes/import` (`apps/api/src/routes/recipe-import.ts`,
core in `apps/api/src/recipe-import/`) returns an unsaved draft with catalog-linked ingredients and the
image as base64; `/recipes/import` shows it in the regular recipe editor, and nothing is stored until the
user saves. If structured extraction fails, the AI module receives at most 60,000 characters of readable
text and returns a validated recipe draft. Pages without a recipe, unavailable AI and failed AI calls
retain `import_no_recipe`, allowing manual entry. Structured imports do not need the recipe AI feature.
Low-confidence or unmatched ingredient lines are sent in one batch to the ingredient parsing feature;
failed or incomplete batches retain the rule-based results. Catalog linking always runs server-side
against the active household, and no AI response creates catalog entries automatically.

URL entry points: paste a URL or share it from a mobile browser into the installed PWA.
The manifest registers a GET Web Share Target at `/recipes/import`; the landing page validates URLs
from the share `url`, Android `text`, or a URL-only `title`. Login, signup and household creation
preserve the source URL. Loading the page does not fetch or save a recipe; the user starts the import.
Photo import is planned separately (vision LLM, same schema as step 4).
