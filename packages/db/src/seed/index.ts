import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "../schema";
import { ingredient, ingredientCategory } from "../schema";
import { CATEGORY_KEYS, SEED_CATEGORIES } from "./categories";
import { SEED_INGREDIENTS } from "./ingredients";

/** Upserts the global categories and ingredients; safe to run on every start. */
export async function seedCatalog(db: PostgresJsDatabase<typeof schema>) {
  await db.transaction(async (tx) => {
    const categories = await tx
      .insert(ingredientCategory)
      .values(
        CATEGORY_KEYS.map((key, i) => ({
          key,
          nameDe: SEED_CATEGORIES[key].de,
          nameEn: SEED_CATEGORIES[key].en,
          icon: SEED_CATEGORIES[key].icon,
          defaultPosition: i * 10,
        })),
      )
      .onConflictDoUpdate({
        target: ingredientCategory.key,
        set: {
          nameDe: sql`excluded.name_de`,
          nameEn: sql`excluded.name_en`,
          icon: sql`excluded.icon`,
          defaultPosition: sql`excluded.default_position`,
        },
      })
      .returning({ id: ingredientCategory.id, key: ingredientCategory.key });
    const categoryIds = new Map(categories.map((c) => [c.key, c.id]));

    await tx
      .insert(ingredient)
      .values(
        SEED_INGREDIENTS.map((i) => ({
          key: i.key,
          nameDe: i.de,
          nameEn: i.en,
          synonyms: i.synonyms ?? [],
          categoryId: categoryIds.get(i.category),
          defaultUnit: i.unit,
          densityGPerMl: i.densityGPerMl ?? null,
          pieceWeightG: i.pieceWeightG ?? null,
          packSizes: (i.packs ?? []).map(([quantity, unit]) => ({
            quantity,
            unit,
          })),
          icon: i.icon ?? null,
        })),
      )
      .onConflictDoUpdate({
        target: ingredient.key,
        set: {
          nameDe: sql`excluded.name_de`,
          nameEn: sql`excluded.name_en`,
          synonyms: sql`excluded.synonyms`,
          categoryId: sql`excluded.category_id`,
          defaultUnit: sql`excluded.default_unit`,
          densityGPerMl: sql`excluded.density_g_per_ml`,
          pieceWeightG: sql`excluded.piece_weight_g`,
          packSizes: sql`excluded.pack_sizes`,
          icon: sql`excluded.icon`,
          updatedAt: sql`now()`,
        },
      });
  });
  return {
    categories: CATEGORY_KEYS.length,
    ingredients: SEED_INGREDIENTS.length,
  };
}
