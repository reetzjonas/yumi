import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { id } from "./common";

/** A browser's Web Push subscription; one row per device of a user. */
export const pushSubscription = pgTable(
  "push_subscription",
  {
    id: id(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    endpoint: text().notNull().unique(),
    p256dh: text().notNull(),
    auth: text().notNull(),
    /** UI language of the device, used for the notification text. */
    locale: text().notNull().default("de"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("push_subscription_user_idx").on(t.userId)],
);
