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

## Recipes

- `recipe`: title, description, servings, prep_min, cook_min, source_url, image, language, tags[].
- `recipe_ingredient`: recipe_id, section, position, ingredient_id?, raw_text, quantity?, unit?, note, optional.
- `recipe_step`: recipe_id, position, text, ingredient refs, detected timers (jsonb).
- `recipe_rating`, `cook_log` (recipe_id, cooked_at, user_id).
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
- `store`: name, category_order (manual override).
- `learned_order`: store_id, ingredient_id / category_id, score, sample_count.
- `pantry_item`: ingredient_id (always at home).
- `recurring_item`: ingredient_id/label, quantity, rule (e.g. weekly on Saturday).
- `leftover`: ingredient_id, quantity, unit, created_from (queue entry), expires_hint.
