# Data model (sketch)

Alpha sketch, the Drizzle schema is the source of truth once it exists. Every household-owned table has `household_id`.

Household data can be exported as a versioned JSON archive and imported
additively into another active household. All local identifiers are remapped;
global ingredients and categories resolve by stable keys. Recipe image bytes
travel with the archive. Authentication, personal ratings and sharing
capabilities are excluded. See [household transfer](data-transfer.md).

## Identity

- `user`, `session`, `account`: Better Auth tables.
- `household` (Better Auth organization), `household_member` (role: owner | member), `invitation`.

## Catalog

- `ingredient_category`: key, name_de, name_en, icon, default_position.
  Categories are supermarket aisles, not food groups (`world-foods` holds shelf-stable international
  specialities); the AI ingredient proposal receives a hint per aisle.
- `ingredient`: name_en, name_de, synonyms[], category_id, default_unit, density_g_per_ml?, piece_weight_g?,
  pack_sizes (jsonb), icon, `household_id` nullable (null = global seed, set = household-specific),
  `key` (unique slug of global seed entries; the seed in `packages/db/src/seed` upserts by it),
  nutrition_per100g? (jsonb: energyKcal, proteinG, fatG, carbsG, sugarG, fiberG, saltG; all seven or
  null), nutrition_source? (seed provenance only; household edits that change the values clear it).
- Seed nutrition comes from USDA FoodData Central SR Legacy 2018 (public domain), generated into
  `packages/db/src/seed/nutrition.ts`: carbs are available carbohydrate (by difference minus fibre),
  salt is sodium x 2.5. Ingredients without a matching complete profile, and non-food items, stay
  null instead of getting a guessed value. Where USDA has no combined entry (e.g. German mixed minced
  meat), the seed documents a computed average in its `source`. Household ingredients created during
  import can carry an AI-estimated profile with `nutrition_source = "AI estimate"`.
- Recipe detail returns `nutrition` per serving of the base recipe, or null when no line counts.
  Lines without quantity, linked nutrition or a gram conversion (density, piece weight; never for
  pinch, bunch, can, pack) are listed in `excludedIngredients` and reported as partial coverage.
  Lines marked `exclude_from_nutrition` are intentionally ignored: they leave both the sum and the
  coverage denominator, and the result reports them as `ignoredIngredients` (e.g. salt and pepper
  to taste).
- Household ingredient creation reviews German/English names, synonyms, category, default unit,
  pack sizes, icon and optional nutrition per 100 g. `POST /api/ingredients/suggest` returns an unsaved AI proposal or a manual
  draft when AI is unavailable; only the explicit `POST /api/ingredients` confirmation persists it.
  AI category keys are resolved against the catalog on the server. Pack sizes use positive
  quantities and canonical units. Shopping quick-add and recipe import share the review dialog.

## Recipes

- `recipe`: title, description, cooking_notes (household note for the next time), servings, prep_min, cook_min, source_url, image, language, tags[].
- `recipe_ingredient`: recipe_id, section, position, ingredient_id?, raw_text, quantity?, unit?, note, optional, exclude_from_nutrition (boolean, default false; keeps the line out of nutrition coverage, e.g. seasoning to taste).
- `recipe_step`: recipe_id, position, text, ingredient refs (`recipe_ingredient.id` UUIDs), ingredient_refs_manual (boolean, default false), detected timers (jsonb).
- Recipe step input uses zero-based `ingredientPositions`: omitted or `null` matches German/English catalog names and parsed raw ingredient names when saving; an array overrides matching, including `[]` for no references. Positions must belong to the submitted recipe. Recipe edits recreate ingredient rows and bind step references to their new IDs.
- Recipe detail returns resolved `ingredientRefs` and `ingredientPositions`. Automatic steps (`ingredient_refs_manual = false`, including legacy steps) match names when loaded and return `ingredientPositions: null`; manually selected steps return stored references and their positions, preserving deliberate empty arrays. Saves persist both the resolved references and whether positions were explicitly supplied.
- `recipe_rating`, `cook_log` (id, household_id, recipe_id, cooked_at, user_id).
- Ratings have one 1-5 star value per recipe and user; setting the rating to null
  removes it. Recipe summaries and details include the acting user's `myRating`
  and the household's `lastCookedAt`. The history endpoint returns the last ten
  household cooking events and actor names. Recipe list suggestions combine with
  search and tag filters: personal ratings of at least four stars, known total
  times up to thirty minutes, or never-cooked/oldest-cooked first.
- `POST /api/recipes/:id/cooked` accepts `{ requestId: UUID }` and records the acting user in the active household. Repeating the same request for the same household and recipe returns `{ ok: true }` without another log; reusing the ID for another recipe or household returns `409 request_id_conflict`. A foreign or missing recipe returns `404 not_found`.
- `share_link`: id, recipe_id (cascade delete), unique 256-bit token, expires_at?,
  created_at. Members manage independent links; public reads check expiry and
  return recipe content only. Copying a shared recipe creates destination-owned
  rows, remaps custom catalog entries and ingredient references, and copies images.
  See [recipe sharing](concepts/recipe-sharing.md).

## Planning

- `meal_queue_entry`: recipe_id (nullable), title (nullable), note (nullable), servings, position, planned_for (date, nullable), status (queued | cooked | skipped). A check constraint requires exactly one of recipe_id or a nonblank title (at most 200 characters).
- The queue shows queued entries in position order; the same recipe can appear more than once with different servings or dates. Reordering replaces the complete active order within the household.
- Marking a recipe entry cooked atomically changes its status and writes one `cook_log` with the acting user. Free-text meals change status without recipe logs or leftover consumption. Cooked and skipped entries remain stored but leave the active queue.
- Selected queue entries can be previewed as scaled, merged shopping ingredients, with pantry staples separated. Confirmation checks the preview version and records idempotent shopping events; storage keeps each queue contribution separate with both queue and recipe source references.
- Removing a queued entry can keep its shopping contributions or remove just its linked items across household lists. Other queue entries and manual contributions remain intact even when the shopping UI merges them into one ingredient row.
- Free-text meals share ordering and optional dates with recipe entries. They have no cooking mode, nutrition or shopping contributions; the shopping picker includes recipe entries only. Archives preserve their title and note, while legacy recipe-only archives remain importable.

## Shopping

- `shopping_list`: name (a household can have several, e.g. "Supermarket", "Drugstore").
- `shopping_list_item`: list_id, ingredient_id?, label, quantity?, unit?, category_id, checked, sources (recipe refs).
- `shopping_event`: id (client UUID), list_id, item_id, type, user_id, store_id?, client_ts, server_ts.
- `store`: name, category_order (manual override), learning_reset_at.
- Learned order scores and session sample counts are derived per store from
  `shopping_event` check-off snapshots after `learning_reset_at`; no separate
  score table is needed. Event payloads retain the ingredient and category even
  after the shopping item is removed.
- `pantry_item`: ingredient_id (always at home).
- `recurring_item`: ingredient_id/label, quantity, rule (e.g. weekly on Saturday).
- `leftover`: household_id, ingredient_id, quantity, unit, source_entry_ids (queue
  entries whose combined purchase produced the expected remainder). Confirmation
  uses deterministic IDs for idempotency. Cooking other entries consumes these
  estimates; users can adjust or dismiss them in planning.

## Push

- `push_subscription`: user_id, endpoint (unique), p256dh, auth, locale. See `docs/concepts/push.md`.
