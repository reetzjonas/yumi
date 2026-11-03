import { z } from "zod";

export const storeInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  categoryOrder: z
    .array(z.uuid())
    .max(100)
    .default([])
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "duplicate_category",
    }),
});

export const listStoreInputSchema = z.object({
  storeId: z.uuid().nullable(),
});

/** Categories listed in a store's order come first, the rest follow by default position. */
export function orderCategories<
  T extends { id: string; defaultPosition: number },
>(categories: readonly T[], order: readonly string[] | null | undefined): T[] {
  const rank = new Map((order ?? []).map((id, index) => [id, index]));
  const rankOf = (id: string) => rank.get(id) ?? Number.POSITIVE_INFINITY;
  return [...categories].sort((a, b) =>
    rankOf(a.id) === rankOf(b.id)
      ? a.defaultPosition - b.defaultPosition
      : rankOf(a.id) - rankOf(b.id),
  );
}
