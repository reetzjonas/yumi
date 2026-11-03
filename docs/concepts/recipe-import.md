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
   match go to the LLM in one batched call, which also proposes new catalog ingredients.
6. The user always gets a **review screen** before saving.

Status: steps 1-3, 5 and 6 are implemented. `POST /api/recipes/import` (`apps/api/src/routes/recipe-import.ts`,
core in `apps/api/src/recipe-import/`) returns an unsaved draft with catalog-linked ingredients and the
image as base64; `/recipes/import` shows it in the regular recipe editor, and nothing is stored until the
user saves. A page without structured data fails with `import_no_recipe`; the extraction error keeps the
already fetched readable text for the LLM fallback (step 4).

Entry points: paste URL, Web Share Target (share from the mobile browser into the installed PWA), photo
(vision LLM, same schema as step 4).
