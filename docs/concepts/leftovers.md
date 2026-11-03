# Leftovers and ingredient reuse

Goal: when planning, help use up what will be left over.

1. When queue entries are pushed to the shopping list, compare the needed amount per ingredient with the
   ingredient's `pack_sizes`. The difference becomes an expected `leftover` (e.g. buy 200 ml cream, need 100 ml).
2. Leftovers are shown in the planning view; the user can dismiss or adjust them.
3. Suggestions rank recipes by how much leftover quantity they consume, then by ingredient overlap
   with queued recipes (Jaccard on catalog ingredients, pantry staples excluded).
4. Marking a queue entry as cooked consumes its ingredients from leftovers.

Requires unit conversion (density, piece weight) from `packages/shared`.
