import { cookLog, recipe, recipeRating } from "@yumi/db/schema";
import { sql } from "drizzle-orm";

export function recipeInsights(householdId: string, userId: string) {
  // Keep the outer ID qualified inside subqueries when Drizzle selects one table.
  const recipeId = sql`${recipe}.${sql.identifier("id")}`;
  return {
    myRating: sql<number | null>`(
      select ${recipeRating.stars} from ${recipeRating}
      where ${recipeRating.recipeId} = ${recipeId}
        and ${recipeRating.userId} = ${userId}
    )`,
    lastCookedAt: sql<Date | null>`(
      select max(${cookLog.cookedAt}) from ${cookLog}
      where ${cookLog.recipeId} = ${recipeId}
        and ${cookLog.householdId} = ${householdId}
    )`.mapWith({
      mapFromDriverValue: (value: string | null) =>
        value === null ? null : new Date(value),
    }),
  };
}
