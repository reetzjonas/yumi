import { z } from "zod";
import { unitSchema } from "./units";

const name = z.string().trim().min(1).max(100);

export const ingredientInputSchema = z
  .object({
    nameDe: name.optional(),
    nameEn: name.optional(),
    synonyms: z.array(name).max(20).default([]),
    categoryId: z.uuid().nullable().default(null),
    defaultUnit: unitSchema.nullable().default(null),
    densityGPerMl: z.number().positive().max(25).nullable().default(null),
    pieceWeightG: z.number().positive().max(100_000).nullable().default(null),
    icon: z.string().max(16).nullable().default(null),
  })
  .refine((v) => v.nameDe || v.nameEn, { message: "name_required" })
  .transform(({ nameDe, nameEn, ...rest }) => ({
    ...rest,
    nameDe: (nameDe ?? nameEn) as string,
    nameEn: (nameEn ?? nameDe) as string,
  }));

export type IngredientInput = z.input<typeof ingredientInputSchema>;

export const ingredientSearchSchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const parseLinesSchema = z.object({
  lines: z.array(z.string().max(500)).min(1).max(100),
});
