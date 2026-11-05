# Product

yumi helps a household decide what to cook next, buy what is needed, and cook it.

## Principles

- **Mobile first, tablet for cooking.** Installable PWA, works offline where it matters (shopping).
- **Fast capture.** Adding a recipe or a list item must take seconds.
- **Queue, not calendar.** Plan _what_ to eat next; _when_ is optional.
- **Households share everything by default.** Users can belong to several households.
- **AI is optional assistance**, never required for a core flow. Every AI feature has a non-AI fallback.
- **Self-hosted, no lock-in.** Full JSON export/import.

## Feature scope

### Recipes

- Create/edit recipes: title, description, servings, times, tags, image, ingredient sections, steps.
- Ingredient lines link to a shared ingredient catalog (name de/en, category, units, synonyms, pack sizes).
- Ratings, cook history ("last cooked 3 weeks ago").
- Import from URL (schema.org JSON-LD, LLM fallback), via share sheet (Web Share Target), from a photo (vision LLM).

### Meal queue (planning)

- Ordered "up next" list of recipes with servings or free-text meals (title and optional note); optional day assignment.
- Push queue entries to the shopping list (scaled, pantry staples skipped).
- Suggestions: recipes that reuse leftovers or similar ingredients, recipes not cooked in a while.

### Shopping list

- Bring-style quick add: tiles with icons, recents, autocomplete.
- Optional quantity with unit (g, ml, pcs, ...); duplicates are merged with unit conversion; items show source recipes.
- Grouped by ingredient category; per-store category order.
- One view to add and check off (tap a row; long-press edits, swipe removes), works offline, realtime sync between household members.
- Learned sort order per store from check-off history.
- Pantry staples ("always at home"), recurring items.
- AI-assisted creation of unknown ingredients (category, units, translation).

### Cooking view

- Step-by-step on tablet, large type, screen stays on (Wake Lock).
- Per-step ingredients, live servings scaling.
- Timers detected from step text; multiple parallel timers.
- Later: voice control (next/back).

### Households and sharing

- Households with roles (owner, member), invite links.
- Share a recipe via link or copy it into another household.

### Later / maybe

- Nutrition info (deliberately deferred: high effort, low everyday value).
