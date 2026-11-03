import {
  type ParsedIngredientLine,
  parseIngredientLine,
  type RecipeIngredientInput,
  type Unit,
  unitSchema,
} from "@yumi/shared";
import {
  buildRawText,
  type ParsedLine,
  parseQuantityInput,
  quantityInputValue,
  type RecipeDetail,
  unitLabel,
} from "@/lib/recipes";
import { m } from "@/paraglide/messages";

export type IngredientRow = {
  key: string;
  rawText: string;
  quantity: string;
  unit: Unit | null;
  name: string;
  note: string;
  section: string;
  optional: boolean;
  ingredientId: string | null;
  confidence: number;
  changed: boolean;
};

export type StepRow = { key: string; text: string };

function preservedNote(parsed: ParsedIngredientLine, existing?: string | null) {
  const parts: string[] = [];
  for (const part of [
    existing,
    parsed.note,
    parsed.unitText,
    parsed.quantityMax === null
      ? null
      : [
          `${quantityInputValue(parsed.quantity)}-${quantityInputValue(parsed.quantityMax)}`,
          parsed.unit ? unitLabel(parsed.unit) : parsed.unitText,
        ]
          .filter(Boolean)
          .join(" "),
  ]) {
    if (part && !parts.some((value) => value.includes(part))) parts.push(part);
  }
  return parts.join(", ");
}

export function newIngredient(): IngredientRow {
  return {
    key: crypto.randomUUID(),
    rawText: "",
    quantity: "",
    unit: null,
    name: "",
    note: "",
    section: "",
    optional: false,
    ingredientId: null,
    confidence: 1,
    changed: true,
  };
}

export function parsedIngredient(parsed: ParsedLine): IngredientRow {
  return {
    ...newIngredient(),
    rawText: parsed.raw,
    quantity: quantityInputValue(parsed.quantity),
    unit: parsed.unit,
    name: parsed.name,
    note: preservedNote(parseIngredientLine(parsed.raw), parsed.note),
    optional: parsed.optional,
    ingredientId: parsed.ingredient?.id ?? null,
    confidence: parsed.ingredient ? parsed.confidence : 0,
    changed: false,
  };
}

export function storedIngredient(
  line: RecipeDetail["ingredients"][number],
): IngredientRow {
  const parsed = parseIngredientLine(line.rawText);
  const unit = unitSchema.safeParse(line.unit);
  return {
    ...newIngredient(),
    rawText: line.rawText,
    quantity: quantityInputValue(line.quantity),
    unit: unit.success ? unit.data : null,
    name: parsed.name || line.rawText,
    note: preservedNote(parsed, line.note),
    section: line.section ?? "",
    optional: line.optional,
    ingredientId: line.ingredientId,
    confidence: line.ingredientId ? parsed.confidence : 0,
    changed: false,
  };
}

export function ingredientInput(
  row: IngredientRow,
  index: number,
): RecipeIngredientInput {
  const quantity = parseQuantityInput(row.quantity);
  if (
    quantity !== null &&
    (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000)
  ) {
    throw new Error(m["recipes.invalid_quantity"]({ number: index + 1 }));
  }
  return {
    section: row.section.trim() || null,
    rawText: row.changed ? buildRawText({ ...row, quantity }) : row.rawText,
    quantity,
    unit: row.unit,
    note: row.note.trim() || null,
    optional: row.optional,
    ingredientId: row.ingredientId,
  };
}

export function moveRow<T>(rows: T[], index: number, direction: -1 | 1): T[] {
  const next = [...rows];
  const target = index + direction;
  if (target < 0 || target >= rows.length) return rows;
  next.splice(target, 0, ...next.splice(index, 1));
  return next;
}
