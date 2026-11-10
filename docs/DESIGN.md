# yumi design line

The binding summary of how yumi looks and behaves. Why: [ADR 0015](decisions/0015-ux-rework.md)
(palette, type, structure) and [ADR 0013](decisions/0013-design-draft-v2.md) (layout sizes).
`design/yumi-draft.html` is a historical snapshot and not a reference anymore.

## 1. Identity

A calm kitchen tool: warm near-white paper, near-black text, tomato red for the one thing you
should tap. Recipe photos and list pictograms are the decoration. Soft filled surfaces instead of
outlined boxes. No stock imagery, gradients, blur, decorative accent borders or promotional copy.

## 2. Rules for every screen

1. **One primary action per view.** Exactly one filled red button. Everything
   else is a soft fill, ghost or a text link. Row actions are never red. Views
   that save automatically (settings) have no primary button.
2. **Color carries meaning.** Red = do, green = fine / done, amber =
   waiting, wine red with an icon or word = gone. Status is never hue alone: it always has an icon or a
   word ("wartet", "fällig", "abgehakt von Anna"). Sync pending is never red.
3. **No placeholders for unbuilt features.** No disabled "kommt bald" buttons,
   no empty "Nährwerte" rows. A feature appears when it works.
4. **Lists are scannable.** Library, shopping and settings rows are one or two
   lines; secondary actions live in an overflow menu or the edit sheet.
5. **AI always has a manual path** that is visible next to the AI entry point;
   with AI disabled the manual path becomes the primary one.
6. **Borders separate, shadows lift.** Only floating surfaces (sheets, dialogs,
   menus, toasts) get a shadow.
7. **Copy:** German first, informal "du"; destructive dialogs name the object
   ("Liste „Wocheneinkauf“ löschen?").

## 3. Color

| Token (CSS var)              | Light             | Dark              | Use                                       |
| ---------------------------- | ----------------- | ----------------- | ----------------------------------------- |
| background                   | #fbf8f4           | #171412           | Page paper, bars                          |
| foreground                   | #1d1917           | #f6f1ec           | Body text, icons                          |
| card / popover               | #ffffff           | #221e1b           | Cards, inputs, floating surfaces          |
| primary / -foreground        | #d2341f / #ffffff | #ff7a66 / #3a0d06 | The one primary action, links, active tab |
| primary-hover                | #b32a17           | #ff9483           | Hover of primary                          |
| primary-soft                 | #fde6e1           | #45201a           | Tags, selected chip, active tab pill      |
| secondary / muted / accent   | #f0ebe5           | #2d2824           | Secondary buttons, chips, steppers        |
| secondary-hover              | #e6dfd7           | #383229           | Hover of soft fills                       |
| secondary-foreground         | #3b342f           | #e9e2da           | Text on secondary                         |
| muted-foreground             | #6b625c           | #b3a9a1           | Meta text, hints                          |
| border / input               | #948a82           | #7d726a           | Text inputs, checkboxes (3:1 min)         |
| line                         | #ebe5de           | #322c28           | Dividers and card outlines                |
| ring                         | #d2341f           | #ff7a66           | Focus ring                                |
| destructive                  | #9b1c31           | #ff9aa5           | Delete, remove, timer alarm               |
| warning / warning-foreground | #f7ecd6 / #6b470c | #3d3220 / #f2d49b | Offline banner, sync pending, "fällig"    |
| success                      | #2f7a45           | #8fd3a0           | Checked items, progress, presence         |

`line` is decorative only. Buttons, chips and steppers are filled and need no border; text inputs
and checkboxes keep the `border` token.

## 4. Typography

One sans family (system stack, `Inter` first when installed, no web font). Titles get their
character from weight and tracking, not from a second typeface.

| Role      | Size / line height       | Weight       |
| --------- | ------------------------ | ------------ |
| display   | 28/1.1 (34 at >=1200 px) | 800, -0.03em |
| title     | 24/1.15                  | 800, -0.03em |
| heading   | 17/1.3                   | 700          |
| body      | 16/1.5                   | 400          |
| label     | 14/1.3                   | 600          |
| meta      | 13/1.35                  | 400          |
| overline  | 12/1, caps, +0.06em      | 700          |
| cook step | 26 phone -> 34 tablet    | 500          |

Quantities and timers use `tabular-nums`. Inputs never go below 16 px.

## 5. Spacing, radii, elevation, motion

- Spacing on a 4 px base: 4, 8, 12, 16, 24, 32, 48. Gutter 16 phone, 24 tablet+.
  Row height 56. Targets at least 44x44.
- Radii: 8 badge, 10 chip, 14 control, 20 card, 24 sheet. Checkboxes are round.
- Elevation: 0 flat, 1 sheet/menu, 2 dialog/toast.
- Motion: 150 ms press/toggle, 200 ms ease-out for sheets and dialogs in, 150 ms
  out. Checked shopping rows stay 600 ms before moving to "Erledigt".
  `prefers-reduced-motion` removes movement, keeps state changes.

## 6. Layout and breakpoints

| Width      | Navigation                                                       | Content                           |
| ---------- | ---------------------------------------------------------------- | --------------------------------- |
| < 768      | Top bar (page title + page actions), bottom tabs with labels     | One column, 16 px gutter          |
| 768 - 1199 | Same top bar and bottom tabs                                     | One column, centered, max 760 px  |
| >= 1200    | 220 px sidebar (wordmark, four sections); top bar with the title | One column, centered, max 1000 px |

The top bar carries the page title (title role) on the left and the page's own
actions as icon buttons on the right (add, import, suggestions); detail screens show
a back arrow before the title. The household chip appears only when the user belongs
to several households. Tabs: Heute, Rezepte, Liste, Mehr.
Columns inside the content column: recipe cards 2 / 3 / 4 per row; recipe
detail from 768 px ingredients (340-360 px) beside the steps; shopping
categories 2 (tablet) / 3 (desktop) columns; sheets become centered 560 px
dialogs from 768 px.

The cooking view is a full-screen mode outside the shell at every size;
shopping stays in the list view (ADR 0014). From 768 px the cooking view uses two columns: ingredients for the step
left, the step right.

Layout: Learned shopping route - follow the store's observed item order -> stack
inside the list view; scroll owner: `.app-main`; rows keep the route order and
only consecutive rows of one category share a heading. Tapping a row checks it,
long-press edits, swipe left removes with undo; with a fine pointer an edit
button shows on hover/focus. The store chip in the toolbar marks the trip store;
only then do checks train the route. Reading priorities are quick add, store,
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

Layout: Expected leftovers and reuse suggestions - live on the Vorschläge page
(`/plan/suggestions`) reached from Als Nächstes; scroll owner: `.app-main`. Keep the shopping preview
and active list in their existing places. Reading priorities are planned meals,
shopping, expected leftovers, then recipes that use them. Leftover rows show
localized ingredient names and amounts, with secondary edit and dismiss actions.
Editing expands one compact quantity/unit form beneath its row; failures stay
beside the affected row. Suggestions use compact recipe rows with secondary add
actions and the recipe's original servings. A checkbox expands suggestions to
recipes sharing ingredients with queued meals. Avoid extra primary buttons,
recipe-card grids, and adding controls inside the dense queue rows.

Layout: Free-text meals - share the ordered planning list with recipe entries;
scroll owner: `.app-main`. The existing add sheet offers a recipe picker or a
compact title/note/date form. Free-text rows show the title, "Without recipe",
optional date and note; editing uses the existing sheet. Keep recipe-only cook,
servings and shopping actions off free-text entries.

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

The page title in the top bar is the page's h1; when the content carries its
own title (recipe detail) the top bar label is plain text. The content column owns its scroll;
there is no page scroll behind it and no horizontal page scroll down to 320 px.
On phones, tag filters are one horizontally scrolling strip. Safe-area insets extend bars, tabs and sidebar. On
> = 1200 px, `/` focuses search and `n` starts a new recipe.

## 7. Component patterns

Layout: Public recipe sharing - read a recipe before saving a personal copy ->
full-screen detail outside the app shell; scroll owner: `.shared-content`.
Keep the compact brand header fixed and use the existing ingredient/step columns
from 768 px. The primary action is Save to my household. Reading priorities are
recipe title and image, ingredients and steps, then the source. Required content
includes quantities, servings, sections, notes, optional markers, preparation and
cooking times, tags, source link, save feedback and unavailable-link state.
Household identity, ratings and cooking history are omitted.

Layout: Recipe sharing controls - create and manage independent links -> the
existing recipe detail sheet; scroll owner: the sheet body. The primary action
is Create link. Show an optional expiry field, the public-access explanation,
each link's URL, creation and expiry dates, copy and revoke actions, and errors
beside the affected action. Use no additional filled row actions.

Layout: Household data transfer - move a complete household archive -> a single
column at `/more/data`, reached from More; scroll owner: `.app-main`. Export is
a secondary download action. Import is the primary action and requires selecting
a JSON file and reviewing its counts first. Show the active household, format and
size limits, additive-copy behavior, selected filename, recipe/catalog/list/queue
counts, inline errors and a success receipt. Existing records remain in place;
repeated imports create additional copies. Keep authentication and access tokens
out of the archive. Avoid nested scrolling and decoration around the count list.

Layout: Recipe insights - choose a meal using personal ratings and household
cooking history -> stack inside the existing library and recipe detail;
scroll owner: `.app-main`. Avoid a second scroll region for ratings or history.
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

- **Button:** primary (filled red), secondary (soft fill), ghost, destructive. Fixed geometry
  in every state; press scales to 0.98.
- **Today (`/plan`, the start screen):** the next meal as a card (photo when there
  is one, title, meta, Kochen as the primary action, Gekocht, a more button), then
  "Danach" with one-line queue rows (thumbnail, title, meta, drag handle). Tapping a
  row opens the entry sheet: servings, view recipe, cooked, cook, skip, move up/down
  (the non-drag path), note, date, remove. Below the queue a secondary button pushes
  ingredients to the shopping list.
- **Overflow menu / sheet:** native `<dialog>` (focus trap, Escape, focus
  return): bottom sheet on phones, centered dialog from 768 px. Header shows the
  object (title + meta) and a close button; destructive items are red.
- **Cooking view header:** close, title with "Schritt 1 von 6 · 4 Portionen",
  the wake-lock state as a chip (icon + word), a progress bar below.
- **Empty state:** bold headline, one sentence, one primary next action.
- **Skeleton:** shaped like the content it replaces; static under reduced motion.

## 8. Cross-cutting states

Offline (banner under the top bar: what works, what waits), sync pending (cloud
icon + count), AI disabled (manual path first), empty, loading (skeleton), error
(human cause + "Erneut versuchen"), no access / no household (route to switcher
or onboarding), permission denied (camera, notifications, wake lock -> fallback).

## 9. Accessibility

WCAG 2.2 AA. Text contrast at least 4.5:1, control boundaries 3:1, focus ring
2 px at 3 px offset. Every drag interaction has a non-drag alternative (menu
items and arrow keys on the handle). Shell targets at least 44 px; shopping rows
60 px. Row gestures (long-press, swipe) always have a keyboard and screen-reader
button alternative; on touch the edit button stays visually hidden by choice.

## 10. Changing the design line

- Small refinements: change this file in the same commit as the code.
- A change to a rule in section 2, the palette, the type families, the
  breakpoints or the reference structure: new ADR, then update this file.
