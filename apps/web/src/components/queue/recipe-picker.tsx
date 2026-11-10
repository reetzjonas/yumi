import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { AddRecipeToQueue } from "@/components/queue/add-recipe";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/api-error";
import { useLeftoverSuggestions } from "@/lib/leftovers";
import { cookedAgoLabel, formatMinutes, totalMinutes } from "@/lib/recipes";
import { useMe } from "@/lib/session";
import { m } from "@/paraglide/messages";

type PickedRecipe = { id: string; servings: number };

const filters = ["", "leftovers", "neglected", "quick", "favorites"] as const;
type Filter = (typeof filters)[number];
const filterLabel = (filter: Filter) =>
  filter === "leftovers"
    ? m["queue.filter_leftovers"]()
    : filter === "neglected"
      ? m["recipes.suggestions_neglected"]()
      : filter === "quick"
        ? m["recipes.suggestions_quick"]()
        : filter === "favorites"
          ? m["recipes.suggestions_favorites"]()
          : m["recipes.suggestions_all"]();

export function RecipePicker({
  renderPicked = (recipe) => (
    <AddRecipeToQueue
      key={recipe.id}
      recipeId={recipe.id}
      servings={recipe.servings}
    />
  ),
  suggestions = false,
}: {
  renderPicked?: (recipe: PickedRecipe) => ReactNode;
  /** Offer suggestion filters (leftovers, neglected, quick, favorites). */
  suggestions?: boolean;
}) {
  const householdId = useMe()?.activeHouseholdId;
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("");
  const leftovers = useLeftoverSuggestions(true);
  const suggestion = filter === "leftovers" ? "" : filter;
  useEffect(() => {
    const timer = setTimeout(() => setQ(search), 200);
    return () => clearTimeout(timer);
  }, [search]);
  const recipes = useQuery({
    queryKey: ["recipes", householdId, "list", q, "", suggestion],
    queryFn: async () =>
      (
        await ensureOk(
          await api.recipes.$get({
            query: { q, tag: "", suggestion: suggestion || undefined },
          }),
        )
      ).json(),
  });
  const leftoverRank = new Map(
    (leftovers.data ?? []).map((recipe, index) => [recipe.id, index]),
  );
  const shown =
    filter === "leftovers"
      ? recipes.data
          ?.filter((recipe) => leftoverRank.has(recipe.id))
          .sort(
            (a, b) =>
              (leftoverRank.get(a.id) ?? 0) - (leftoverRank.get(b.id) ?? 0),
          )
      : recipes.data;
  const picked = recipes.data?.find((recipe) => recipe.id === pickedId);
  return (
    <div className="recipe-picker">
      <label className="recipe-search">
        <Search aria-hidden="true" size={20} strokeWidth={1.8} />
        <input
          type="search"
          value={search}
          placeholder={m["recipes.search_placeholder"]()}
          aria-label={m["recipes.search"]()}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      {suggestions && (
        <fieldset className="recipe-tags" aria-label={m["queue.suggestions"]()}>
          {filters.map((value) => (
            <button
              key={value}
              type="button"
              className="chip"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {filterLabel(value)}
            </button>
          ))}
        </fieldset>
      )}
      {recipes.isError ? (
        <p role="alert" className="form-error">
          {errorMessage(recipes.error)}
        </p>
      ) : (
        <fieldset className="picker-list">
          <legend className="sr-only">{m["queue.pick_recipe"]()}</legend>
          {shown?.length === 0 && (
            <p className="row-detail">
              {filter === "leftovers"
                ? m["leftovers.no_suggestions"]()
                : m["recipes.no_results_title"]()}
            </p>
          )}
          {shown?.map((recipe) => (
            <label key={recipe.id} className="picker-row">
              <input
                className="picker-input"
                type="radio"
                name="picked-recipe"
                checked={recipe.id === pickedId}
                onChange={() => setPickedId(recipe.id)}
              />
              <span className="picker-row-main">
                <span className="picker-row-title">{recipe.title}</span>
                <span className="meta">
                  {[
                    totalMinutes(recipe) > 0 &&
                      formatMinutes(totalMinutes(recipe)),
                    cookedAgoLabel(recipe.lastCookedAt),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {picked && renderPicked(picked)}
    </div>
  );
}
