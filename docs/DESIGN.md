# yumi design line: "Farbwelten"

The binding summary of how yumi looks and behaves. Why: [ADR 0016](decisions/0016-farbwelten.md).
The approved concept board lives on branch `prototype/design-directions`; `design/yumi-draft.html`
is a historical snapshot and not a reference.

## 1. Principles

1. **Every world has its color.** Heute is basil green, Liste lemon, Rezepte paprika, Mehr plum.
   The color is a large surface (the stage), never just an accent. You always see where you are.
2. **Tap at the bottom, read at the top.** Navigation, adding, cooking and stepping live in the
   thumb zone. The top carries the title and state ("Noch 9 von 12").
3. **Ink is the action.** The one primary action of a view is a black pill (cream in dark mode).
   Color means place or state, never "tap here". Red is only for deleting.
4. **Cards, not lines.** Content sits in round cards on a neutral ground. Aisles, meals and
   figures are tiles of their own, not table rows.
5. **Illustration instead of placeholders.** A recipe without a photo shows the pictogram of its
   first ingredient on a tint (`RecipeArt`). With a photo, the photo fills the same frame.
6. **No placeholders for unbuilt or unavailable features.** No disabled "coming soon" buttons; a
   feature that needs AI or push keys is hidden when those are missing.
7. **AI always has a manual path** next to it.
8. **Copy:** German first, informal "du"; destructive dialogs name the object.

## 2. Color

| Token (CSS var)       | Light             | Dark              | Use                                      |
| --------------------- | ----------------- | ----------------- | ---------------------------------------- |
| background            | #f2f1ec           | #121018           | Ground                                   |
| foreground / ink      | #17141f           | #f5f2ea           | Text, icons                              |
| card                  | #ffffff           | #1f1c29           | Cards, inputs, docks                     |
| primary / -foreground | #17141f / #ffffff | #f5f2ea / #17141f | The one primary action                   |
| secondary             | #e9e7df           | #2a2736           | Soft buttons, pills, steppers            |
| muted-foreground      | #65626f           | #a7a3b5           | Meta text                                |
| border / input        | #8b8898           | #77738a           | Text inputs, check circles (3:1 minimum) |
| line                  | #e7e5dd           | #2c2938           | Dividers inside cards                    |
| destructive           | #c22d18           | #ff9a85           | Delete, remove                           |
| success               | #1f5c45           | #74d6a6           | Checked, done                            |
| warning / -foreground | #fff1bd / #5c4a00 | #3d3414 / #f3dc8a | Notes, offline, sync pending             |

Worlds (`data-world` on the shell sets `--world`, `--on-world`, `--world-tint`):

| World   | world (light / dark) | on-world | tint (light / dark) |
| ------- | -------------------- | -------- | ------------------- |
| heute   | #1f5c45 / #1f6a4e    | #f4f1e2  | #d7eedd / #1c3a2e   |
| liste   | #f6cf57 / #d3ad45    | #17141f  | #fff1bd / #3d3414   |
| rezepte | #f47a61 / #d7684f    | #17141f  | #ffe0d6 / #47231b   |
| mehr    | #cfd3ff              | #17141f  | #e9ebff / #2b2c4d   |

Text on a world color always uses `--on-world`, never `--foreground`, because worlds stay colored
surfaces in dark mode. Lemon and paprika step down there so they do not glare on the dark ground;
the always-dark cooking view uses those dark steps in both themes. Status is never color alone: it
carries an icon or a word.

## 3. Type

Bricolage Grotesque (titles, figures) and Instrument Sans (text), bundled with
`@fontsource-variable` and precached; no request to a font service.

| Role       | Font and size                        |
| ---------- | ------------------------------------ |
| stage      | Bricolage 800, 34/1.02, -0.035em     |
| card title | Bricolage 800, 25-30/1.06            |
| section    | Bricolage 700, 19                    |
| figure     | Bricolage 800, 28 (stat tiles)       |
| row        | Instrument Sans 600, 16              |
| body       | Instrument Sans 400, 16/1.5          |
| meta       | Instrument Sans 500, 12-13           |
| cook step  | Bricolage 600, 31 phone -> 40 tablet |

Quantities and timers use `tabular-nums`. Inputs never go below 16 px.

## 4. Shape, spacing, motion

- Radii: buttons, chips and pills are full pills; inputs 18; cards 24-28; stage bottom and sheets
  32-34; check marks are circles.
- Spacing on a 4 px base; gutter 16 on phones. Targets at least 44x44, rows 56.
- Shadows only on floating things: navigation, docks, the add button, sheets.
- Motion: 150 ms press/toggle, 200 ms for sheets. `prefers-reduced-motion` removes movement.

## 5. Shell

| Width   | Navigation                                        | Content                     |
| ------- | ------------------------------------------------- | --------------------------- |
| < 1200  | Floating dark pill at the bottom, max 400 px wide | One column, max 720 px      |
| >= 1200 | Dark rail on the left, 92 px, icons with labels   | Up to 1064 px, multi-column |

- **Stage** (`PageHeader`): every page starts with it. Eyebrow, title, optional status line,
  round action buttons on the right, optional content inside (search, progress). `lift` lets the
  first card overlap the stage. The four top-level stages share one visible height (168 px, 184 px
  from 1200 px) so the band does not jump between sections. From 1200 px the cards are narrower
  than the band, so a lifted stage keeps that height and the card overlaps it. Sub-pages pass a
  back button and get a compact stage.
- **Navigation:** Heute, Rezepte, Liste, Mehr. The active item shows its label on the world color.
  Recipe detail is immersive on phones: the navigation hides and the action dock takes its place.
- The content column owns its scroll (`.app-main`); there is no horizontal page scroll down to
  320 px. Safe-area insets extend the stage, navigation and docks.
- On >= 1200 px, `/` focuses search and `n` starts a new recipe.

## 6. Screens

- **Heute (`/plan`, start):** stage with the date and "Was gibt’s heute?"; the meal of the day as
  a card (art, title, pills for time, servings, day and list status; Kochen as the primary action,
  Gekocht, more); two stat tiles (open shopping items, expected leftovers); "Danach" as a
  horizontal rail of meal cards ending in an add card. Tapping a card opens the entry sheet
  (servings, view recipe, cooked, cook, skip, move earlier/later, note, date, remove). A soft button
  pushes ingredients to the list. From 1200 px the card sits left and tiles and rail right.
- **Liste (`/list`):** stage with the trip store as eyebrow, the list name, "Noch x von y" and a
  progress bar; the round button opens the list menu (switch, create, rename, default store,
  rows or tiles, delete). Aisles are cards with icon, name and count. A row has the check circle,
  pictogram, name with source recipes below, and the quantity as a pill. Tapping checks,
  long-press edits, swipe left removes with undo; with a fine pointer an edit button shows on
  hover. Checked items collapse into the "Im Wagen" tray. Tiles are the alternative view. The add
  dock floats above the navigation and opens the add sheet: field first, matches as large tiles,
  recents and the catalog below; "Milch, Eier" adds several. Rows keep the learned route order
  (ADR 0014); only consecutive rows of one category share a card.
- **Rezepte (`/recipes`):** stage with the count, title and search; one chip strip (all, not
  lately, quick, favorites, then tags); a grid of art tiles 2/3/4 per row with a "last cooked"
  badge; a floating add button; import is the round stage action.
- **Rezept (`/recipes/$id`):** cover (photo or illustration) with round back and more buttons; the
  body overlaps the cover: title, description, stats (time, rating and history), tags, the note for
  next time, then ingredients and steps. Phones switch between the two with a segmented control;
  from 768 px both columns show. The floating dock holds Kochen, plan and add to list. Share, edit,
  source and delete are in the more menu.
- **Kochen (`/cook/$id`):** always dark, outside the shell. Round close button, title, wake-lock
  state as an icon, a thin progress bar; the step in large type; detected timers as outlined
  buttons; the step's ingredients as chips to tick off; "Alle Zutaten" opens the sheet with the
  servings stepper. Footer: round back button and a large lemon next button that becomes "mark
  cooked" on the last step. Swiping changes the step. The finish screen offers rating, the note for
  next time and planning leftovers. Scroll owner: `.cooking-body`.
- **Mehr (`/more`):** plum stage, one card list (household, history, stores, pantry, recurring,
  data, settings), then the install hint. Sub-pages use the compact stage.
- **Import (`/recipes/import`):** one field for a link or pasted text, the primary action, manual
  entry below; the photo section only with a vision model. The draft is reviewed in the editor.
- **Sheets:** native `<dialog>`; a bottom sheet with a grab handle on phones, a centered dialog
  from 768 px. The header shows the object and a close button; destructive items are red.
- **Timer dock:** follows active timers across routes above the navigation; see
  `docs/concepts/cooking-mode.md`.

## 7. Cross-cutting states

Offline (notice under the stage: what works, what waits), sync pending (count in the stage of the
list), AI disabled (manual path only), empty (bold headline, one sentence, one primary action),
loading (skeleton shaped like the content), error (human cause plus retry), no household (route to
onboarding), permission denied (camera, notifications, wake lock: fallback and explanation).

## 8. Accessibility

WCAG 2.2 AA. Text contrast at least 4.5:1, input and check boundaries 3:1, focus ring 2 px at 3 px
offset (in `--on-world` on a stage). Every gesture (long-press, swipe) has a button alternative
that stays reachable by keyboard and screen reader. Inactive navigation items keep their label for
assistive technology. Reordering the plan works with buttons in the entry sheet.

## 9. Changing the design line

- Small refinements: change this file in the same commit as the code.
- A change to a principle, the palette, the type families, the shell or the breakpoints: new ADR,
  then update this file.
