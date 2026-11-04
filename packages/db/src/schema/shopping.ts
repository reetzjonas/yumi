import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { ingredient, ingredientCategory } from "./catalog";
import { householdId, id, timestamps } from "./common";

export const store = pgTable(
  "store",
  {
    id: id(),
    householdId: householdId(),
    name: text().notNull(),
    /** manual category order override: ingredient_category ids */
    categoryOrder: uuid().array(),
    learningResetAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("store_household_idx").on(t.householdId)],
);

export const shoppingList = pgTable(
  "shopping_list",
  {
    id: id(),
    householdId: householdId(),
    name: text().notNull(),
    defaultStoreId: uuid().references(() => store.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("shopping_list_household_idx").on(t.householdId)],
);

export type ItemSource = { kind: "recipe" | "queue" | "recurring"; id: string };

export const shoppingListItem = pgTable(
  "shopping_list_item",
  {
    id: id(),
    listId: uuid()
      .notNull()
      .references(() => shoppingList.id, { onDelete: "cascade" }),
    ingredientId: uuid().references(() => ingredient.id, {
      onDelete: "set null",
    }),
    label: text().notNull(),
    quantity: real(),
    unit: text(),
    categoryId: uuid().references(() => ingredientCategory.id, {
      onDelete: "set null",
    }),
    checked: boolean().notNull().default(false),
    sources: jsonb().$type<ItemSource[]>().notNull().default([]),
    ...timestamps,
  },
  (t) => [index("shopping_list_item_list_idx").on(t.listId)],
);

export const shoppingEventType = pgEnum("shopping_event_type", [
  "item_added",
  "item_updated",
  "item_checked",
  "item_unchecked",
  "item_removed",
]);

export const shoppingEvent = pgTable(
  "shopping_event",
  {
    /** client-generated, makes replay idempotent */
    id: uuid().primaryKey(),
    listId: uuid()
      .notNull()
      .references(() => shoppingList.id, { onDelete: "cascade" }),
    itemId: uuid().notNull(),
    type: shoppingEventType().notNull(),
    payload: jsonb(),
    userId: text().references(() => user.id, { onDelete: "set null" }),
    storeId: uuid().references(() => store.id, { onDelete: "set null" }),
    clientTs: timestamp({ withTimezone: true }).notNull(),
    serverTs: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("shopping_event_list_idx").on(t.listId, t.serverTs)],
);

export const pantryItem = pgTable(
  "pantry_item",
  {
    id: id(),
    householdId: householdId(),
    ingredientId: uuid()
      .notNull()
      .references(() => ingredient.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("pantry_item_household_ingredient_idx").on(
      t.householdId,
      t.ingredientId,
    ),
  ],
);

/** Item that reappears on a list every `intervalWeeks` weeks on `weekday` (0 = Sunday). */
export const recurringItem = pgTable(
  "recurring_item",
  {
    id: id(),
    householdId: householdId(),
    listId: uuid()
      .notNull()
      .references(() => shoppingList.id, { onDelete: "cascade" }),
    ingredientId: uuid().references(() => ingredient.id, {
      onDelete: "set null",
    }),
    label: text().notNull(),
    quantity: real(),
    unit: text(),
    categoryId: uuid().references(() => ingredientCategory.id, {
      onDelete: "set null",
    }),
    weekday: integer().notNull(),
    intervalWeeks: integer().notNull().default(1),
    nextDue: date({ mode: "string" }).notNull(),
    ...timestamps,
  },
  (t) => [index("recurring_item_list_idx").on(t.listId, t.nextDue)],
);
