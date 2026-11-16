# Recipe optimization

An existing recipe can be reworked by the AI (`recipe-optimize` feature). The result is an unsaved
draft in the regular recipe editor, the same review step as an import; the recipe only changes
when the user saves.

`POST /api/recipes/:id/optimize` with `{ texts: boolean }` (core in `apps/api/src/recipe-optimize.ts`):

- **Structure** (always): ingredient order and sections, steps split into one stage each, fragments
  merged, heading-only steps dropped, each step linked to the ingredients it uses (stored as manual
  step ingredient links).
- **Texts** (`texts: true`): title, description and step wording are rewritten as well. Without it,
  title and description are kept and the prompt asks to keep each step's wording.

The model never sees or returns ingredient lines as text to rewrite: it returns each ingredient
by its index with a section, so raw text, quantity, unit, note and catalog link are copied from
the stored line. An answer that loses, duplicates or invents an ingredient index is rejected
(`422 optimize_failed`). Unavailable AI is `503 optimize_unavailable`; the web hides the button
then (`optimize` in `GET /api/recipes/import/capabilities`).

UI: "Optimize with AI" in the recipe menu leads to the edit page, which shows the optimize card
above the editor with the texts option, a retry and "Discard suggestion".
