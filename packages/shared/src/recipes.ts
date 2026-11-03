import { z } from "zod";
import { unitSchema } from "./units";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .default(null)
    .transform((v) => v || null);

export const recipeIngredientInputSchema = z.object({
  section: optionalText(100),
  rawText: z.string().trim().min(1).max(500),
  quantity: z.number().positive().max(1_000_000).nullable().default(null),
  unit: unitSchema.nullable().default(null),
  ingredientId: z.uuid().nullable().default(null),
  note: optionalText(500),
  optional: z.boolean().default(false),
});

export const recipeStepInputSchema = z.object({
  text: z.string().trim().min(1).max(5000),
});

export const recipeInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: optionalText(5000),
  servings: z.number().int().min(1).max(100).default(2),
  prepMinutes: z.number().int().min(0).max(10_000).nullable().default(null),
  cookMinutes: z.number().int().min(0).max(10_000).nullable().default(null),
  sourceUrl: z
    .url({ protocol: /^https?$/ })
    .max(2000)
    .nullable()
    .default(null),
  tags: z
    .array(z.string().trim().min(1).max(40))
    .max(20)
    .default([])
    .transform((tags) => [...new Set(tags)]),
  ingredients: z.array(recipeIngredientInputSchema).max(200).default([]),
  steps: z.array(recipeStepInputSchema).max(100).default([]),
});

export type RecipeInput = z.input<typeof recipeInputSchema>;
export type RecipeIngredientInput = z.input<typeof recipeIngredientInputSchema>;

export const recipeListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  tag: z.string().trim().max(40).optional(),
});
