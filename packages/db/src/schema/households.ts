import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { householdId, id } from "./common";

/** Shareable invite link: anyone with the token can join until it expires or runs out of uses. */
export const householdInvite = pgTable(
  "household_invite",
  {
    id: id(),
    householdId: householdId(),
    token: text().notNull().unique(),
    createdBy: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    maxUses: integer(),
    uses: integer().notNull().default(0),
    revokedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("household_invite_household_idx").on(t.householdId)],
);
