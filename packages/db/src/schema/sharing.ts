import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id } from "./common";
import { recipe } from "./recipes";

export const shareLink = pgTable(
  "share_link",
  {
    id: id(),
    recipeId: uuid()
      .notNull()
      .references(() => recipe.id, { onDelete: "cascade" }),
    token: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("share_link_recipe_idx").on(t.recipeId)],
);
