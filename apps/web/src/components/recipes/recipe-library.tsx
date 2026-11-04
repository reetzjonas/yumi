import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BookOpen, Download, Plus, Search, Star } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { EmptyState } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/api-error";
import {
  cookedAgoLabel,
  formatMinutes,
  type RecipeSuggestion,
  recipeImageUrl,
  totalMinutes,
} from "@/lib/recipes";
import { useMe } from "@/lib/session";
import { m } from "@/paraglide/messages";

const modes = ["", "neglected", "favorites", "quick"] as const;
type Mode = (typeof modes)[number];

const modeLabel = (mode: Mode) =>
  mode === "neglected"
    ? m["recipes.suggestions_neglected"]()
    : mode === "favorites"
      ? m["recipes.suggestions_favorites"]()
      : mode === "quick"
        ? m["recipes.suggestions_quick"]()
        : m["recipes.suggestions_all"]();

const modeHint = (mode: RecipeSuggestion) =>
  mode === "neglected"
    ? m["recipes.suggestions_neglected_hint"]()
    : mode === "favorites"
      ? m["recipes.suggestions_favorites_hint"]()
      : m["recipes.suggestions_quick_hint"]();

export function RecipeLibrary({ actions }: { actions?: ReactNode }) {
  const householdId = useMe()?.activeHouseholdId;
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [mode, setMode] = useState<Mode>("");
  useEffect(() => {
    const timer = setTimeout(() => setQ(search), 200);
    return () => clearTimeout(timer);
  }, [search]);
  const recipes = useQuery({
    queryKey: ["recipes", householdId, "list", q, tag, mode],
    queryFn: async () =>
      (
        await ensureOk(
          await api.recipes.$get({
            query: { q, tag, suggestion: mode || undefined },
          }),
        )
      ).json(),
  });
  const tags = useQuery({
    queryKey: ["recipes", householdId, "tags"],
    queryFn: async () => (await ensureOk(await api.recipes.tags.$get())).json(),
  });
  const filtered = Boolean(q || tag || mode);
  const firstRun = recipes.data?.length === 0 && !filtered && !search;

  if (firstRun) {
    return (
      <EmptyState
        icon={BookOpen}
        title={m["recipes.empty_title"]()}
        description={m["recipes.empty_description"]()}
      >
        <div className="recipe-library-actions">
          <Button asChild>
            <Link to="/recipes/new">
              <Plus aria-hidden="true" size={20} />
              {m["recipes.new"]()}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/recipes/import">
              <Download aria-hidden="true" size={20} />
              {m["recipes.import"]()}
            </Link>
          </Button>
        </div>
      </EmptyState>
    );
  }

  return (
    <div className="recipe-library">
      <label className="recipe-search">
        <Search aria-hidden="true" size={20} strokeWidth={1.8} />
        <input
          type="search"
          value={search}
          placeholder={m["recipes.search_placeholder"]()}
          aria-label={m["recipes.search"]()}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {actions && <div className="recipe-library-actions">{actions}</div>}
      <fieldset className="recipe-tags" aria-label={m["recipes.filter_tags"]()}>
        <button
          type="button"
          className="chip"
          aria-pressed={!tag}
          onClick={() => setTag("")}
        >
          {m["recipes.all_tags"]()}
        </button>
        {tags.data?.map((value) => (
          <button
            key={value}
            type="button"
            className="chip"
            aria-pressed={tag === value}
            onClick={() => setTag(value)}
          >
            {value}
          </button>
        ))}
      </fieldset>
      <div className="recipe-count-row">
        <span className="meta" aria-live="polite">
          {recipes.data &&
            (recipes.data.length === 1
              ? m["recipes.count_one"]()
              : m["recipes.count"]({ count: recipes.data.length }))}
        </span>
        <Button
          variant="ghost"
          className="recipe-mode"
          aria-describedby={mode ? "recipe-mode-hint" : undefined}
          onClick={() =>
            setMode(modes[(modes.indexOf(mode) + 1) % modes.length] ?? "")
          }
        >
          {m["recipes.show_mode"]({ mode: modeLabel(mode) })}
        </Button>
      </div>
      {mode && (
        <p id="recipe-mode-hint" className="meta">
          {modeHint(mode)}
        </p>
      )}
      {recipes.isPending ? (
        <div className="recipe-grid">
          <Skeleton className="recipe-card-skeleton" />
          <Skeleton className="recipe-card-skeleton" />
        </div>
      ) : recipes.isError ? (
        <p role="alert" className="form-error">
          {errorMessage(recipes.error)}
        </p>
      ) : recipes.data.length === 0 ? (
        <EmptyState
          icon={Search}
          title={m["recipes.no_results_title"]()}
          description={m["recipes.no_results_description"]()}
        >
          <Button
            variant="outline"
            onClick={() => {
              setSearch("");
              setTag("");
              setMode("");
            }}
          >
            {m["recipes.reset_filters"]()}
          </Button>
        </EmptyState>
      ) : (
        <ul className="recipe-grid">
          {recipes.data.map((recipe) => (
            <li key={recipe.id}>
              <Link
                className="recipe-card"
                to="/recipes/$id"
                params={{ id: recipe.id }}
              >
                {recipe.imageKey ? (
                  <img
                    className="recipe-card-media"
                    src={recipeImageUrl(recipe.id, recipe.imageKey, "thumb")}
                    alt=""
                    loading="lazy"
                    width={400}
                    height={250}
                  />
                ) : (
                  <span className="recipe-card-media is-empty" />
                )}
                <span className="recipe-card-content">
                  <span className="recipe-card-title">{recipe.title}</span>
                  {(totalMinutes(recipe) > 0 || recipe.myRating !== null) && (
                    <span className="recipe-card-meta">
                      {totalMinutes(recipe) > 0 &&
                        formatMinutes(totalMinutes(recipe))}
                      {totalMinutes(recipe) > 0 &&
                        recipe.myRating !== null &&
                        " · "}
                      {recipe.myRating !== null && (
                        <span
                          className="recipe-card-rating"
                          role="img"
                          aria-label={m["recipes.rating_value"]({
                            stars: recipe.myRating,
                          })}
                        >
                          <Star aria-hidden="true" size={12} />
                          {recipe.myRating}
                        </span>
                      )}
                    </span>
                  )}
                  <span className="recipe-card-meta">
                    {cookedAgoLabel(recipe.lastCookedAt)}
                  </span>
                  {recipe.tags[0] && (
                    <span className="badge badge-muted">{recipe.tags[0]}</span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
