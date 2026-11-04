# 0013: The interactive prototype defines the screen structure

- Status: Accepted (alpha)
- Date: 2026-11-04

## Context

ADR 0012 adopted the kitchen-notebook line from draft v0.1, but the screens were then built page
by page and drifted far from the draft's structure: titles inside the content instead of the top
bar, recipe rows instead of photo cards, queue rows with checkboxes and overflow menus, two-pane
desktop sections. The owner wants the app to look like the interactive prototype. The updated
draft adds a desktop size to the prototype itself: a sidebar with one content column, not
two-pane sections. Tablet keeps the bottom tabs with a centered column.

## Decision

- The interactive prototype (board 2 of `docs/design/yumi-draft.html`) is the structural
  reference for every screen: what sits where, in which order, with which controls.
- Features built after the draft (ratings, nutrition, leftovers, timers, learned store order)
  keep a place inside that structure; unbuilt features (sharing, data export, voice) still get
  no placeholders.
- Layout sizes: phone < 768 px and tablet 768-1199 px use a top bar with the page title and
  labelled bottom tabs (tablet content centered, max 760 px); desktop >= 1200 px uses a 220 px
  sidebar and one content column (max 1000 px). Sections may use columns inside that column
  (recipe grid, recipe detail, shopping categories, cooking view).
- The rules in `docs/DESIGN.md` section 2 and the tokens still win over details of the draft.

## Consequences

- Supersedes the two-pane desktop layouts and the navigation rail of ADR 0012; its palette,
  type and rules stay.
- Work is tracked in the "Design draft v2" milestone, one issue per screen group.
- Changing the reference structure, a rule, the palette, type families or breakpoints needs a
  new ADR.
