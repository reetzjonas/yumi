import { text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organization } from "./auth";

export const id = () => uuid().primaryKey().defaultRandom();

export const householdId = () =>
  text()
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" });

export const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
