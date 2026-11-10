# 0015: UX rework with a new visual direction ("Tomate") and leaner screens

- Status: Superseded by 0016 (palette, type, shell); the structural decisions stay
- Date: 2026-11-10

## Context

A review of the running app (phone and desktop) found the screens heavy: outlined boxes of equal
weight everywhere, cream on cream, a serif that falls back to Times on many systems, queue rows
with eight inline controls, recipe actions before the ingredients, and no start screen. The owner
does not like the look and asked for a rework without regard to earlier decisions. Three visual
directions were prototyped (branch `prototype/design-directions`); the owner chose direction B.

## Decision

- **Palette:** warm near-white paper, near-black text, tomato red as the single action color.
  Secondary controls are soft fills, not outlines. Only text inputs and checkboxes keep a border.
  Destructive is a darker wine red and always carries an icon or a word, because the action color
  is red too.
- **Type:** sans only. Titles use the grotesk stack at weight 800 with tight tracking; no serif.
- **Shape:** larger radii (control 14, card 20, sheet 24), round checkboxes.
- **Structure** (milestone "UX rework", one issue each): a Today start screen replaces the Plan
  tab; queue rows are one line with details in the sheet; recipe detail gets a sticky action bar
  and an overflow menu; the top bar carries page actions and shows the household only when there
  are several; the shopping list offers rows and tiles.
- `docs/DESIGN.md` is the only binding reference. `docs/design/yumi-draft.html` stays as a
  historical snapshot and no longer defines structure.

## Consequences

- Supersedes the palette and type of ADR 0012 and the binding role of the draft in ADR 0013,
  including the queue-row exception of rule 4. Layout sizes and breakpoints of 0013 stay.
- Rule "color carries meaning" changes: red = do, wine red + icon = gone.
- Screens are restyled and restructured issue by issue; until the milestone is done some screens
  still show the old structure in the new colors.
