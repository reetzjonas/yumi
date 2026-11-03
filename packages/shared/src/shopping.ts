import { z } from "zod";
import {
  type ConversionFactors,
  convertQuantity,
  type Unit,
  unitSchema,
} from "./units";

const label = z.string().trim().min(1).max(200);
const quantity = z.number().positive().max(1_000_000).nullable();

export const shoppingItemFieldsSchema = z.object({
  label,
  ingredientId: z.uuid().nullable().default(null),
  quantity: quantity.default(null),
  unit: unitSchema.nullable().default(null),
  categoryId: z.uuid().nullable().default(null),
  sources: z
    .array(
      z.object({
        kind: z.enum(["recipe", "queue", "recurring"]),
        id: z.uuid(),
      }),
    )
    .max(50)
    .default([]),
});

const eventBase = {
  id: z.uuid(),
  itemId: z.uuid(),
  clientTs: z.iso.datetime({ offset: true }),
  storeId: z.uuid().nullable().default(null),
};

/** Offline-writable list changes; the client generates ids so replays are idempotent (ADR 0005). */
export const shoppingEventSchema = z.discriminatedUnion("type", [
  z.object({
    ...eventBase,
    type: z.literal("item_added"),
    payload: shoppingItemFieldsSchema,
  }),
  z.object({
    ...eventBase,
    type: z.literal("item_updated"),
    payload: z
      .object({
        label,
        ingredientId: z.uuid().nullable(),
        quantity,
        unit: unitSchema.nullable(),
        categoryId: z.uuid().nullable(),
      })
      .partial(),
  }),
  z.object({
    ...eventBase,
    type: z.enum(["item_checked", "item_unchecked", "item_removed"]),
  }),
]);

export type ShoppingEvent = z.input<typeof shoppingEventSchema>;

export const shoppingEventBatchSchema = z.object({
  events: z.array(shoppingEventSchema).min(1).max(500),
});

export const shoppingListInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
});

export type ItemSourceRef = {
  kind: "recipe" | "queue" | "recurring";
  id: string;
};

export interface MergeableItem {
  id: string;
  label: string;
  ingredientId: string | null;
  categoryId: string | null;
  quantity: number | null;
  unit: Unit | null;
  checked: boolean;
  sources: ItemSourceRef[];
  factors?: ConversionFactors;
}

export interface MergedItem {
  key: string;
  itemIds: string[];
  label: string;
  ingredientId: string | null;
  categoryId: string | null;
  checked: boolean;
  /** one entry per unit that could not be converted into another, e.g. 500 g + 1 can */
  amounts: Array<{ quantity: number; unit: Unit | null }>;
  sources: ItemSourceRef[];
}

function addAmount(
  amounts: MergedItem["amounts"],
  quantity: number,
  unit: Unit | null,
  factors: ConversionFactors | undefined,
) {
  for (const amount of amounts) {
    if (amount.unit === unit) {
      amount.quantity += quantity;
      return;
    }
    if (amount.unit && unit) {
      const converted = convertQuantity(quantity, unit, amount.unit, factors);
      if (converted !== null) {
        amount.quantity += converted;
        return;
      }
    }
  }
  amounts.push({ quantity, unit });
}

/**
 * Groups duplicates for display: unchecked items with the same catalog ingredient
 * (or the same free-text label) become one row with summed, unit-converted amounts.
 * Rows stay separate in storage so offline edits never conflict.
 */
export function mergeShoppingItems(items: MergeableItem[]): MergedItem[] {
  const groups = new Map<string, MergedItem>();
  for (const item of items) {
    const identity =
      item.ingredientId ?? `label:${item.label.trim().toLowerCase()}`;
    const key = item.checked ? `checked:${item.id}` : identity;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        itemIds: [],
        label: item.label,
        ingredientId: item.ingredientId,
        categoryId: item.categoryId,
        checked: item.checked,
        amounts: [],
        sources: [],
      };
      groups.set(key, group);
    }
    group.itemIds.push(item.id);
    if (item.quantity !== null) {
      addAmount(group.amounts, item.quantity, item.unit, item.factors);
    }
    for (const source of item.sources) {
      if (
        !group.sources.some((s) => s.kind === source.kind && s.id === source.id)
      ) {
        group.sources.push(source);
      }
    }
  }
  return [...groups.values()];
}

export const addRecipeToListSchema = z.object({
  recipeId: z.uuid(),
  servings: z.number().int().min(1).max(100).optional(),
  locale: z.enum(["de", "en"]).default("de"),
});
