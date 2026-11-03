# Learned shopping order

Goal: in shopping mode, items appear in the order the user walks through a specific store.

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

- Users pick the store when entering shopping mode (later: remember last / geolocation).
- Manual drag-and-drop of categories per store overrides learning until reset.
- Pairwise-precedence models are a possible upgrade if the mean-position approach feels jumpy.
