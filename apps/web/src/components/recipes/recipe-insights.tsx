import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, Star } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/api-error";
import { formatDate } from "@/lib/i18n";
import { cookedAgoLabel, type RecipeDetail } from "@/lib/recipes";
import { useMe } from "@/lib/session";
import { m } from "@/paraglide/messages";

export function RecipeInsights({ recipe }: { recipe: RecipeDetail }) {
  const householdId = useMe()?.activeHouseholdId;
  const queryClient = useQueryClient();
  const sheet = useRef<HTMLDialogElement>(null);
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
  const markCooked = useMutation({
    mutationFn: async () =>
      ensureOk(
        await api.recipes[":id"].cooked.$post({
          param: { id: recipe.id },
          json: { requestId: crypto.randomUUID() },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recipes"] }),
  });
  const cooked = cookedAgoLabel(recipe.lastCookedAt);
  const count = history.data?.length ?? 0;
  return (
    <>
      <button
        type="button"
        className="recipe-history"
        aria-haspopup="dialog"
        onClick={() => sheet.current?.showModal()}
      >
        {recipe.myRating === null ? (
          <span className="meta">{m["recipes.rating_none"]()}</span>
        ) : (
          <span
            className="recipe-stars"
            role="img"
            aria-label={m["recipes.rating_value"]({ stars: recipe.myRating })}
          >
            {[1, 2, 3, 4, 5].map((stars) => (
              <Star
                key={stars}
                size={16}
                aria-hidden="true"
                fill={
                  recipe.myRating !== null && recipe.myRating >= stars
                    ? "currentColor"
                    : "none"
                }
              />
            ))}
          </span>
        )}
        <span className="recipe-history-label">
          {count > 0
            ? m["recipes.cooked_times"]({ label: cooked, count })
            : cooked}
        </span>
        <ChevronRight aria-hidden="true" size={20} />
      </button>
      <Sheet
        ref={sheet}
        title={m["recipes.history_title"]()}
        meta={recipe.title}
      >
        <fieldset className="recipe-rating">
          <legend>{m["recipes.my_rating"]()}</legend>
          <div className="recipe-rating-stars">
            {[1, 2, 3, 4, 5].map((stars) => (
              <Button
                key={stars}
                type="button"
                variant="ghost"
                className={
                  (recipe.myRating ?? 0) >= stars
                    ? "recipe-rating-star is-filled"
                    : "recipe-rating-star"
                }
                disabled={rating.isPending}
                aria-label={m["recipes.rate_stars"]({ stars })}
                aria-pressed={recipe.myRating === stars}
                onClick={() => rating.mutate(stars)}
              >
                <Star
                  size={24}
                  aria-hidden="true"
                  fill={
                    (recipe.myRating ?? 0) >= stars ? "currentColor" : "none"
                  }
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
          <p className="meta" role="status">
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
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={markCooked.isPending}
          onClick={() => markCooked.mutate()}
        >
          <Check size={20} aria-hidden="true" />
          {m["recipes.cooked_today"]()}
        </Button>
        {markCooked.isError && (
          <p role="alert" className="form-error">
            {errorMessage(markCooked.error)}
          </p>
        )}
        <section className="recipe-history-list">
          <h3 className="overline">
            {count > 0 ? m["recipes.cooked_count"]({ count }) : cooked}
          </h3>
          {history.isPending ? (
            <p role="status">{m["recipes.history_loading"]()}</p>
          ) : history.isError ? (
            <p role="alert" className="form-error">
              {errorMessage(history.error)}
            </p>
          ) : (
            history.data.length > 0 && (
              <ul>
                {history.data.map((entry) => (
                  <li key={entry.id} className="recipe-history-entry">
                    <span className="recipe-history-date">
                      {formatDate(new Date(entry.cookedAt), {
                        dateStyle: "medium",
                      })}
                    </span>
                    <span className="meta">
                      {entry.cookedBy ?? m["recipes.history_unknown_actor"]()}
                    </span>
                  </li>
                ))}
              </ul>
            )
          )}
        </section>
      </Sheet>
    </>
  );
}
