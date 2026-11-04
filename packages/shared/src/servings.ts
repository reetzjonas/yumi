import { convertQuantity, humanizeQuantity, type Unit } from "./units";

/**
 * Scales the original recipe quantity, returning a cook-friendly amount in its
 * original unit. Always pass the original quantity and base servings, never a
 * previously rounded result. Display helpers can choose a more readable unit.
 */
export function scaleRecipeQuantity(
  quantity: number | null,
  unit: Unit | null,
  baseServings: number,
  servings: number,
): number | null {
  if (quantity === null) return null;

  const scaled = quantity * (servings / baseServings);
  if (unit === null) return scaled;
  if (unit === "pcs") return Math.max(1, Math.round(scaled));

  const human = humanizeQuantity(scaled, unit);
  return convertQuantity(human.quantity, human.unit, unit);
}
