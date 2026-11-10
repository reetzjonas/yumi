import { z } from "zod";
import { nutritionValuesSchema } from "../nutrition";
import { HOUSEHOLD_TRANSFER_VERSION } from "./limits";

const id = z.uuid();
const text = z.string().max(20_000);
const key = z.string().min(1).max(200);
const number = z.number().finite().min(-1e30).max(1e30);
const integer = z.number().int().min(-2_147_483_648).max(2_147_483_647);
const positiveInteger = integer.min(1);
const timestamps = {
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
};
const row = z.strictObject({ id, ...timestamps });
const amount = {
  ingredientId: id.nullable(),
  label: text,
  quantity: number.nullable(),
  unit: text.nullable(),
  categoryKey: key.nullable(),
};
const base64 = (bytes: number) =>
  z
    .string()
    .max(4 * Math.ceil(bytes / 3))
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);
const rows = <T extends z.ZodType>(schema: T) => z.array(schema).max(10_000);

/** IDs are archive-local handles, never IDs of records in the receiving household. */
export const householdTransferDataSchema = z.strictObject({
  format: z.literal("yumi-household"),
  version: z.literal(HOUSEHOLD_TRANSFER_VERSION),
  exportedAt: z.iso.datetime({ offset: true }),
  ingredients: rows(
    z.discriminatedUnion("kind", [
      z.strictObject({ id, kind: z.literal("global"), key }),
      row.extend({
        kind: z.literal("custom"),
        nameDe: text,
        nameEn: text,
        synonyms: z.array(text).max(100),
        categoryKey: key.nullable(),
        defaultUnit: text.nullable(),
        densityGPerMl: number.nullable(),
        pieceWeightG: number.nullable(),
        nutritionPer100g: nutritionValuesSchema.nullable(),
        nutritionSource: text.nullable(),
        packSizes: z
          .array(z.strictObject({ quantity: number, unit: text }))
          .max(100),
        icon: text.nullable(),
      }),
    ]),
  ),
  recipes: rows(
    row.extend({
      title: text,
      description: text.nullable(),
      // Absent in archives written before cooking notes existed.
      cookingNotes: text.nullable().default(null),
      servings: positiveInteger,
      prepMinutes: integer.nullable(),
      cookMinutes: integer.nullable(),
      sourceUrl: z
        .url({ protocol: /^https?$/ })
        .max(2000)
        .nullable(),
      language: text.nullable(),
      tags: z.array(text).max(100),
    }),
  ),
  images: rows(
    z.strictObject({
      recipeId: id,
      thumb: base64(1024 * 1024),
      full: base64(4 * 1024 * 1024),
    }),
  ),
  recipeIngredients: rows(
    z.strictObject({
      id,
      recipeId: id,
      section: text.nullable(),
      position: integer,
      ingredientId: id.nullable(),
      rawText: text,
      quantity: number.nullable(),
      unit: text.nullable(),
      note: text.nullable(),
      optional: z.boolean(),
      excludeFromNutrition: z.boolean(),
    }),
  ),
  steps: rows(
    z.strictObject({
      id,
      recipeId: id,
      position: integer,
      text,
      ingredientRefs: z.array(id).max(10_000),
      ingredientRefsManual: z.boolean(),
      timers: z
        .array(z.strictObject({ seconds: positiveInteger, label: text }))
        .max(100),
    }),
  ),
  stores: rows(
    row.extend({
      name: text,
      categoryOrder: z.array(key).max(1000).nullable(),
    }),
  ),
  lists: rows(row.extend({ name: text, defaultStoreId: id.nullable() })),
  items: rows(
    row.extend({
      listId: id,
      ...amount,
      checked: z.boolean(),
      sources: z
        .array(
          z.strictObject({
            kind: z.enum(["recipe", "queue", "recurring"]),
            id,
          }),
        )
        .max(10_000),
    }),
  ),
  queue: rows(
    row
      .extend({
        recipeId: id.nullable(),
        title: z.string().trim().min(1).max(200).nullable().optional(),
        note: z.string().trim().max(2000).nullable().optional(),
        servings: positiveInteger,
        position: integer,
        plannedFor: z.iso.date().nullable(),
        status: z.enum(["queued", "cooked", "skipped"]),
      })
      .refine((value) => Boolean(value.recipeId) !== Boolean(value.title)),
  ),
  pantry: rows(row.extend({ ingredientId: id })),
  recurring: rows(
    row.extend({
      listId: id,
      ...amount,
      weekday: z.number().int().min(0).max(6),
      intervalWeeks: positiveInteger,
      nextDue: z.iso.date(),
    }),
  ),
  leftovers: rows(
    row.extend({
      ingredientId: id,
      quantity: number,
      unit: text,
      sourceEntryIds: z.array(id).max(10_000),
    }),
  ),
  cookLogs: rows(
    z.strictObject({
      id,
      recipeId: id,
      cookedAt: z.iso.datetime({ offset: true }),
    }),
  ),
});

export type HouseholdTransferData = z.infer<typeof householdTransferDataSchema>;
