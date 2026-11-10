import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BookOpen, Download, Plus, Search, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState, PageHeader } from "@/components/page";
import { RecipeArt } from "@/components/recipes/recipe-art";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/api-error";
import {
  cookedAgoLabel,
  formatMinutes,
  type RecipeSuggestion,
  totalMinutes,
} from "@/lib/recipes";
import { useMe } from "@/lib/session";
import { m } from "@/paraglide/messages";

const modes = ["neglected", "quick", "favorites"] as const;
type Mode = (typeof modes)[number] | "";

const modeLabel = (mode: RecipeSuggestion) =>
  mode === "neglected"
    ? m["recipes.mode_neglected"]()
    : mode === "favorites"
      ? m["recipes.mode_favorites"]()
      : m["recipes.mode_quick"]();

const modeHint = (mode: RecipeSuggestion) =>
  mode === "neglected"
    ? m["recipes.suggestions_neglected_hint"]()
    : mode === "favorites"
      ? m["recipes.suggestions_favorites_hint"]()
      : m["recipes.suggestions_quick_hint"]();

export function RecipeLibrary() {
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
  const importAction = (
    <Button asChild variant="ghost">
      <Link to="/recipes/import" aria-label={m["recipes.import"]()}>
        <Download aria-hidden="true" size={22} />
      </Link>
    </Button>
  );

  if (firstRun) {
    return (
      <>
        <PageHeader title={m.nav_recipes()} actions={importAction} />
        <EmptyState
          icon={BookOpen}
          title={m["recipes.empty_title"]()}
          description={m["recipes.empty_description"]()}
        >
          <div className="recipe-actions">
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
      </>
    );
  }

  return (
    <div className="recipe-library">
      <PageHeader
        title={m.nav_recipes()}
        eyebrow={
          <span aria-live="polite">
            {recipes.data &&
              (recipes.data.length === 1
                ? m["recipes.count_one"]()
                : m["recipes.count"]({ count: recipes.data.length }))}
          </span>
        }
        actions={importAction}
      >
        <label className="stage-search">
          <Search aria-hidden="true" size={20} />
          <input
            type="search"
            value={search}
            placeholder={m["recipes.search_placeholder"]()}
            aria-label={m["recipes.search"]()}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </PageHeader>
      <fieldset className="recipe-tags" aria-label={m["recipes.filter_tags"]()}>
        <button
          type="button"
          className="chip"
          aria-pressed={!tag && !mode}
          onClick={() => {
            setTag("");
            setMode("");
          }}
        >
          {m["recipes.all_tags"]()}
        </button>
        {modes.map((value) => (
          <button
            key={value}
            type="button"
            className="chip"
            aria-pressed={mode === value}
            aria-describedby={mode === value ? "recipe-mode-hint" : undefined}
            onClick={() => setMode(mode === value ? "" : value)}
          >
            {modeLabel(value)}
          </button>
        ))}
        {tags.data?.map((value) => (
          <button
            key={value}
            type="button"
            className="chip"
            aria-pressed={tag === value}
            onClick={() => setTag(tag === value ? "" : value)}
          >
            {value}
          </button>
        ))}
      </fieldset>
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
                <span className="recipe-card-art">
                  <RecipeArt recipe={recipe} pictogramSize={64} />
                  {recipe.lastCookedAt && (
                    <span className="recipe-card-badge">
                      {cookedAgoLabel(recipe.lastCookedAt)}
                    </span>
                  )}
                </span>
                <span className="recipe-card-title">{recipe.title}</span>
                <span className="recipe-card-meta">
                  {[
                    totalMinutes(recipe) > 0 &&
                      formatMinutes(totalMinutes(recipe)),
                    recipe.tags[0],
                  ]
                    .filter(Boolean)
                    .join(" · ")}
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
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link
        to="/recipes/new"
        className="fab"
        aria-label={m["recipes.new"]()}
        title={m["recipes.new"]()}
      >
        <Plus aria-hidden="true" size={26} />
      </Link>
    </div>
  );
}
