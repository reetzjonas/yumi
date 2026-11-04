# Data model (sketch)

Alpha sketch, the Drizzle schema is the source of truth once it exists. Every household-owned table has `household_id`.

## Identity

- `user`, `session`, `account`: Better Auth tables.
- `household` (Better Auth organization), `household_member` (role: owner | member), `invitation`.

## Catalog

- `ingredient_category`: key, name_de, name_en, icon, default_position.
- `ingredient`: name_en, name_de, synonyms[], category_id, default_unit, density_g_per_ml?, piece_weight_g?,
  pack_sizes (jsonb), icon, `household_id` nullable (null = global seed, set = household-specific),
  `key` (unique slug of global seed entries; the seed in `packages/db/src/seed` upserts by it).
- Household ingredient creation reviews German/English names, synonyms, category, default unit,
  pack sizes and icon. `POST /api/ingredients/suggest` returns an unsaved AI proposal or a manual
  draft when AI is unavailable; only the explicit `POST /api/ingredients` confirmation persists it.
  AI category keys are resolved against the catalog on the server. Pack sizes use positive
  quantities and canonical units. Shopping quick-add and recipe import share the review dialog.

## Recipes

- `recipe`: title, description, servings, prep_min, cook_min, source_url, image, language, tags[].
- `recipe_ingredient`: recipe_id, section, position, ingredient_id?, raw_text, quantity?, unit?, note, optional.
- `recipe_step`: recipe_id, position, text, ingredient refs (`recipe_ingredient.id` UUIDs), ingredient_refs_manual (boolean, default false), detected timers (jsonb).
- Recipe step input uses zero-based `ingredientPositions`: omitted or `null` matches German/English catalog names and parsed raw ingredient names when saving; an array overrides matching, including `[]` for no references. Positions must belong to the submitted recipe. Recipe edits recreate ingredient rows and bind step references to their new IDs.
- Recipe detail returns resolved `ingredientRefs` and `ingredientPositions`. Automatic steps (`ingredient_refs_manual = false`, including legacy steps) match names when loaded and return `ingredientPositions: null`; manually selected steps return stored references and their positions, preserving deliberate empty arrays. Saves persist both the resolved references and whether positions were explicitly supplied.
- `recipe_rating`, `cook_log` (id, household_id, recipe_id, cooked_at, user_id).
- `POST /api/recipes/:id/cooked` accepts `{ requestId: UUID }` and records the acting user in the active household. Repeating the same request for the same household and recipe returns `{ ok: true }` without another log; reusing the ID for another recipe or household returns `409 request_id_conflict`. A foreign or missing recipe returns `404 not_found`.
- `share_link`: recipe_id, token, expires_at.

## Planning

- `meal_queue_entry`: recipe_id, servings, position, planned_for (date, nullable), status (queued | cooked | skipped).
- The queue shows queued entries in position order; the same recipe can appear more than once with different servings or dates. Reordering replaces the complete active order within the household.
- Marking an entry cooked atomically changes its status and writes one `cook_log` with the acting user. Cooked and skipped entries remain stored but leave the active queue.
- Selected queue entries can be previewed as scaled, merged shopping ingredients, with pantry staples separated. Confirmation checks the preview version and records idempotent shopping events; storage keeps each queue contribution separate with both queue and recipe source references.
- Removing a queued entry can keep its shopping contributions or remove just its linked items across household lists. Other queue entries and manual contributions remain intact even when the shopping UI merges them into one ingredient row.

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
- `leftover`: ingredient_id, quantity, unit, created_from (queue entry), expires_hint.
