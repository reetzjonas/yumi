import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { ingredient } from "./catalog";
import { bytea, householdId, id, timestamps } from "./common";

export const recipe = pgTable(
  "recipe",
  {
    id: id(),
    householdId: householdId(),
    title: text().notNull(),
    description: text(),
    servings: integer().notNull().default(2),
    prepMinutes: integer(),
    cookMinutes: integer(),
    sourceUrl: text(),
    imageKey: text(),
    language: text(),
    tags: text().array().notNull().default(sql`'{}'::text[]`),
    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("recipe_household_idx").on(t.householdId)],
);

/** Resized WebP variants of a recipe's photo, stored in PostgreSQL (ADR 0011). */
export const recipeImage = pgTable("recipe_image", {
  id: id(),
  recipeId: uuid()
    .notNull()
    .unique()
    .references(() => recipe.id, { onDelete: "cascade" }),
  thumb: bytea().notNull(),
  full: bytea().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const recipeIngredient = pgTable(
  "recipe_ingredient",
  {
    id: id(),
    recipeId: uuid()
      .notNull()
      .references(() => recipe.id, { onDelete: "cascade" }),
    section: text(),
    position: integer().notNull(),
    ingredientId: uuid().references(() => ingredient.id, {
      onDelete: "set null",
    }),
    rawText: text().notNull(),
    quantity: real(),
    unit: text(),
    note: text(),
    optional: boolean().notNull().default(false),
    excludeFromNutrition: boolean().notNull().default(false),
  },
  (t) => [index("recipe_ingredient_recipe_idx").on(t.recipeId)],
);

export type StepTimer = { seconds: number; label: string };

export const recipeStep = pgTable(
  "recipe_step",
  {
    id: id(),
    recipeId: uuid()
      .notNull()
      .references(() => recipe.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    text: text().notNull(),
    ingredientRefs: uuid().array().notNull().default(sql`'{}'::uuid[]`),
    ingredientRefsManual: boolean().notNull().default(false),
    timers: jsonb().$type<StepTimer[]>().notNull().default([]),
  },
  (t) => [index("recipe_step_recipe_idx").on(t.recipeId)],
);

export const recipeRating = pgTable(
  "recipe_rating",
  {
    recipeId: uuid()
      .notNull()
      .references(() => recipe.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    stars: smallint().notNull(),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.recipeId, t.userId] })],
);

export const cookLog = pgTable(
  "cook_log",
  {
    id: id(),
    householdId: householdId(),
    recipeId: uuid()
      .notNull()
      .references(() => recipe.id, { onDelete: "cascade" }),
    userId: text().references(() => user.id, { onDelete: "set null" }),
    cookedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("cook_log_recipe_idx").on(t.recipeId)],
);
