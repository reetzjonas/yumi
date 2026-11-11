# 0016: "Farbwelten" UI concept built from scratch

- Status: Accepted (alpha)
- Date: 2026-11-10

## Context

ADR 0015 recolored the app but kept the old skeleton: a title bar on top, tabs below, rows in a
column. The owner found it still looked like before and asked for a concept from scratch. The
concept was prototyped as a static board (`tmp/ui-concept.html`, branch
`prototype/design-directions`) and approved.

## Decision

- **Color worlds.** Each section owns a color used as a surface: Heute basil green, Liste lemon,
  Rezepte paprika, Mehr plum. The shell sets `data-world`; `--world`, `--on-world` and
  `--world-tint` follow.
- **Stage instead of a top bar.** Every page starts with a colored stage carrying one small line
  (eyebrow or back link), a large title and the page's round action buttons.
- **Thumb zone.** Navigation is a floating dark pill at the bottom (a dark rail from 1200 px).
  Adding, cooking and stepping live at the bottom too; the top is for reading.
- **Ink is the action.** The one primary action is a black pill (cream in dark mode). Color means
  place or state. Red is only for deleting.
- **Cards, not lines.** Round white cards on a neutral ground; aisles, meals and figures are tiles.
- **Illustration instead of placeholders.** Without a photo a recipe shows its main pictogram on a
  tinted surface.
- **Type.** Bricolage Grotesque for titles and figures, Instrument Sans for text, both OFL and
  bundled through `@fontsource-variable` (no request to a font service).

## Consequences

- Supersedes the palette, type and shell of ADR 0015; its structural decisions (Today start,
  actions at the bottom of recipe detail, rows and tiles on the list) stay and are restyled.
- The "no web font" rule of ADR 0012 is dropped: two variable fonts are precached by the PWA.
- `docs/DESIGN.md` is rewritten for the concept.
