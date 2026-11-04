import { type ConversionFactors, convertQuantity, type Unit } from "./units";

/** Chooses the smallest purchase covering the need using one compatible pack size. */
export function expectedPackLeftover(
  quantity: number,
  unit: Unit,
  packSizes: readonly { readonly quantity: number; readonly unit: Unit }[],
  factors?: ConversionFactors,
): number {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;

  let smallestPurchase = Number.POSITIVE_INFINITY;
  for (const pack of packSizes) {
    const size = convertQuantity(pack.quantity, pack.unit, unit, factors);
    if (size === null || !Number.isFinite(size) || size <= 0) continue;

    const ratio = quantity / size;
    // Avoid buying another pack when a whole multiple has floating point noise.
    const count = Math.max(
      1,
      Math.ceil(ratio - Number.EPSILON * Math.max(1, ratio) * 8),
    );
    smallestPurchase = Math.min(smallestPurchase, count * size);
  }

  if (!Number.isFinite(smallestPurchase)) return 0;
  const leftover = smallestPurchase - quantity;
  return leftover <= Number.EPSILON * smallestPurchase * 8 ? 0 : leftover;
}

/** Scores leftover consumption first, then overlap with the queued ingredients. */
export function rankReuseRecipes(
  recipes: readonly {
    readonly id: string;
    readonly ingredients: readonly {
      readonly ingredientId: string;
      readonly quantity: number | null;
      readonly unit: Unit | null;
      readonly factors?: ConversionFactors;
    }[];
  }[],
  leftovers: readonly {
    readonly ingredientId: string;
    readonly quantity: number;
    readonly unit: Unit;
    readonly factors?: ConversionFactors;
  }[],
  queuedIngredientIds: readonly string[],
  stapleIds: readonly string[],
): { id: string; leftoverCoverage: number; overlap: number }[] {
  const staples = new Set(stapleIds);
  const queued = new Set(queuedIngredientIds.filter((id) => !staples.has(id)));

  return recipes
    .map((recipe) => {
      const ingredientIds = new Set(
        recipe.ingredients
          .map((ingredient) => ingredient.ingredientId)
          .filter((id) => !staples.has(id)),
      );
      let leftoverCoverage = 0;
      for (const leftover of leftovers) {
        if (
          staples.has(leftover.ingredientId) ||
          !Number.isFinite(leftover.quantity) ||
          leftover.quantity <= 0
        ) {
          continue;
        }

        let needed = 0;
        for (const ingredient of recipe.ingredients) {
          if (
            ingredient.ingredientId !== leftover.ingredientId ||
            ingredient.quantity === null ||
            ingredient.unit === null ||
            !Number.isFinite(ingredient.quantity) ||
            ingredient.quantity <= 0
          ) {
            continue;
          }
          const converted = convertQuantity(
            ingredient.quantity,
            ingredient.unit,
            leftover.unit,
            leftover.factors,
          );
          if (
            converted !== null &&
            Number.isFinite(converted) &&
            converted > 0
          ) {
            needed += converted;
          }
        }
        leftoverCoverage += Math.min(needed / leftover.quantity, 1);
      }

      const intersection = [...ingredientIds].filter((id) =>
        queued.has(id),
      ).length;
      const union = ingredientIds.size + queued.size - intersection;
      return {
        id: recipe.id,
        leftoverCoverage,
        overlap: union === 0 ? 0 : intersection / union,
      };
    })
    .sort(
      (a, b) =>
        b.leftoverCoverage - a.leftoverCoverage || b.overlap - a.overlap,
    );
}
