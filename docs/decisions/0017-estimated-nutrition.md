# 0017: Estimated nutrition and weights instead of gaps

- Status: Accepted (alpha)
- Date: 2026-11-11

## Context

Recipe nutrition only counted a line when its ingredient had a USDA profile and the amount converted
to grams through a density or piece weight. Everything else stayed empty on purpose: no guessed
values, and never a weight for pinch, bunch, can or pack. In practice that left most recipes with
partial figures. Of 54 typical German recipe lines, 23 counted: 13 failed on a catalog entry without
nutrition (quark, crème fraîche, coconut milk, couscous), 13 on the conversion ("1 Dose
Kichererbsen", "1 Bund Petersilie", "1 Prise Salz"). A sum that silently misses the cream is more
misleading than one built on a labelled estimate.

## Decision

A plausible estimate beats a gap, as long as it is marked.

- Catalog entries without a USDA profile get a hand-maintained estimate from typical label values
  (`packages/db/src/seed/estimates.ts`) with `nutrition_source = "Estimate from typical label
  values"`. USDA profiles always win; tests keep the two tables disjoint and the estimates plausible.
- The same file fills missing densities, piece weights and pack sizes. The piece weight is the weight
  of the natural counted part: a slice of toast, a sprig of rosemary, a fillet.
- Can, pack and bunch amounts convert through the ingredient's first pack size that has a weight; a
  pinch counts as 0.4 g.
- Measure words with a sensible unit get one on recipe lines (Becher: pack, Handvoll: 30 g, Schuss:
  20 ml, Messerspitze: pinch).
- Ingredients the import creates must carry a nutrition estimate and the factor their recipe line
  needs; incomplete household ingredients are completed when a later import links them.

## Consequences

- Nutrition figures are orientation values, not label data; the recipe view already says so.
- A can counts with its filling weight, not the drained weight, so canned pulses read high.
- Pack sizes now also describe a bunch, which the leftover estimate may pick up.
- Entries nobody eats as bought (coffee beans, tea) and non-food stay without nutrition.
