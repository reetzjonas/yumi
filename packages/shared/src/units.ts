import { z } from "zod";

export const UNITS = [
  "g",
  "kg",
  "ml",
  "l",
  "pcs",
  "tbsp",
  "tsp",
  "cup",
  "pinch",
  "bunch",
  "can",
  "pack",
] as const;

export const unitSchema = z.enum(UNITS);
export type Unit = z.infer<typeof unitSchema>;

/**
 * Units only convert within one dimension, except mass, volume and count,
 * which bridge via an ingredient's density and piece weight.
 * pinch, bunch, can and pack are their own dimensions.
 */
export type Dimension =
  | "mass"
  | "volume"
  | "count"
  | "pinch"
  | "bunch"
  | "can"
  | "pack";

const UNIT_DEFS: Record<Unit, { dimension: Dimension; toBase: number }> = {
  g: { dimension: "mass", toBase: 1 },
  kg: { dimension: "mass", toBase: 1000 },
  ml: { dimension: "volume", toBase: 1 },
  l: { dimension: "volume", toBase: 1000 },
  tbsp: { dimension: "volume", toBase: 15 },
  tsp: { dimension: "volume", toBase: 5 },
  // US cup; a German "Tasse" varies (150-250 ml), so this is an approximation.
  cup: { dimension: "volume", toBase: 240 },
  pcs: { dimension: "count", toBase: 1 },
  pinch: { dimension: "pinch", toBase: 1 },
  bunch: { dimension: "bunch", toBase: 1 },
  can: { dimension: "can", toBase: 1 },
  pack: { dimension: "pack", toBase: 1 },
};

export function unitDimension(unit: Unit): Dimension {
  return UNIT_DEFS[unit].dimension;
}

const UNIT_ALIASES: Record<Unit, readonly string[]> = {
  g: ["g", "gr", "gramm", "gram", "grams", "gramme", "grammes"],
  kg: ["kg", "kilo", "kilos", "kilogramm", "kilogram", "kilograms"],
  ml: ["ml", "milliliter", "milliliters", "millilitre", "millilitres"],
  l: ["l", "liter", "liters", "litre", "litres"],
  pcs: ["pcs", "pc", "piece", "pieces", "stk", "st", "stück", "stueck"],
  tbsp: [
    "tbsp",
    "tbs",
    "tbl",
    "tablespoon",
    "tablespoons",
    "el",
    "esslöffel",
    "eßlöffel",
  ],
  tsp: ["tsp", "teaspoon", "teaspoons", "tl", "teelöffel"],
  cup: ["cup", "cups", "tasse", "tassen"],
  pinch: ["pinch", "pinches", "prise", "prisen"],
  bunch: ["bunch", "bunches", "bund", "bd"],
  can: ["can", "cans", "tin", "tins", "dose", "dosen"],
  pack: [
    "pack",
    "packs",
    "package",
    "packages",
    "pkg",
    "packung",
    "packungen",
    "päckchen",
    "pck",
    "pkt",
  ],
};

const ALIAS_LOOKUP = new Map<string, Unit>(
  UNITS.flatMap((unit) =>
    UNIT_ALIASES[unit].map((alias) => [alias, unit] as const),
  ),
);

/** Resolves a unit as written in a recipe ("EL", "Päckchen", "tbsp.") to a unit code. */
export function parseUnit(text: string): Unit | null {
  const key = text.normalize("NFC").trim().toLowerCase().replace(/\.$/, "");
  return ALIAS_LOOKUP.get(key) ?? null;
}

export interface ConversionFactors {
  densityGPerMl?: number | null;
  pieceWeightG?: number | null;
}

function toGrams(
  amount: number,
  dimension: Dimension,
  f: ConversionFactors,
): number | null {
  switch (dimension) {
    case "mass":
      return amount;
    case "volume":
      return f.densityGPerMl ? amount * f.densityGPerMl : null;
    case "count":
      return f.pieceWeightG ? amount * f.pieceWeightG : null;
    default:
      return null;
  }
}

function fromGrams(
  grams: number,
  dimension: Dimension,
  f: ConversionFactors,
): number | null {
  switch (dimension) {
    case "mass":
      return grams;
    case "volume":
      return f.densityGPerMl ? grams / f.densityGPerMl : null;
    case "count":
      return f.pieceWeightG ? grams / f.pieceWeightG : null;
    default:
      return null;
  }
}

/**
 * Converts a quantity between units. Across mass, volume and count it needs the
 * ingredient's density or piece weight. Returns null when no conversion exists.
 */
export function convertQuantity(
  quantity: number,
  from: Unit,
  to: Unit,
  factors: ConversionFactors = {},
): number | null {
  if (from === to) return quantity;
  const source = UNIT_DEFS[from];
  const target = UNIT_DEFS[to];
  const base = quantity * source.toBase;
  if (source.dimension === target.dimension) return base / target.toBase;
  const grams = toGrams(base, source.dimension, factors);
  if (grams === null) return null;
  const converted = fromGrams(grams, target.dimension, factors);
  return converted === null ? null : converted / target.toBase;
}

function displayStep(quantity: number, unit: Unit): number {
  switch (unit) {
    case "g":
    case "ml":
      if (quantity < 10) return 0.5;
      if (quantity < 50) return 1;
      if (quantity < 250) return 5;
      return 10;
    case "kg":
    case "l":
      return quantity < 10 ? 0.05 : 0.5;
    case "pinch":
      return 1;
    default:
      if (quantity < 3) return 0.25;
      if (quantity < 10) return 0.5;
      return 1;
  }
}

/** Rounds to a step a cook would measure; a positive quantity never rounds to 0. */
export function roundForDisplay(quantity: number, unit: Unit): number {
  const step = displayStep(quantity, unit);
  const rounded = Math.round(quantity / step) * step;
  const result = rounded === 0 && quantity > 0 ? step : rounded;
  return Number(result.toFixed(2));
}

const LARGER_UNIT: Partial<Record<Unit, Unit>> = { g: "kg", ml: "l" };
const SMALLER_UNIT: Partial<Record<Unit, Unit>> = { kg: "g", l: "ml" };

export interface Quantity {
  quantity: number;
  unit: Unit;
}

/** Picks g/kg and ml/l by magnitude and rounds for display, e.g. 1234 g -> 1.25 kg. */
export function humanizeQuantity(quantity: number, unit: Unit): Quantity {
  const smaller = SMALLER_UNIT[unit];
  if (smaller && quantity < 1) {
    return humanizeQuantity(quantity * 1000, smaller);
  }
  const rounded = roundForDisplay(quantity, unit);
  const larger = LARGER_UNIT[unit];
  if (larger && rounded >= 1000) {
    return { quantity: roundForDisplay(quantity / 1000, larger), unit: larger };
  }
  return { quantity: rounded, unit };
}
