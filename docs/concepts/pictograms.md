# Grocery pictograms

Shopping uses a bundled subset of Microsoft Fluent Emoji **Flat** artwork, not the
operating system's emoji font. The upstream MIT license ships with the SVGs in
`apps/web/public/pictograms/LICENSE`.

## Keys and assets

- `ingredient.icon` and `ingredient_category.icon` remain emoji keys.
- `packages/shared/src/pictograms.ts` lists supported keys and German/English search names.
  `pictogramFile()` resolves only bundled files and ignores the emoji presentation selector.
- `Pictogram` renders the ingredient icon, then its category icon, then the basket.
  Images are decorative and have fixed dimensions.
- The PWA precaches the SVG files so icons remain available offline.

## Updating the subset

Edit `scripts/pictogram-catalog.ts`, then run
`bun scripts/generate-pictograms.ts`. The generator pins the upstream artwork
revision, checks its license, and regenerates both the SVG files and shared list.
Commit the generated files with the catalog change.

Seed ingredient icons must resolve to a bundled pictogram; the seed integrity
test checks this. Catalog migration upserts make the updated icons available to
existing installations without a separate manual seed step.

## Own ingredients and AI

The ingredient form provides a searchable SVG picker. The existing AI ingredient
suggestion can propose a supported key alongside the other ingredient fields,
without a second AI request. The structured response and ingredient API reject
unsupported keys.

Creating an ingredient directly through the API without an `icon` asks for a
suggestion when AI is available. Explicit `null` means use the category fallback.
Unavailable or unsuccessful AI falls back to manual entry; it does not prevent
ingredient creation. No SVG markup is generated or accepted from the model.
