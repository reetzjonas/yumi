import {
  humanizeQuantity,
  recipeInputSchema,
  scaleRecipeQuantity,
  type Unit,
} from "@yumi/shared";
import type { InferRequestType, InferResponseType } from "hono/client";
import type { api } from "@/lib/api";
import { ensureOk } from "@/lib/api-error";
import { formatDate, formatNumber, getLocale, type Locale } from "@/lib/i18n";
import { m } from "@/paraglide/messages";

export type RecipeDetail = InferResponseType<
  (typeof api.recipes)[":id"]["$get"],
  200
>;
export type RecipeSummary = InferResponseType<
  typeof api.recipes.$get,
  200
>[number];
export type RecipeSuggestion = NonNullable<
  InferRequestType<typeof api.recipes.$get>["query"]["suggestion"]
>;
export type ParsedLine = InferResponseType<
  typeof api.ingredients.parse.$post,
  200
>[number];

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const IMAGE_TYPES = "image/jpeg,image/png,image/webp,image/gif";

const UNIT_LABELS = {
  g: m["units.g"],
  kg: m["units.kg"],
  ml: m["units.ml"],
  l: m["units.l"],
  pcs: m["units.pcs"],
  tbsp: m["units.tbsp"],
  tsp: m["units.tsp"],
  cup: m["units.cup"],
  pinch: m["units.pinch"],
  bunch: m["units.bunch"],
  can: m["units.can"],
  pack: m["units.pack"],
} satisfies Record<Unit, unknown>;

export function unitLabel(unit: Unit, locale: Locale = getLocale()) {
  return UNIT_LABELS[unit]({}, { locale });
}

export function servingsSearch(search: Record<string, unknown>): {
  servings?: number;
} {
  const parsed = recipeInputSchema.shape.servings.safeParse(
    Number(search.servings),
  );
  return parsed.success ? { servings: parsed.data } : {};
}

export function formatScaledQuantity(
  quantity: number | null,
  unit: Unit | null,
  baseServings: number,
  servings: number,
  locale: Locale = getLocale(),
) {
  const scaled = scaleRecipeQuantity(quantity, unit, baseServings, servings);
  if (scaled === null) return null;
  if (unit === "tbsp" || unit === "tsp" || unit === "cup") {
    const whole = Math.floor(scaled);
    const fraction = ["", "\u00bc", "\u00bd", "\u00be"][(scaled - whole) * 4];
    return `${whole ? formatNumber(whole, {}, locale) : ""}${fraction} ${unitLabel(unit, locale)}`;
  }
  return formatQuantity(scaled, unit, locale);
}

/** Display form of a stored quantity: "1,25 kg", "2 EL", "3". */
export function formatQuantity(
  quantity: number,
  unit: Unit | null,
  locale: Locale = getLocale(),
) {
  if (!unit)
    return formatNumber(quantity, { maximumFractionDigits: 2 }, locale);
  const human = humanizeQuantity(quantity, unit);
  const amount = formatNumber(
    human.quantity,
    { maximumFractionDigits: 2 },
    locale,
  );
  return `${amount} ${unitLabel(human.unit, locale)}`;
}

/** Quantity as typed in the editor: "1,5", "1.5" or "1/2". Empty -> null, unreadable -> NaN. */
export function parseQuantityInput(text: string): number | null {
  const value = text.trim();
  if (!value) return null;
  const fraction = value.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  if (!/^\d+(?:[.,]\d+)?$/.test(value)) return Number.NaN;
  return Number(value.replace(",", "."));
}

/** Quantity for an editor input, without grouping so it parses back. */
export function quantityInputValue(
  quantity: number | null,
  locale: Locale = getLocale(),
) {
  if (quantity === null) return "";
  return formatNumber(
    quantity,
    { maximumFractionDigits: 3, useGrouping: false },
    locale,
  );
}

/** Rebuilds a recipe line from edited fields: "200 g Mehl, gesiebt". */
export function buildRawText(
  fields: {
    quantity: number | null;
    unit: Unit | null;
    name: string;
    note: string;
  },
  locale: Locale = getLocale(),
) {
  const main = [
    fields.quantity === null
      ? ""
      : formatNumber(fields.quantity, { maximumFractionDigits: 3 }, locale),
    fields.unit ? unitLabel(fields.unit, locale) : "",
    fields.name.trim(),
  ]
    .filter(Boolean)
    .join(" ");
  const note = fields.note.trim();
  return note && main ? `${main}, ${note}` : main || note;
}

export function ingredientName(
  ingredient: { nameDe: string; nameEn: string },
  locale: Locale = getLocale(),
) {
  return locale === "de" ? ingredient.nameDe : ingredient.nameEn;
}

/** Groups lines by section in first-seen order; lines without a section come first. */
export function groupBySection<T extends { section: string | null }>(
  lines: T[],
) {
  const groups = new Map<string | null, T[]>([[null, []]]);
  for (const line of lines) {
    const group = groups.get(line.section);
    if (group) group.push(line);
    else groups.set(line.section, [line]);
  }
  return [...groups]
    .filter(([, items]) => items.length > 0)
    .map(([section, items]) => ({ section, lines: items }));
}

export function totalMinutes(recipe: {
  prepMinutes: number | null;
  cookMinutes: number | null;
}) {
  return (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);
}

export function formatMinutes(minutes: number) {
  return formatNumber(minutes, {
    style: "unit",
    unit: "minute",
    unitDisplay: "short",
  });
}

export function lastCookedLabel(cookedAt: string | null) {
  return cookedAt
    ? m["recipes.last_cooked"]({
        date: formatDate(new Date(cookedAt), { dateStyle: "medium" }),
      })
    : m["recipes.never_cooked"]();
}

export function recipeImageUrl(
  id: string,
  imageKey: string,
  size: "thumb" | "full",
) {
  return `/api/recipes/${id}/image/${size}?v=${encodeURIComponent(imageKey)}`;
}

export async function uploadRecipeImage(id: string, file: File) {
  const body = new FormData();
  body.append("image", file);
  const res = await ensureOk(
    await fetch(`/api/recipes/${id}/image`, { method: "PUT", body }),
  );
  return (await res.json()) as { imageKey: string };
}

export async function deleteRecipeImage(id: string) {
  await ensureOk(await fetch(`/api/recipes/${id}/image`, { method: "DELETE" }));
}

export const recipeKeys = {
  all: ["recipes"] as const,
  list: (q: string, tag: string | undefined) =>
    ["recipes", "list", { q, tag }] as const,
  tags: ["recipes", "tags"] as const,
  detail: (id: string) => ["recipes", "detail", id] as const,
};
