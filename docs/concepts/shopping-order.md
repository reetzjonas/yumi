# Learned shopping order

Goal: in the shopping list, items appear in the order the user walks through a specific store.

## Input

`shopping_event` rows of type `item_checked` within one shopping session (same list, same store,
gaps < ~30 min). Each session yields an ordered sequence of ingredients.

## Model (first version, deliberately simple)

- Per session, normalized position p = rank / (n - 1) in [0, 1].
- Per (store, ingredient): exponentially weighted mean of p (recent sessions weigh more), plus sample count.
- Per (store, category): same, aggregated over its ingredients.
- Sort key for an item: ingredient score if sample_count >= 2, else category score, else manual
  category order, else category default_position.

## Notes

- Users mark the trip store with the chip in the list toolbar (later: geolocation). Only checks
  made while a trip store is picked carry a `store_id`, so checks at home do not train the
  route. The pick lives per device and list and expires after four hours without a check.
  Without a trip store the list sorts by its default store, without learning from checks.
- Manual drag-and-drop of categories per store overrides learning until reset.
- Pairwise-precedence models are a possible upgrade if the mean-position approach feels jumpy.

## Implementation

Check-off events store the ingredient and category at the time of the transition;
deleting a checked item does not erase that observation. Replayed events and
checks of an already checked item add no observation. Sessions use client times,
including offline uploads, and deduplicate ingredients before assigning ranks.
Single-item sessions do not train the model. Each session contributes one sample
per ingredient and one mean sample per category; the smoothing factor is 0.5.

`GET /api/stores/:id/order` derives scores from the store's event history.
`DELETE /api/stores/:id/order` clears the manual category override and records a
server-time cutoff. Older events stay in the audit trail but no longer teach the
store. The reset is exposed in the store editor. The list sorts individual
items, allowing a learned route to revisit a category.
