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

/**
 * Pictogram that illustrates a recipe without a photo: the icon of its first
 * ingredient that has one (the ingredient's own icon, else its category's).
 */
export function recipeIcon() {
  const recipeId = sql`${recipe}.${sql.identifier("id")}`;
  // Aliased by hand: Drizzle drops table qualifiers inside single-table selects.
  return sql<string | null>`(
    select coalesce(i.icon, c.icon)
    from recipe_ingredient ri
    inner join ingredient i on i.id = ri.ingredient_id
    left join ingredient_category c on c.id = i.category_id
    where ri.recipe_id = ${recipeId}
      and coalesce(i.icon, c.icon) is not null
    order by ri.position
    limit 1
  )`;
}
