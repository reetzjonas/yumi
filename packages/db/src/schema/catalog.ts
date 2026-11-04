import type { NutritionValues } from "@yumi/shared";
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { id, timestamps } from "./common";

export const ingredientCategory = pgTable("ingredient_category", {
  id: id(),
  key: text().notNull().unique(),
  nameDe: text().notNull(),
  nameEn: text().notNull(),
  icon: text(),
  defaultPosition: integer().notNull().default(0),
});

export type PackSize = { quantity: number; unit: string };

export const ingredient = pgTable(
  "ingredient",
  {
    id: id(),
    /** null = global seed entry, set = household-specific entry */
    householdId: text().references(() => organization.id, {
      onDelete: "cascade",
    }),
    /** stable slug of global seed entries, used to upsert the catalog */
    key: text().unique(),
    nameDe: text().notNull(),
    nameEn: text().notNull(),
    synonyms: text().array().notNull().default(sql`'{}'::text[]`),
    categoryId: uuid().references(() => ingredientCategory.id, {
      onDelete: "set null",
    }),
    defaultUnit: text(),
    densityGPerMl: real(),
    pieceWeightG: real(),
    nutritionPer100g: jsonb().$type<NutritionValues>(),
    nutritionSource: text(),
    packSizes: jsonb().$type<PackSize[]>().notNull().default([]),
    icon: text(),
    ...timestamps,
  },
  (t) => [
    index("ingredient_household_idx").on(t.householdId),
    index("ingredient_name_de_trgm_idx").using(
      "gin",
      sql`${t.nameDe} gin_trgm_ops`,
    ),
    index("ingredient_name_en_trgm_idx").using(
      "gin",
      sql`${t.nameEn} gin_trgm_ops`,
    ),
  ],
);
