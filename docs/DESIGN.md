# yumi design line

The binding summary of how yumi looks and behaves. The visual reference is the
design draft in [`design/yumi-draft.html`](design/yumi-draft.html) (open it in a
browser; boards 1-6). When the draft and this file disagree, this file wins and
the draft is fixed later. Why this line: [ADR 0012](decisions/0012-design-line.md).

## 1. Identity

A shared kitchen notebook: cream paper, olive ink, rust for the one thing you
should tap. A calm utility; recipes and list items are the decoration. No stock
imagery, gradients, blur, decorative accent borders or promotional copy.

## 2. Rules for every screen

1. **One primary action per view.** Exactly one filled rust button. Everything
   else is outline, ghost or a text link. Row actions are never rust. Views
   that save automatically (settings) have no primary button.
2. **Color carries meaning.** Rust = do, olive = fine / done / info, amber =
   waiting, red = gone. Status is never hue alone: it always has an icon or a
   word ("wartet", "fällig", "abgehakt von Anna"). Sync pending is never red.
3. **No placeholders for unbuilt features.** No disabled "kommt bald" buttons,
   no empty "Nährwerte" rows. A feature appears when it works.
4. **Lists are scannable.** A row is one or two lines. Secondary actions live in
   an overflow menu or the edit sheet. At 390x844 the queue shows at least five
   rows.
5. **AI always has a manual path** that is visible next to the AI entry point;
   with AI disabled the manual path becomes the primary one.
6. **Borders separate, shadows lift.** Only floating surfaces (sheets, dialogs,
   menus, toasts) get a shadow.
7. **Copy:** German first, informal "du"; destructive dialogs name the object
   ("Liste „Wocheneinkauf“ löschen?").

## 3. Color

| Token (CSS var)              | Light             | Dark              | Use                                       |
| ---------------------------- | ----------------- | ----------------- | ----------------------------------------- |
| background                   | #fcfaf5           | #1a1e18           | Page paper                                |
| foreground                   | #292e24           | #f4f1e8           | Body text, icons                          |
| card / popover               | #ffffff           | #242a21           | Cards, rows, inputs, floating surfaces    |
| primary / -foreground        | #a43d28 / #ffffff | #f2aa8f / #381b12 | The one primary action, links, active tab |
| primary-hover                | #85301f           | #ffc1a8           | Hover of primary                          |
| primary-soft                 | #f6e3dc           | #4a2c22           | "Vorschlag" badge, selected star          |
| secondary / muted            | #f1ece2           | #2e352a           | Soft surfaces, skeletons, timer dock      |
| secondary-foreground         | #424c3a           | #e3e8da           | Text on secondary                         |
| muted-foreground             | #64675b           | #b8c0ad           | Meta text, hints                          |
| accent / -foreground         | #e8eddf / #35482d | #35432d / #e2edda | Info notes, tags, active navigation       |
| border / input               | #858778           | #858f79           | Inputs, steppers, checkboxes (3:1 min)    |
| line                         | #ddd8cb           | #3a4234           | Decorative dividers and card outlines     |
| ring                         | #93412b           | #efae91           | Focus ring                                |
| destructive                  | #ac2928           | #ffb0a9           | Delete, remove, timer alarm               |
| warning / warning-foreground | #f7ecd6 / #6b470c | #3d3220 / #f2d49b | Offline banner, sync pending, "fällig"    |
| success                      | #3f6b2e           | #a9cf8f           | Checked items, progress, presence         |

`line` is decorative only and never the sole boundary of an interactive control.

## 4. Typography

- **Sans** (system stack) for everything you read while doing something.
- **Display serif** `ui-serif, "Iowan Old Style", "Palatino Linotype", Georgia,
  serif` (no web font) for page titles, recipe titles and empty-state headlines.

| Role      | Size / line height        | Weight    |
| --------- | ------------------------- | --------- |
| display   | 28/1.15 (34 at >=1200 px) | serif 600 |
| title     | 21/1.2                    | serif 600 |
| heading   | 17/1.3                    | sans 700  |
| body      | 16/1.5                    | sans 400  |
| label     | 14/1.3                    | sans 600  |
| meta      | 13/1.35                   | sans 400  |
| overline  | 12/1, caps, +0.06em       | sans 700  |
| cook step | 26 phone -> 34 tablet     | sans 500  |

Quantities and timers use `tabular-nums`. Inputs never go below 16 px.

## 5. Spacing, radii, elevation, motion

- Spacing on a 4 px base: 4, 8, 12, 16, 24, 32, 48. Gutter 16 phone, 24 tablet+.
  Row height 56 (shopping mode 68). Targets at least 44x44.
- Radii: 6 badge, 8 base, 10 control, 12 card, 16 sheet. No full pills: chips are
  10 px rectangles.
- Elevation: 0 flat with border, 1 sheet/menu, 2 dialog/toast.
- Motion: 150 ms press/toggle, 200 ms ease-out for sheets and dialogs in, 150 ms
  out. Checked items in shopping mode stay 600 ms before moving to "Im Wagen".
  `prefers-reduced-motion` removes movement, keeps state changes.

## 6. Layout and breakpoints

| Width      | Navigation                                                                  | Content                       |
| ---------- | --------------------------------------------------------------------------- | ----------------------------- |
| < 768      | Top bar (wordmark + household chip)  , bottom tabs with labels              | One column                    |
| 768 - 1199 | 88 px navigation rail, icon above label                                     | One column, max 760 px        |
| >= 1200    | 256 px sidebar: household switcher, tabs, "Neues Rezept" (outline), account | Two panes per section (below) |

Two-pane layouts at >= 1200 px:

- **Rezepte:** library pane (360 px, compact rows with thumbnail) + recipe
  detail. Without a selection the detail pane shows a short empty state.
- **Plan:** queue + 400 px pane with the active shopping list, so "Auf die
  Liste" shows its result in place.
- **Liste:** list + side pane with quick-add tiles and due recurring items.
- **Mehr:** 240 px sub-navigation + content (max 640 px).

Shopping mode and cooking view are full-screen modes outside the shell at every
size. From 768 px the cooking view uses two columns: ingredients for the step
left, the step right.

Layout: Learned shopping route - follow the store's observed item order -> stack
inside the existing shopping mode; scroll owner: `.app-main`; avoid grouping
items back into categories when ingredient scores cross category boundaries.
The shopping rows remain the primary action. Reading priorities are store,
remaining items in route order, then checked items. The store editor offers a
secondary reset with an inline failure message; manual category order overrides
learning until reset.

Layout: Cooking view - keep the current instruction and its ingredients visible
inside a bounded viewport -> scroll-body-shell; scroll owner: `.cooking-body`;
header and navigation stay fixed, with a step overview in landscape. Avoid
document scrolling, nested vertical scrollers and content-width grid tracks.

Layout: Step ingredient assignments - associate automatic/manual choices with
their step -> stack inside the existing recipe editor; scroll owner: `.app-main`;
avoid nested scrollers and fixed-width checkbox labels.

Layout: Expected leftovers and reuse suggestions - follow the queue's shopping
workflow in the main Plan pane, including when the queue is empty; scroll owner:
`.split-main` on desktop, `.app-main` below 1200 px. Keep the shopping preview
and active list in their existing places. Reading priorities are planned meals,
shopping, expected leftovers, then recipes that use them. Leftover rows show
localized ingredient names and amounts, with secondary edit and dismiss actions.
Editing expands one compact quantity/unit form beneath its row; failures stay
beside the affected row. Suggestions use compact recipe rows with secondary add
actions and the recipe's original servings. A checkbox expands suggestions to
recipes sharing ingredients with queued meals. Avoid extra primary buttons,
recipe-card grids, and adding controls inside the dense queue rows.

Cooking view brief: the primary action is Next, becoming Mark cooked on the last
step. Reading priorities are the current instruction, its ingredients, then
progress. Required controls are close, previous, next, step overview, wake-lock
status and editable ingredient assignments in the recipe editor. Empty recipes
offer editing; request failures appear beside the completion action. Decorative
badges and duplicate recipe metadata are left out.
Ingredient text retains the project's 16 px body and 14 px secondary roles;
the active instruction uses the larger cook-step role.

Layout: Timer dock - follow active timers across routes -> compact floating
utility above the cooking footer or shell navigation; scroll owner:
`.timer-dock-content`; avoid nested scrolling and covering the cooking controls.
Main scroll regions reserve the dock's measured height so their final actions
remain reachable above it, including when the dock is expanded.
Reserve this space as scrollable trailing content, not container padding that
can exceed a short viewport. Expanded cooking timers stay between the measured
header and footer, keeping both navigation bars reachable.
Detected durations are outline buttons beneath the current instruction. The
dock starts collapsed, supports parallel countdowns, pause/resume and cancellation,
and distinguishes completed alarms with a bell and status text. Only completion
is announced to assistive technology.

The page title stays in the content as the one h1. Each pane owns its scroll;
there is no page scroll behind it and no horizontal page scroll down to 320 px.
On phones, tag filters are one horizontally scrolling strip. Safe-area insets extend bars, rail and sidebar. On
> = 1200 px, `/` focuses search and `n` starts a new recipe.

## 7. Component patterns

Layout: Recipe insights - choose a meal using personal ratings and household
cooking history -> stack inside the existing library and recipe detail;
scroll owners: `.split-pane` and `.recipe-detail` on desktop, `.app-main` on
smaller screens. Avoid a second scroll region for ratings or history.
Cooking stays the recipe's primary action. Ratings use five secondary star
controls with an explicit clear action and inline errors. History is collapsed
under the last-cooked date and names the cooking household member. The library
offers one suggestion selector for neglected recipes, personal favorites and
recipes with known preparation plus cooking time of at most 30 minutes.

Layout: Photo import - choose a link or ordered cookbook pages, then review the
draft in the existing recipe editor -> stack inside the import section; scroll
owner: `.app-main`; avoid nested scrolling and fixed-width file names.
The primary action loads the selected source; manual entry stays beside the
import controls and becomes primary when photo AI is unavailable. Reading
priorities are source, upload limits and page order, then extraction. File and
camera inputs, ordered removable pages, pending state, inline errors and the
explicit unsaved review are required. Cookbook pages are not recipe cover images.

- **Button:** primary (filled rust), outline, ghost, destructive. Fixed geometry
  in every state; press scales to 0.98.
- **Queue row:** position, drag handle, thumbnail, title, meta line
  ("4 Portionen · Do · 40 Min"), overflow menu. The menu holds Gekocht,
  Überspringen, Bearbeiten (servings, day), Nach oben / Nach unten, Entfernen.
  Servings and day are edited in a sheet, not inline.
- **Overflow menu / sheet:** native `<dialog>` (focus trap, Escape, focus
  return): bottom sheet on phones, centered dialog from 768 px. Header shows the
  object (title + meta) and a close button; destructive items are red.
- **Cooking view header (phone):** row 1 close + title (two lines max); row 2
  "Schritt 1 von 6 · 4 Portionen" and the wake-lock state as an icon.
- **Empty state:** serif headline, one sentence, one primary next action.
- **Skeleton:** shaped like the content it replaces; static under reduced motion.

## 8. Cross-cutting states

Offline (banner under the top bar: what works, what waits), sync pending (cloud
icon + count), AI disabled (manual path first), empty, loading (skeleton), error
(human cause + "Erneut versuchen"), no access / no household (route to switcher
or onboarding), permission denied (camera, notifications, wake lock -> fallback).

## 9. Accessibility

WCAG 2.2 AA. Text contrast at least 4.5:1, control boundaries 3:1, focus ring
2 px at 3 px offset. Every drag interaction has a non-drag alternative (menu
items and arrow keys on the handle). Shell targets at least 44 px; shopping-mode
rows 68 px.

## 10. Changing the design line

- Small refinements: change this file in the same commit as the code.
- A change to a rule in section 2, the palette, the type families or the
  breakpoints: new ADR that supersedes 0012, then update this file.
- The draft is a reference snapshot; update it when a screen changes in a way
  the text cannot carry.
