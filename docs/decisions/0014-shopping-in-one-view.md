# 0014: Shopping happens in the list view, without a separate shopping mode

- Status: Accepted (alpha)
- Date: 2026-11-05

## Context

The draft v2 (ADR 0013) split shopping into the list screen (add, edit, check via a small
checkbox) and a full-screen shopping mode (`/shop/$listId`) that sorted by the learned store
route. Only the mode attached the store to check events. In practice the owner wants to add and
check items in one view, like Bring, without starting a mode first.

## Decision

- `/list` is the only shopping surface; the shopping mode route is removed.
- Tapping a row checks it. Long-press opens the edit sheet, swiping left removes the item with
  undo. With a fine pointer an edit button appears on hover or focus; it always stays reachable
  by keyboard and screen readers. A dismissible hint explains the gestures on touch devices.
- A store chip in the list toolbar marks the trip: "At <store>". Sorting uses the trip store,
  else the list's default store, else the category order.
- Check events carry a `storeId` only when the shopper picked the store for the current trip
  (stored per device and list, expires after four hours without a check). Checking at home with
  only a default store therefore does not train the learned route.
- The screen stays on (Wake Lock API) while a trip store is picked and the page is visible.

## Consequences

- Supersedes the full-screen shopping mode of ADR 0013 and `docs/DESIGN.md`; the rest of
  ADR 0013 stays.
- Learning needs one explicit tap per trip. Without it, the route does not improve.
- Gestures need a visible alternative; the edit sheet keeps the remove action.
