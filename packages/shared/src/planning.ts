import { z } from "zod";

const servings = z.number().int().min(1).max(100);
const plannedFor = z.iso.date().nullable();
const mealTitle = z.string().trim().min(1).max(200);
const mealNote = z.string().trim().max(2000).nullable();

export const queueEntryInputSchema = z
  .object({
    recipeId: z.uuid().nullable().optional(),
    title: mealTitle.nullable().optional(),
    note: mealNote.optional(),
    servings,
    plannedFor: plannedFor.default(null),
  })
  .refine((value) => Boolean(value.recipeId) !== Boolean(value.title));

export const queueEntryUpdateSchema = z
  .object({
    servings: servings.optional(),
    title: mealTitle.optional(),
    note: mealNote.optional(),
    plannedFor: plannedFor.optional(),
    status: z.enum(["cooked", "skipped"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

export const queueOrderSchema = z.object({
  ids: z.array(z.uuid()).refine((ids) => new Set(ids).size === ids.length),
});

export const queueShoppingPreviewSchema = z.object({
  ids: z
    .array(z.uuid())
    .min(1)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length),
  locale: z.enum(["de", "en"]).default("de"),
});

export const queueShoppingInputSchema = queueShoppingPreviewSchema.extend({
  listId: z.uuid(),
  version: z.string().regex(/^[0-9a-f]{64}$/),
  requestId: z.uuid(),
  includeStaples: z.boolean().default(false),
});

export const queueRemovalSchema = z.object({
  removeItems: z.enum(["true", "false"]).default("false"),
});
