import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/api-error";
import { getLocale } from "@/lib/i18n";
import { addQueueEntry, queueKey } from "@/lib/queue";
import { formatMinutes, totalMinutes } from "@/lib/recipes";
import { useMe } from "@/lib/session";
import { m } from "@/paraglide/messages";

const reasonLabel = (reason: "leftovers" | "neglected" | "quick" | "ai") =>
  reason === "leftovers"
    ? m["queue.filter_leftovers"]()
    : reason === "neglected"
      ? m["recipes.suggestions_neglected"]()
      : reason === "quick"
        ? m["recipes.suggestions_quick"]()
        : null;

/** A few meals for the coming days, picked by the AI or by rules; accept with one tap. */
export function WeekSuggestion({ onAdded }: { onAdded: () => void }) {
  const householdId = useMe()?.activeHouseholdId;
  const queryClient = useQueryClient();
  const [excluded, setExcluded] = useState<string[]>([]);
  const suggestion = useQuery({
    queryKey: ["queue", householdId, "week-suggestion"],
    enabled: Boolean(householdId),
    staleTime: 0,
    gcTime: 0,
    queryFn: async () =>
      (
        await ensureOk(
          await api.queue["week-suggestion"].$get({
            query: { locale: getLocale() },
          }),
        )
      ).json(),
  });
  const meals = suggestion.data?.meals ?? [];
  const selected = meals.filter((meal) => !excluded.includes(meal.id));
  const add = useMutation({
    mutationFn: async () => {
      // One after the other keeps the suggested order in the plan.
      for (const meal of selected)
        await addQueueEntry({
          recipeId: meal.id,
          servings: meal.servings,
          plannedFor: null,
        });
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queueKey(householdId) }),
    onSuccess: onAdded,
  });
  if (suggestion.isPending) return <Skeleton className="h-48 w-full" />;
  if (suggestion.isError)
    return (
      <p className="form-error" role="alert">
        {errorMessage(suggestion.error)}
      </p>
    );
  if (!meals.length)
    return <p className="row-detail">{m["queue.week_empty"]()}</p>;
  return (
    <div className="recipe-picker">
      <p className="meta">
        {suggestion.data.method === "ai"
          ? m["queue.week_hint_ai"]()
          : m["queue.week_hint"]()}
      </p>
      <fieldset className="picker-list" disabled={add.isPending}>
        <legend className="sr-only">{m["queue.week_tab"]()}</legend>
        {meals.map((meal) => (
          <label key={meal.id} className="picker-row">
            <input
              className="picker-input"
              type="checkbox"
              checked={!excluded.includes(meal.id)}
              onChange={(event) =>
                setExcluded((current) =>
                  event.target.checked
                    ? current.filter((id) => id !== meal.id)
                    : [...current, meal.id],
                )
              }
            />
            <span className="picker-row-main">
              <span className="picker-row-title">{meal.title}</span>
              <span className="meta">
                {[
                  totalMinutes(meal) > 0 && formatMinutes(totalMinutes(meal)),
                  meal.reasonText ?? reasonLabel(meal.reason),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="recipe-actions">
        <Button
          type="button"
          disabled={add.isPending || selected.length === 0}
          onClick={() => add.mutate()}
        >
          {selected.length === 1
            ? m["queue.week_add_one"]()
            : m["queue.week_add"]({ count: selected.length })}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={add.isPending || suggestion.isFetching}
          onClick={() => {
            setExcluded([]);
            void suggestion.refetch();
          }}
        >
          {m["queue.week_again"]()}
        </Button>
      </div>
      {add.isError && (
        <p className="form-error" role="alert">
          {errorMessage(add.error)}
        </p>
      )}
    </div>
  );
}
