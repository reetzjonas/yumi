import { z } from "zod";

const servings = z.number().int().min(1).max(100);
const plannedFor = z.iso.date().nullable();

export const queueEntryInputSchema = z.object({
  recipeId: z.uuid(),
  servings,
  plannedFor: plannedFor.default(null),
});

export const queueEntryUpdateSchema = z
  .object({
    servings: servings.optional(),
    plannedFor: plannedFor.optional(),
    status: z.enum(["cooked", "skipped"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

export const queueOrderSchema = z.object({
  ids: z.array(z.uuid()).refine((ids) => new Set(ids).size === ids.length),
});
