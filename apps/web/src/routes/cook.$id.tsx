import {
  onlineManager,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { parseIngredientLine, unitSchema } from "@yumi/shared";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Star,
  Sun,
  SunDim,
  X,
} from "lucide-react";
import { useRef, useState, useSyncExternalStore } from "react";
import { StepTimers } from "@/components/cooking/step-timers";
import { RecipeNotes } from "@/components/recipes/recipe-notes";
import { ServingsStepper } from "@/components/recipes/servings-selector";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/api-error";
import { planLeftoverMeal } from "@/lib/queue";
import {
  formatScaledQuantity,
  groupBySection,
  ingredientName,
  type RecipeDetail,
  servingsSearch,
} from "@/lib/recipes";
import { useMe } from "@/lib/session";
import { useWakeLock } from "@/lib/wake-lock";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/cook/$id")({
  validateSearch: servingsSearch,
  component: Cooking,
});

function Cooking() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const householdId = useMe()?.activeHouseholdId;
  const query = useQuery({
    queryKey: ["recipes", householdId, "detail", id],
    queryFn: async () =>
      (await ensureOk(await api.recipes[":id"].$get({ param: { id } }))).json(),
  });
  return (
    <main className="cooking-view">
      {query.data ? (
        <CookingSteps key={`${householdId}-${id}`} recipe={query.data} />
      ) : (
        <>
          <header className="cooking-header">
            <Button asChild variant="ghost">
              <Link
                to="/recipes/$id"
                params={{ id }}
                search={search}
                aria-label={m["cooking.close"]()}
                title={m["cooking.close"]()}
              >
                <X size={24} aria-hidden="true" />
              </Link>
            </Button>
            <h1>{m["cooking.title"]()}</h1>
            <p className="cooking-progress" role="status">
              {query.fetchStatus === "paused"
                ? m["cooking.offline_unloaded"]()
                : query.isPending
                  ? m["cooking.loading"]()
                  : null}
            </p>
          </header>
          <div className="cooking-body">
            {query.isError ? (
              <section className="cooking-empty">
                <p role="alert" className="form-error">
                  {errorMessage(query.error)}
                </p>
                <Button onClick={() => query.refetch()}>
                  {m["cooking.retry"]()}
                </Button>
              </section>
            ) : (
              <Skeleton className="h-32 w-full" />
            )}
          </div>
          {query.isPending && (
            <div className="cooking-footer" aria-hidden="true">
              <Skeleton className="h-12 w-24" />
              <Skeleton className="h-12 w-24" />
            </div>
          )}
        </>
      )}
    </main>
  );
}

function CookingSteps({ recipe }: { recipe: RecipeDetail }) {
  const search = Route.useSearch();
  const servings = search.servings ?? recipe.servings;
  const navigate = Route.useNavigate();
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  // Mise en place: ingredient lines marked as ready for this cooking session.
  const [ready, setReady] = useState<ReadonlySet<string>>(new Set());
  const toggleReady = (id: string) =>
    setReady((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const [requestId] = useState(() => crypto.randomUUID());
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const allSheet = useRef<HTMLDialogElement>(null);
  const active = useWakeLock();
  const online = useSyncExternalStore(
    (listener) => onlineManager.subscribe(listener),
    () => onlineManager.isOnline(),
  );
  const queryClient = useQueryClient();
  const step = recipe.steps[index];
  const last = index === recipe.steps.length - 1;
  const cooked = useMutation({
    mutationFn: async () =>
      ensureOk(
        await api.recipes[":id"].cooked.$post({
          param: { id: recipe.id },
          json: { requestId },
        }),
      ),
    onSuccess: () => {
      setFinished(true);
      void queryClient.invalidateQueries({ queryKey: ["recipes"] });
    },
  });
  function go(next: number) {
    if (next < 0 || next >= recipe.steps.length) return;
    setIndex(next);
    body.current?.scrollTo({ top: 0 });
  }
  const lines = step
    ? recipe.ingredients.filter((line) => step.ingredientRefs.includes(line.id))
    : [];
  return (
    <>
      <header className="cooking-header">
        <Button asChild variant="ghost">
          <Link
            to="/recipes/$id"
            params={{ id: recipe.id }}
            search={{ servings }}
            aria-label={m["cooking.close"]()}
            title={m["cooking.close"]()}
          >
            <X size={24} aria-hidden="true" />
          </Link>
        </Button>
        <div className="cooking-title">
          <h1>{recipe.title}</h1>
          <p className="cooking-progress">
            {[
              step &&
                m["cooking.progress"]({
                  current: index + 1,
                  total: recipe.steps.length,
                }),
              m["recipes.servings_count"]({ count: servings }),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <span
          className={active ? "wake-chip" : "wake-chip is-off"}
          role="img"
          aria-label={active ? m["cooking.awake"]() : m["cooking.sleep"]()}
          title={active ? m["cooking.awake"]() : m["cooking.sleep"]()}
        >
          {active ? (
            <Sun size={20} aria-hidden="true" />
          ) : (
            <SunDim size={20} aria-hidden="true" />
          )}
        </span>
      </header>
      {step && !finished && (
        <progress
          className="progress-bar cooking-bar"
          value={index + 1}
          max={recipe.steps.length}
          aria-label={m["cooking.progress"]({
            current: index + 1,
            total: recipe.steps.length,
          })}
        />
      )}
      <div
        className="cooking-body"
        ref={body}
        onTouchStart={(event) => {
          const point = event.touches[0];
          touchStart.current = point
            ? { x: point.clientX, y: point.clientY }
            : null;
        }}
        onTouchEnd={(event) => {
          const start = touchStart.current;
          const end = event.changedTouches[0];
          touchStart.current = null;
          if (!start || !end || finished) return;
          const dx = end.clientX - start.x;
          if (
            Math.abs(dx) > 70 &&
            Math.abs(dx) > Math.abs(end.clientY - start.y) * 2
          )
            go(index + (dx < 0 ? 1 : -1));
        }}
      >
        {!online && (
          <p role="status" className="offline-banner">
            {m["cooking.offline"]()}
          </p>
        )}
        {finished ? (
          <section className="cooking-finish">
            <span className="cooking-finish-icon">
              <Check size={32} aria-hidden="true" />
            </span>
            <h2>{m["cooking.enjoy"]()}</h2>
            <p className="meta" role="status">
              {m["cooking.finished"]()} ·{" "}
              {m["recipes.servings_count"]({ count: servings })}
            </p>
            <div className="import-card">
              <h3 className="import-card-title">{m["cooking.how_was_it"]()}</h3>
              <FinishRating recipe={recipe} />
            </div>
            <div className="import-card">
              <RecipeNotes recipe={recipe} startEditing />
            </div>
            <LeftoverMeal title={recipe.title} />
            <Button asChild className="w-full">
              <Link
                to="/recipes/$id"
                params={{ id: recipe.id }}
                search={{ servings }}
              >
                {m["cooking.close"]()}
              </Link>
            </Button>
          </section>
        ) : !step ? (
          <section className="cooking-empty">
            <h2>{m["recipes.no_steps"]()}</h2>
            <Button asChild>
              <Link to="/recipes/$id/edit" params={{ id: recipe.id }}>
                {m["recipes.edit"]()}
              </Link>
            </Button>
          </section>
        ) : (
          <>
            <section
              className="cooking-instruction"
              aria-label={m["recipes.steps"]()}
            >
              {index === 0 && recipe.cookingNotes && (
                <p className="cooking-notes">
                  <strong>{m["recipes.notes_title"]()}:</strong>{" "}
                  {recipe.cookingNotes}
                </p>
              )}
              <p className="cooking-step-label">
                {m["cooking.step_label"]({ number: index + 1 })}
              </p>
              <p className="cooking-step-text" aria-live="polite">
                {step.text}
              </p>
              <StepTimers
                text={step.text}
                recipeTitle={recipe.title}
                stepLabel={m["cooking.progress"]({
                  current: index + 1,
                  total: recipe.steps.length,
                })}
              />
            </section>
            <section
              className="cooking-ingredients"
              aria-labelledby="cooking-ingredients-title"
            >
              <h2 id="cooking-ingredients-title">{m["cooking.for_step"]()}</h2>
              {lines.length === 0 ? (
                <p className="meta">{m["cooking.no_ingredients"]()}</p>
              ) : (
                <IngredientLines
                  lines={lines}
                  base={recipe.servings}
                  servings={servings}
                  ready={ready}
                  onToggle={toggleReady}
                />
              )}
              <Button
                type="button"
                variant="outline"
                className="w-full"
                aria-haspopup="dialog"
                onClick={() => allSheet.current?.showModal()}
              >
                {m["cooking.all_ingredients_servings"]({ count: servings })}
              </Button>
              <Sheet ref={allSheet} title={m["cooking.all_ingredients"]()}>
                <div className="sheet-row">
                  <span className="field-label">{m["recipes.servings"]()}</span>
                  <ServingsStepper
                    value={servings}
                    onChange={(next) =>
                      void navigate({
                        search: { servings: next },
                        replace: true,
                      })
                    }
                  />
                </div>
                {groupBySection(recipe.ingredients).map((group) => (
                  <div key={group.section ?? ""}>
                    {group.section && (
                      <h3 className="section-label">{group.section}</h3>
                    )}
                    <IngredientLines
                      lines={group.lines}
                      base={recipe.servings}
                      servings={servings}
                      ready={ready}
                      onToggle={toggleReady}
                    />
                  </div>
                ))}
              </Sheet>
            </section>
            <nav
              className="cooking-overview"
              aria-label={m["cooking.overview"]()}
            >
              <h2>{m["cooking.overview"]()}</h2>
              <ol>
                {recipe.steps.map((entry, position) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      aria-current={index === position ? "step" : undefined}
                      onClick={() => go(position)}
                    >
                      <span>
                        {index === position ? (
                          <Check size={20} aria-hidden="true" />
                        ) : (
                          position + 1
                        )}
                      </span>
                      <span>{entry.text}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
          </>
        )}
      </div>
      {step && !finished && (
        <footer className="cooking-footer">
          {cooked.isError && (
            <p className="form-error" role="alert">
              {errorMessage(cooked.error)}
            </p>
          )}
          <Button
            variant="outline"
            disabled={index === 0 || cooked.isPending}
            onClick={() => go(index - 1)}
          >
            <ArrowLeft size={20} aria-hidden="true" />
            {m["cooking.previous"]()}
          </Button>
          <Button
            disabled={cooked.isPending}
            aria-busy={cooked.isPending}
            onClick={() => (last ? cooked.mutate() : go(index + 1))}
          >
            {last ? (
              <span
                className="cooking-submit-label"
                data-busy={cooked.isPending}
              >
                <span>{m["cooking.mark_cooked"]()}</span>
                <span role="status">{m["cooking.recording"]()}</span>
              </span>
            ) : (
              m["cooking.next"]()
            )}
            {last ? (
              <Check size={20} aria-hidden="true" />
            ) : (
              <ArrowRight size={20} aria-hidden="true" />
            )}
          </Button>
        </footer>
      )}
    </>
  );
}

function IngredientLines({
  lines,
  base,
  servings,
  ready,
  onToggle,
}: {
  lines: RecipeDetail["ingredients"];
  base: number;
  servings: number;
  ready: ReadonlySet<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <ul className="ingredient-rows is-large is-checkable">
      {lines.map((line) => {
        const parsed = parseIngredientLine(line.rawText);
        const quantity = formatScaledQuantity(
          line.quantity,
          unitSchema.safeParse(line.unit).data ?? null,
          base,
          servings,
        );
        return (
          <li key={line.id}>
            <button
              type="button"
              className="ingredient-check"
              aria-pressed={ready.has(line.id)}
              onClick={() => onToggle(line.id)}
            >
              <span className="ingredient-check-box" aria-hidden="true">
                {ready.has(line.id) && <Check size={16} strokeWidth={3} />}
              </span>
              <span className="ingredient-quantity">
                {quantity ?? ""}
                {parsed.unitText && ` ${parsed.unitText}`}
              </span>
              <span className="ingredient-check-name">
                {line.ingredient
                  ? ingredientName(line.ingredient)
                  : parsed.name || line.rawText}
                {line.note && <span className="meta">, {line.note}</span>}
                {line.optional && (
                  <span className="meta"> · {m["recipes.optional"]()}</span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function LeftoverMeal({ title }: { title: string }) {
  const queryClient = useQueryClient();
  const plan = useMutation({
    mutationFn: () =>
      planLeftoverMeal(m["queue.leftover_meal"]({ name: title })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["queue"] }),
  });
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={plan.isPending || plan.isSuccess}
        onClick={() => plan.mutate()}
      >
        {plan.isSuccess
          ? m["queue.leftovers_planned"]()
          : m["queue.plan_leftovers_next"]()}
      </Button>
      {plan.isError && (
        <p role="alert" className="form-error">
          {errorMessage(plan.error)}
        </p>
      )}
    </>
  );
}

function FinishRating({ recipe }: { recipe: RecipeDetail }) {
  const queryClient = useQueryClient();
  const rating = useMutation({
    mutationFn: async (stars: number) =>
      ensureOk(
        await api.recipes[":id"].rating.$put({
          param: { id: recipe.id },
          json: { stars },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recipes"] }),
  });
  const current = rating.isSuccess ? rating.variables : recipe.myRating;
  return (
    <>
      <div className="recipe-rating-stars">
        {[1, 2, 3, 4, 5].map((stars) => (
          <Button
            key={stars}
            type="button"
            variant="ghost"
            className={
              (current ?? 0) >= stars
                ? "recipe-rating-star is-filled"
                : "recipe-rating-star"
            }
            disabled={rating.isPending}
            aria-label={m["recipes.rate_stars"]({ stars })}
            aria-pressed={current === stars}
            onClick={() => rating.mutate(stars)}
          >
            <Star
              size={24}
              aria-hidden="true"
              fill={(current ?? 0) >= stars ? "currentColor" : "none"}
            />
          </Button>
        ))}
      </div>
      {rating.isError && (
        <p role="alert" className="form-error">
          {errorMessage(rating.error)}
        </p>
      )}
    </>
  );
}
