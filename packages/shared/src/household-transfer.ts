import { z } from "zod";
import { householdTransferDataSchema } from "./household-transfer/format";
import { validateHouseholdTransfer } from "./household-transfer/validation";

export * from "./household-transfer/limits";

export const householdTransferSchema = householdTransferDataSchema.superRefine(
  validateHouseholdTransfer,
);

export type HouseholdTransfer = z.infer<typeof householdTransferSchema>;

export const householdImportResultSchema = z.strictObject({
  imported: z.strictObject({
    recipes: z.number().int().nonnegative(),
    ingredients: z.number().int().nonnegative(),
    lists: z.number().int().nonnegative(),
    items: z.number().int().nonnegative(),
    queue: z.number().int().nonnegative(),
    stores: z.number().int().nonnegative(),
    pantry: z.number().int().nonnegative(),
    recurring: z.number().int().nonnegative(),
    leftovers: z.number().int().nonnegative(),
    cookLogs: z.number().int().nonnegative(),
  }),
});

export type HouseholdImportResult = z.infer<typeof householdImportResultSchema>;
