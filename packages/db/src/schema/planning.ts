import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { ingredient } from "./catalog";
import { householdId, id, timestamps } from "./common";
import { recipe } from "./recipes";

export const queueStatus = pgEnum("queue_status", [
  "queued",
  "cooked",
  "skipped",
]);

export const mealQueueEntry = pgTable(
  "meal_queue_entry",
  {
    id: id(),
    householdId: householdId(),
    recipeId: uuid().references(() => recipe.id, { onDelete: "cascade" }),
    title: text(),
    note: text(),
    servings: integer().notNull(),
    position: integer().notNull(),
    plannedFor: date(),
    status: queueStatus().notNull().default("queued"),
    ...timestamps,
  },
  (t) => [
    index("meal_queue_household_idx").on(t.householdId, t.status),
    index("meal_queue_recipe_idx").on(t.recipeId),
    check(
      "meal_queue_meal_identity",
      sql`(${t.recipeId} IS NOT NULL AND ${t.title} IS NULL) OR
        (${t.recipeId} IS NULL AND ${t.title} IS NOT NULL AND length(btrim(${t.title})) BETWEEN 1 AND 200)`,
    ),
  ],
);

export const leftover = pgTable(
  "leftover",
  {
    id: id(),
    householdId: householdId(),
    ingredientId: uuid()
      .notNull()
      .references(() => ingredient.id, { onDelete: "cascade" }),
    quantity: real().notNull(),
    unit: text().notNull(),
    sourceEntryIds: uuid().array().notNull().default([]),
    ...timestamps,
  },
  (t) => [index("leftover_household_idx").on(t.householdId)],
);
