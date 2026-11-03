import {
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  uuid,
} from "drizzle-orm/pg-core";
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
    recipeId: uuid()
      .notNull()
      .references(() => recipe.id, { onDelete: "cascade" }),
    servings: integer().notNull(),
    position: integer().notNull(),
    plannedFor: date(),
    status: queueStatus().notNull().default("queued"),
    ...timestamps,
  },
  (t) => [index("meal_queue_household_idx").on(t.householdId, t.status)],
);
