import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/api-error";
import {
  formatMinutes,
  lastCookedLabel,
  type RecipeSuggestion,
  recipeImageUrl,
  totalMinutes,
} from "@/lib/recipes";
import { useMe } from "@/lib/session";
import { m } from "@/paraglide/messages";

export function RecipeLibrary() {
  const householdId = useMe()?.activeHouseholdId;
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [suggestion, setSuggestion] = useState<RecipeSuggestion | "">("");
  useEffect(() => {
    const timer = setTimeout(() => setQ(search), 200);
    return () => clearTimeout(timer);
  }, [search]);
  const recipes = useQuery({
    queryKey: ["recipes", householdId, "list", q, tag, suggestion],
    queryFn: async () =>
      (
        await ensureOk(
          await api.recipes.$get({
            query: { q, tag, suggestion: suggestion || undefined },
          }),
        )
      ).json(),
  });
  const tags = useQuery({
    queryKey: ["recipes", householdId, "tags"],
    queryFn: async () => (await ensureOk(await api.recipes.tags.$get())).json(),
  });
  return (
    <div className="recipe-library">
      <div className="recipe-filters">
        <label className="field">
          <span>{m["recipes.search"]()}</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="field">
          <span>{m["recipes.suggestions"]()}</span>
          <select
            value={suggestion}
            onChange={(event) => {
              const value = event.target.value;
              if (
                value === "" ||
                value === "neglected" ||
                value === "favorites" ||
                value === "quick"
              )
                setSuggestion(value);
            }}
            aria-describedby={suggestion ? "recipe-suggestion-hint" : undefined}
          >
            <option value="">{m["recipes.suggestions_all"]()}</option>
            <option value="neglected">
              {m["recipes.suggestions_neglected"]()}
            </option>
            <option value="favorites">
              {m["recipes.suggestions_favorites"]()}
            </option>
            <option value="quick">{m["recipes.suggestions_quick"]()}</option>
          </select>
          {suggestion && (
            <span id="recipe-suggestion-hint" className="row-detail">
              {suggestion === "neglected"
                ? m["recipes.suggestions_neglected_hint"]()
                : suggestion === "favorites"
                  ? m["recipes.suggestions_favorites_hint"]()
                  : m["recipes.suggestions_quick_hint"]()}
            </span>
          )}
        </label>
        <fieldset
          className="recipe-actions recipe-tags"
          aria-label={m["recipes.filter_tags"]()}
        >
          <Button
            variant="ghost"
            aria-pressed={!tag}
            onClick={() => setTag("")}
          >
            {m["recipes.all_tags"]()}
          </Button>
          {tags.data?.map((value) => (
            <Button
              key={value}
              variant="ghost"
              aria-pressed={tag === value}
              onClick={() => setTag(value)}
            >
              {value}
            </Button>
          ))}
        </fieldset>
      </div>
      {recipes.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : recipes.isError ? (
        <p role="alert" className="form-error">
          {errorMessage(recipes.error)}
        </p>
      ) : recipes.data.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={
            q || tag || suggestion
              ? m["recipes.no_results_title"]()
              : m["recipes.empty_title"]()
          }
          description={
            q || tag || suggestion
              ? m["recipes.no_results_description"]()
              : m["recipes.empty_description"]()
          }
        />
      ) : (
        <ul className="recipe-grid">
          {recipes.data.map((recipe) => (
            <li key={recipe.id}>
              <Link
                className="recipe-card"
                to="/recipes/$id"
                params={{ id: recipe.id }}
                activeProps={{ className: "is-active", "aria-current": "page" }}
              >
                {recipe.imageKey && (
                  <img
                    src={recipeImageUrl(recipe.id, recipe.imageKey, "thumb")}
                    alt=""
                    loading="lazy"
                    width={400}
                    height={250}
                  />
                )}
                <div className="recipe-card-content">
                  <h2>{recipe.title}</h2>
                  <p className="row-detail">
                    {[
                      totalMinutes(recipe) > 0 &&
                        formatMinutes(totalMinutes(recipe)),
                      lastCookedLabel(recipe.lastCookedAt),
                      recipe.myRating !== null &&
                        m["recipes.rating_value"]({ stars: recipe.myRating }),
                      ...recipe.tags,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
