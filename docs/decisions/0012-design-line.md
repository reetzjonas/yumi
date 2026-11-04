# 0012: Kitchen-notebook design line with three layout sizes

- Status: Superseded by 0013 (layout sizes and screen structure; palette, type and rules stay)
- Date: 2026-11-03

## Context

The first shell (M0) was designed screen by screen with a sans-only type scale and a 240 px
sidebar from 768 px. A full product draft (v0.1, `docs/design/yumi-draft.html`) now covers all 34
screens, the design system and the core flows, but only phone and tablet. Its review found a few
problems: queue rows too tall to scan, a cramped phone cooking header, disabled placeholders for
unbuilt features, an icon-only tablet tab bar, and secondary row actions in the primary color.
Planning a week at a laptop is a real use case that a stretched tablet layout serves poorly.

## Decision

- Adopt the draft's "kitchen notebook" line: the existing palette plus semantic tokens (`line`,
  `primary-soft`, `warning`, `success`), a system display serif for titles, radii 6/8/10/12/16.
- Three layout sizes: phone (< 768 px, bottom tabs), tablet (768-1199 px, labelled navigation
  rail), desktop (>= 1200 px, sidebar and two-pane sections: recipes list + detail, plan + list,
  list + quick add, more sub-navigation + content).
- Binding screen rules (one primary action per view, color meaning, no placeholders for unbuilt
  features, scannable rows with overflow menus) live in `docs/DESIGN.md`, which wins over the draft.

## Consequences

- The shell and several pages change; work is tracked in the "Design line" milestone.
- The draft becomes a reference snapshot in the repo; `docs/DESIGN.md` is the source of truth and is
  updated in the same commit as UI changes.
- Changing a rule, the palette, type families or breakpoints needs a new ADR.
