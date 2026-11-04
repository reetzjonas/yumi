# Leftovers and ingredient reuse

Goal: when planning, help use up what will be left over.

1. When queue entries are pushed to the shopping list, compare the needed amount per ingredient with the
   ingredient's `pack_sizes`. The difference becomes an expected `leftover` (e.g. buy 200 ml cream, need 100 ml).
2. Leftovers are shown in the planning view; the user can dismiss or adjust them.
3. Suggestions rank recipes by how much leftover quantity they consume, then by ingredient overlap
   with queued recipes (Jaccard on catalog ingredients, pantry staples excluded).
4. Marking a queue entry as cooked consumes its ingredients from leftovers.

Requires unit conversion (density, piece weight) from `packages/shared`.

## Storage and updates

Confirmation merges the selected non-optional shopping needs before comparing
compatible pack sizes. It buys whole multiples of one size, choosing the smallest
total purchase that covers the need. Unknown conversions create no estimate.
Pantry staples only create estimates when explicitly included in the shopping
confirmation.

Expected remainders are household-owned `leftover` rows with quantity, unit and
the contributing queue entry IDs. Their IDs derive from the shopping request,
ingredient and unit. Only newly applied shopping events create them, so replaying
a confirmation cannot restore a remainder the user dismissed.

Cooking an entry consumes compatible quantities from earlier remainders, scaled
to its servings, in creation order. It leaves that entry's own expected remainder
intact: those ingredients were already deducted when the pack was estimated.
Queue status changes and remainder edits share the household queue lock.

`GET /api/leftovers`, `PATCH /api/leftovers/:id` and
`DELETE /api/leftovers/:id` list, adjust and dismiss estimates.
`GET /api/leftovers/suggestions?similar=true` also includes recipes sharing
ingredients with queued meals. Suggestions exclude queued recipes and pantry
staples; consumption coverage ranks ahead of Jaccard overlap. They use each
candidate recipe's stored servings and show at most twelve recipes.
