import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { AddRecipeToQueue } from "@/components/queue/add-recipe";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/api-error";
import { cookedAgoLabel, formatMinutes, totalMinutes } from "@/lib/recipes";
import { useMe } from "@/lib/session";
import { m } from "@/paraglide/messages";

export function RecipePicker() {
  const householdId = useMe()?.activeHouseholdId;
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setQ(search), 200);
    return () => clearTimeout(timer);
  }, [search]);
  const recipes = useQuery({
    queryKey: ["recipes", householdId, "list", q, "", ""],
    queryFn: async () =>
      (
        await ensureOk(await api.recipes.$get({ query: { q, tag: "" } }))
      ).json(),
  });
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
      {recipes.isError ? (
        <p role="alert" className="form-error">
          {errorMessage(recipes.error)}
        </p>
      ) : (
        <fieldset className="picker-list">
          <legend className="sr-only">{m["queue.pick_recipe"]()}</legend>
          {recipes.data?.map((recipe) => (
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
      {picked && (
        <AddRecipeToQueue
          key={picked.id}
          recipeId={picked.id}
          servings={picked.servings}
        />
      )}
    </div>
  );
}
