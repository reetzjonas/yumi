import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/api-error";
import { formatDate } from "@/lib/i18n";
import { lastCookedLabel, type RecipeDetail } from "@/lib/recipes";
import { useMe } from "@/lib/session";
import { m } from "@/paraglide/messages";

export function RecipeInsights({ recipe }: { recipe: RecipeDetail }) {
  const householdId = useMe()?.activeHouseholdId;
  const queryClient = useQueryClient();
  const rating = useMutation({
    mutationFn: async (stars: number | null) =>
      ensureOk(
        await api.recipes[":id"].rating.$put({
          param: { id: recipe.id },
          json: { stars },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recipes"] }),
  });
  const history = useQuery({
    queryKey: ["recipes", householdId, "history", recipe.id],
    queryFn: async () =>
      (
        await ensureOk(
          await api.recipes[":id"].history.$get({
            param: { id: recipe.id },
          }),
        )
      ).json(),
  });
  return (
    <section className="recipe-section">
      <fieldset className="grid gap-2 border-0 p-0">
        <legend>{m["recipes.my_rating"]()}</legend>
        <div className="recipe-actions">
          {[1, 2, 3, 4, 5].map((stars) => (
            <Button
              key={stars}
              type="button"
              variant="ghost"
              className="recipe-rating-star"
              disabled={rating.isPending}
              aria-label={m["recipes.rate_stars"]({ stars })}
              aria-pressed={recipe.myRating === stars}
              onClick={() => rating.mutate(stars)}
            >
              <Star
                size={22}
                aria-hidden="true"
                fill={(recipe.myRating ?? 0) >= stars ? "currentColor" : "none"}
              />
            </Button>
          ))}
          {recipe.myRating !== null && (
            <Button
              type="button"
              variant="ghost"
              disabled={rating.isPending}
              onClick={() => rating.mutate(null)}
            >
              {m["recipes.rating_clear"]()}
            </Button>
          )}
        </div>
        <p className="row-detail" role="status">
          {recipe.myRating === null
            ? m["recipes.rating_none"]()
            : m["recipes.rating_value"]({ stars: recipe.myRating })}
        </p>
        {rating.isError && (
          <p role="alert" className="form-error">
            {errorMessage(rating.error)}
          </p>
        )}
      </fieldset>
      <details>
        <summary>{lastCookedLabel(recipe.lastCookedAt)}</summary>
        <p className="row-detail">{m["recipes.history_hint"]()}</p>
        {history.isPending ? (
          <p role="status">{m["recipes.history_loading"]()}</p>
        ) : history.isError ? (
          <p role="alert" className="form-error">
            {errorMessage(history.error)}
          </p>
        ) : history.data.length === 0 ? (
          <p>{m["recipes.never_cooked"]()}</p>
        ) : (
          <ul>
            {history.data.map((entry) => (
              <li key={entry.id}>
                {m["recipes.history_entry"]({
                  date: formatDate(new Date(entry.cookedAt), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }),
                  name: entry.cookedBy ?? m["recipes.history_unknown_actor"](),
                })}
              </li>
            ))}
          </ul>
        )}
      </details>
    </section>
  );
}
