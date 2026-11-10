import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { History, Plus } from "lucide-react";
import { toast } from "sonner";
import { BackLink, EmptyState, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/api-error";
import { formatDate } from "@/lib/i18n";
import { addQueueEntry, queueKey } from "@/lib/queue";
import { useMe } from "@/lib/session";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/more/history")({
  component: MealHistory,
});

/** Monday of the week a date falls in, as a sortable local day key. */
function weekStart(date: Date) {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day;
}

function weekLabel(start: Date) {
  const weeks = Math.round(
    (weekStart(new Date()).getTime() - start.getTime()) / (7 * 86_400_000),
  );
  if (weeks === 0) return m["history.this_week"]();
  if (weeks === 1) return m["history.last_week"]();
  return m["history.week_of"]({
    date: formatDate(start, { day: "numeric", month: "long" }),
  });
}

function MealHistory() {
  const householdId = useMe()?.activeHouseholdId;
  const queryClient = useQueryClient();
  const history = useQuery({
    queryKey: ["recipes", householdId, "meal-history"],
    enabled: Boolean(householdId),
    queryFn: async () =>
      (await ensureOk(await api.recipes.history.$get())).json(),
  });
  const plan = useMutation({
    mutationFn: (entry: { recipeId: string; servings: number }) =>
      addQueueEntry({ ...entry, plannedFor: null }),
    onSuccess: () => {
      toast.success(m["history.planned"]());
      return queryClient.invalidateQueries({ queryKey: queueKey(householdId) });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const weeks: { start: Date; meals: NonNullable<typeof history.data> }[] = [];
  for (const meal of history.data ?? []) {
    const start = weekStart(new Date(meal.at));
    const last = weeks.at(-1);
    if (last && last.start.getTime() === start.getTime()) last.meals.push(meal);
    else weeks.push({ start, meals: [meal] });
  }
  return (
    <>
      <PageHeader
        title={m["history.title"]()}
        back={<BackLink to="/more" label={m.nav_more()} />}
      />
      {history.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : history.isError ? (
        <p className="form-error" role="alert">
          {errorMessage(history.error)}
        </p>
      ) : weeks.length === 0 ? (
        <EmptyState
          icon={History}
          title={m["history.empty_title"]()}
          description={m["history.empty_description"]()}
        />
      ) : (
        weeks.map((week) => (
          <section key={week.start.getTime()}>
            <h2 className="section-label">{weekLabel(week.start)}</h2>
            <ul className="row-list">
              {week.meals.map((meal) => (
                <li key={meal.id} className="row">
                  <span className="history-day">
                    {formatDate(new Date(meal.at), {
                      weekday: "short",
                      day: "numeric",
                      month: "numeric",
                    })}
                  </span>
                  <span className="row-main">
                    {meal.recipeId ? (
                      <Link
                        className="row-title"
                        to="/recipes/$id"
                        params={{ id: meal.recipeId }}
                      >
                        {meal.title}
                      </Link>
                    ) : (
                      <span className="row-title">{meal.title}</span>
                    )}
                    {meal.by && <span className="row-detail">{meal.by}</span>}
                  </span>
                  {meal.recipeId && meal.servings && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="icon-action"
                      disabled={plan.isPending}
                      aria-label={m["history.plan_again"]({
                        name: meal.title,
                      })}
                      title={m["history.plan_again"]({ name: meal.title })}
                      onClick={() =>
                        plan.mutate({
                          recipeId: meal.recipeId as string,
                          servings: meal.servings as number,
                        })
                      }
                    >
                      <Plus size={20} aria-hidden="true" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
