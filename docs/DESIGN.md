# yumi design system

## 1. Atmosphere and identity

A shared kitchen notebook: warm paper, dark olive ink, and terracotta actions.
Content has room to breathe. The identity comes from the warm palette and a
small cooking-pot mark, without decorative panels or invented recipe content.
Consumer navigation borrows the clear labels and generous targets of the Airbnb
reference; primitives use shadcn/ui Radix anatomy.

## 2. Color

| CSS role             | Light   | Dark    |
| -------------------- | ------- | ------- |
| background           | #fcfaf5 | #1a1e18 |
| foreground           | #292e24 | #f4f1e8 |
| card / popover       | #ffffff | #242a21 |
| primary              | #a43d28 | #f2aa8f |
| primary-foreground   | #ffffff | #381b12 |
| primary-hover        | #85301f | #ffc1a8 |
| secondary / muted    | #f1ece2 | #2e352a |
| secondary-foreground | #424c3a | #e3e8da |
| muted-foreground     | #64675b | #b8c0ad |
| accent               | #e8eddf | #35432d |
| accent-foreground    | #35482d | #e2edda |
| border / input       | #858778 | #858f79 |
| ring                 | #93412b | #efae91 |
| destructive          | #ac2928 | #ffb0a9 |

Every role has a matching Tailwind color. Browser selection, caret, scrollbar,
focus, and theme-color metadata use these roles. Decorative surface dividers may
use the border role at low alpha; input boundaries retain full contrast.

## 3. Typography

Use the system sans-serif stack: no font download blocks the shell.
Page titles: 32px mobile / 40px desktop, 700, line-height 1.2, -0.025em tracking.
Section / empty-state headings: 24px, 650, line-height 1.3.
Body: 16px, 400, line-height 1.6. Labels: 16px, 600.
Secondary small text: 14px, line-height 1.5, secondary ink.
Mobile navigation: 12px, 600, line-height 1.5.
Wordmark: 32px, 750, -0.04em. Long prose has a 68ch maximum.

## 4. Spacing and layout

The spacing scale is 4, 8, 12, 16, 24, 32, 40, 48, 64, 80px.
Content width: 960px; settings measure: 640px. Sidebar: 240px.
Mobile gutter: 24px. Wide gutter: clamp(32px, 5vw, 80px).
Control minimum height: 48px. Radius: 8px control, 16px surface.
The layout switches at 768px. Safe-area insets extend header, nav, and sidebar.

Layout: app shell - stable navigation alongside changing content -> fixed-sidenav-shell (https://raw.githubusercontent.com/changeroa/StyleGallery/main/patterns/viewport-shell/fixed-sidenav-shell.md); scroll owner: .app-main; anti-patterns: nested page scrolling, missing min-width:0, navigation covering focused content.

Below 768px the same shell has a top brand row and bottom navigation. Only the
main region scrolls. Navigation follows source order before main, with a skip
link directly to main. The bottom safe area is part of navigation.

## 5. Components and screen briefs

- Button: shadcn/ui Radix Slot + CVA anatomy. Primary, secondary, ghost variants;
  48px height; 16px gap/padding; disabled, hover, pressed, and visible focus states.
  Labels retain the same geometry in every state.
- Native select: labelled HTML select with 48px minimum height and full-contrast
  boundary. Native keyboard operation and platform selection behavior.
- Skeleton: shadcn/ui div anatomy, muted fill, gentle opacity pulse; static under
  reduced motion. Decorative shapes are hidden from assistive technology.
- Toast: Sonner, themed with semantic roles, close button, explicit action.
- AppShell: semantic navigation and main, optional `accountSlot` in sidebar and
  `moreSlot` on More. No authentication assumptions.
- PageHeader: one h1. EmptyState: a meaningful Lucide outline, h2, explanation,
  and a real navigation link when the next step exists. No unavailable controls.
- Settings: native theme and language selects; preference changes apply
  immediately. Theme supports system/light/dark and persists independently.

Recipes: primary action is navigation to the meal plan while capture is outside
this milestone. Priorities: page identity, honest empty state, related next step.
Required content: Recipes, no-recipes explanation, Plan link.
Plan: primary action is Recipes. Priorities: queue identity, empty explanation,
recipe navigation. Required: Plan, no-plan explanation, Recipes link.
List: primary action is Plan. Priorities: shopping identity, empty explanation,
plan navigation. Required: List, no-items explanation, Plan link.
More: primary action is Settings. Priorities: Settings, installation state,
optional account/household content. Required: More, Settings link, install hint.
Settings: primary action is changing a preference. Priorities: language, theme,
return navigation. Required: heading, More link, language label/options, theme
label/options, automatic-save explanation.

Left out on purpose: example recipes, counters, cards around empty content,
unimplemented add buttons, avatar/account placeholders, promotional subtitles.

## 6. Motion and interaction

Control press scales to 0.98 over 120ms ease-out. Reduced motion removes scale.
Focus always uses a 2px ring at 3px offset. No page-arrival animation.
Disabled controls keep dimensions; no hover feedback when disabled.
The skeleton opacity pulse takes 1.8s and is disabled under reduced motion.

## 7. Depth and surfaces

Tonal separation for sidebar, active navigation, and empty-state artwork.
Neutral 1px rules separate settings rows and mobile navigation.
No blur, gradients, decorative accent borders, or surface shadows.
Sonner uses its standard raised notification geometry with theme colors.

## 8. Accessibility and integration

Target WCAG 2.2 AA. Every shell target is at least 44px in both dimensions.
Text and controls retain contrast in both themes. No drag, authentication, or
repeated-entry flow exists in this shell. Browser testing evidence belongs in
the delivery report. Device-specific install behavior requires physical-device
testing in Android Chrome and iOS Safari; desktop emulation does not prove it.

## 9. Grounding

Personas: household members checking the shopping list on a phone, planning at
a desk, or reading a recipe on a tablet. The ideal shell keeps the four main
destinations reachable, identifies the current page, explains empty data, and
preserves readable settings in either locale and theme. Product principles
come from `product.md`; accessibility requirements are WCAG 2.2 AA.

The starter had no reusable UI, navigation, themes, or preference persistence.
The milestone closes those gaps with the AppShell, primitives, and Settings.
The before capture is `/tmp/yumi-frontend/before-390.png`; the final report
records the route/theme/language matrix and computed browser checks.
