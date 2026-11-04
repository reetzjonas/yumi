import {
  onlineManager,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { parseIngredientLine, unitSchema } from "@yumi/shared";
import { ArrowLeft, ArrowRight, Check, Sun, SunDim, X } from "lucide-react";
import { useRef, useState, useSyncExternalStore } from "react";
import { StepTimers } from "@/components/cooking/step-timers";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/api-error";
import {
  formatQuantity,
  ingredientName,
  type RecipeDetail,
} from "@/lib/recipes";
import { useMe } from "@/lib/session";
import { useWakeLock } from "@/lib/wake-lock";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/cook/$id")({ component: Cooking });

function Cooking() {
  const { id } = Route.useParams();
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
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const body = useRef<HTMLDivElement>(null);
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
            aria-label={m["cooking.close"]()}
            title={m["cooking.close"]()}
          >
            <X size={24} aria-hidden="true" />
          </Link>
        </Button>
        <h1>{recipe.title}</h1>
        <p className="cooking-progress">
          {step &&
            m["cooking.progress"]({
              current: index + 1,
              total: recipe.steps.length,
            })}
          <span title={active ? m["cooking.awake"]() : m["cooking.sleep"]()}>
            {active ? (
              <Sun size={20} aria-hidden="true" />
            ) : (
              <SunDim size={20} aria-hidden="true" />
            )}
            <span className="sr-only">
              {active ? m["cooking.awake"]() : m["cooking.sleep"]()}
            </span>
          </span>
        </p>
      </header>
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
          <section className="cooking-empty">
            <Check size={32} aria-hidden="true" />
            <h2>{m["cooking.finished"]()}</h2>
            <Button asChild>
              <Link to="/recipes/$id" params={{ id: recipe.id }}>
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
              <h2 id="cooking-ingredients-title">
                {m["recipes.ingredients"]()}
              </h2>
              {lines.length === 0 ? (
                <p className="row-detail">{m["cooking.no_ingredients"]()}</p>
              ) : (
                <ul className="recipe-ingredient-list">
                  {lines.map((line) => {
                    const parsed = parseIngredientLine(line.rawText);
                    return (
                      <li key={line.id}>
                        {line.quantity !== null && (
                          <strong>
                            {formatQuantity(
                              line.quantity,
                              unitSchema.safeParse(line.unit).data ?? null,
                            )}{" "}
                          </strong>
                        )}
                        {parsed.unitText && `${parsed.unitText} `}
                        {line.ingredient
                          ? ingredientName(line.ingredient)
                          : parsed.name || line.rawText}
                        {line.note && (
                          <span className="row-detail">, {line.note}</span>
                        )}
                        {line.optional && (
                          <span className="row-detail">
                            {" "}
                            ({m["recipes.optional"]()})
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
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
