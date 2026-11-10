import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ListChecks, Plus, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { EmptyState, PageHeader } from "@/components/page";
import { AddFreeMeal } from "@/components/queue/add-free-meal";
import { MealQueueEntry } from "@/components/queue/queue-entry";
import { RecipePicker } from "@/components/queue/recipe-picker";
import { QueueShoppingPreview } from "@/components/queue/shopping-preview";
import { WeekSuggestion } from "@/components/queue/week-suggestion";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api-error";
import { formatDate, getLocale } from "@/lib/i18n";
import { leftoversKey, useLeftovers } from "@/lib/leftovers";
import {
  planLeftoverMeal,
  type QueueEntryUpdate,
  queueKey,
  removeQueueEntry,
  reorderQueue,
  updateQueueEntry,
  useQueue,
} from "@/lib/queue";
import { useMe } from "@/lib/session";
import { useShoppingLists } from "@/lib/shopping";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/plan")({ component: Plan });

function Plan() {
  const householdId = useMe()?.activeHouseholdId;
  return <MealQueue key={householdId} householdId={householdId} />;
}

function MealQueue({
  householdId,
}: {
  householdId: string | null | undefined;
}) {
  const query = useQueue();
  const queryClient = useQueryClient();
  const [announcement, setAnnouncement] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const pickerSheet = useRef<HTMLDialogElement>(null);
  const [addKind, setAddKind] = useState<"recipe" | "free" | "week">("recipe");
  const shoppingSheet = useRef<HTMLDialogElement>(null);
  const [shoppingPending, setShoppingPending] = useState(false);
  const [shoppingAdded, setShoppingAdded] = useState<number | null>(null);
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queueKey(householdId) }),
      queryClient.invalidateQueries({ queryKey: leftoversKey(householdId) }),
    ]);
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: QueueEntryUpdate }) =>
      updateQueueEntry(id, input),
    onSuccess: async (_, { id, input }) => {
      if (input.status === "cooked") {
        const linked = query.data?.find((entry) => entry.id === id)?.recipe;
        if (linked)
          await queryClient.invalidateQueries({
            queryKey: ["recipes", householdId],
          });
        const title = query.data?.find((entry) => entry.id === id)?.title;
        toast.success(
          linked ? m["queue.cooked_saved"]() : m["queue.saved"](),
          linked && title
            ? {
                action: {
                  label: m["queue.plan_leftovers"](),
                  onClick: () =>
                    void planLeftoverMeal(
                      m["queue.leftover_meal"]({ name: title }),
                    )
                      .then(refresh)
                      .catch((error) => toast.error(errorMessage(error))),
                },
              }
            : undefined,
        );
      } else if (input.status === "skipped")
        toast.success(m["queue.skipped_saved"]());
      else toast.success(m["queue.saved"]());
    },
    onSettled: refresh,
  });
  const reorder = useMutation({
    mutationFn: reorderQueue,
    onSuccess: () => setAnnouncement(m["queue.reordered"]()),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: ({ id, removeItems }: { id: string; removeItems: boolean }) =>
      removeQueueEntry(id, removeItems),
    onSuccess: () => toast.success(m["queue.removed"]()),
    onSettled: async () => {
      await refresh();
      await queryClient.invalidateQueries({
        queryKey: ["shopping", householdId],
      });
    },
  });
  const entries = query.data ?? [];
  const lists = useShoppingLists();
  const leftovers = useLeftovers();
  const openItems =
    lists.data?.reduce((sum, list) => sum + list.openCount, 0) ?? 0;
  const recipeEntries = entries.filter((entry) => entry.recipe !== null);
  const selectedEntries = recipeEntries.filter((entry) =>
    selectedIds.includes(entry.id),
  );
  const busy =
    update.isPending ||
    reorder.isPending ||
    remove.isPending ||
    query.isFetching ||
    shoppingPending;

  function move(id: string, targetId: string) {
    if (busy || id === targetId) return;
    const ids = entries.map((entry) => entry.id);
    const from = ids.indexOf(id);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
    setAnnouncement("");
    reorder.mutate(ids);
  }

  const renderEntry = (entry: (typeof entries)[number], index: number) => (
    <MealQueueEntry
      key={`${entry.id}-${entry.plannedFor}-${entry.title}-${entry.note}`}
      hero={index === 0}
      entry={entry}
      index={index}
      count={entries.length}
      disabled={busy}
      removeError={
        remove.isError && remove.variables.id === entry.id
          ? errorMessage(remove.error)
          : null
      }
      onRemove={(removeItems) => remove.mutate({ id: entry.id, removeItems })}
      error={
        update.isError && update.variables.id === entry.id
          ? errorMessage(update.error)
          : null
      }
      onMove={(offset) => {
        const target = entries[index + offset];
        if (target) move(entry.id, target.id);
      }}
      onUpdate={(input) => update.mutate({ id: entry.id, input })}
    />
  );

  return (
    <>
      <PageHeader
        title={m["queue.stage_title"]()}
        lift={entries.length > 0}
        eyebrow={formatDate(new Date(), {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
        actions={
          <Button
            type="button"
            variant="ghost"
            aria-label={m["queue.plan_recipe"]()}
            aria-haspopup="dialog"
            onClick={() => pickerSheet.current?.showModal()}
          >
            <Plus aria-hidden="true" size={22} />
          </Button>
        }
      />
      <Sheet
        ref={pickerSheet}
        title={m["queue.add"]()}
        onClose={() => setAddKind("recipe")}
      >
        <div className="recipe-actions">
          <Button
            type="button"
            variant={addKind === "recipe" ? "secondary" : "ghost"}
            aria-pressed={addKind === "recipe"}
            onClick={() => setAddKind("recipe")}
          >
            {m["queue.from_recipe"]()}
          </Button>
          <Button
            type="button"
            variant={addKind === "free" ? "secondary" : "ghost"}
            aria-pressed={addKind === "free"}
            onClick={() => setAddKind("free")}
          >
            {m["queue.without_recipe"]()}
          </Button>
          <Button
            type="button"
            variant={addKind === "week" ? "secondary" : "ghost"}
            aria-pressed={addKind === "week"}
            onClick={() => setAddKind("week")}
          >
            <Sparkles size={18} aria-hidden="true" />
            {m["queue.week_tab"]()}
          </Button>
        </div>
        {addKind === "recipe" ? (
          <RecipePicker suggestions />
        ) : addKind === "free" ? (
          <AddFreeMeal onAdded={() => pickerSheet.current?.close()} />
        ) : (
          <WeekSuggestion onAdded={() => pickerSheet.current?.close()} />
        )}
      </Sheet>
      {query.isPending ? (
        <div className="queue-loading" role="status">
          <p>{m["queue.loading"]()}</p>
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : query.isError ? (
        <div className="queue-loading">
          <p className="form-error" role="alert">
            {errorMessage(query.error)}
          </p>
          <Button
            variant="secondary"
            disabled={query.isFetching}
            onClick={() => query.refetch()}
          >
            {m["queue.retry"]()}
          </Button>
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={m.plan_empty_title()}
          description={m.plan_empty_description()}
        >
          <Button
            type="button"
            aria-haspopup="dialog"
            onClick={() => pickerSheet.current?.showModal()}
          >
            {m["queue.plan_recipe"]()}
          </Button>
        </EmptyState>
      ) : (
        <>
          {reorder.isError && (
            <p className="form-error" role="alert">
              {errorMessage(reorder.error)}
            </p>
          )}
          <div className="today" aria-busy={busy}>
            {entries[0] && renderEntry(entries[0], 0)}
            <div className="today-tiles">
              <Link to="/list" className="stat-tile is-lemon">
                <span className="stat-tile-label">{m.nav_list()}</span>
                <span className="stat-tile-value">
                  {m["queue.open_items"]({ count: openItems })}
                </span>
                <span className="stat-tile-detail">
                  {lists.data?.[0]?.name ?? m["shopping.title"]()} ›
                </span>
              </Link>
              <Link to="/plan/suggestions" className="stat-tile is-basil">
                <span className="stat-tile-label">
                  {m["queue.leftovers"]()}
                </span>
                <span className="stat-tile-value">
                  {leftovers.data?.length ?? 0}
                </span>
                <span className="stat-tile-detail">
                  {leftovers.data?.length
                    ? leftovers.data
                        .map((item) =>
                          getLocale() === "de" ? item.nameDe : item.nameEn,
                        )
                        .join(", ")
                    : m["queue.leftovers_none"]()}
                </span>
              </Link>
            </div>
            <section className="today-next">
              <h2 className="section-label">{m["queue.up_next"]()}</h2>
              <ol className="plan-rail">
                {entries.slice(1).map((entry, i) => renderEntry(entry, i + 1))}
                <li className="plan-card">
                  <button
                    type="button"
                    className="plan-card-button is-add"
                    aria-haspopup="dialog"
                    onClick={() => pickerSheet.current?.showModal()}
                  >
                    <span className="recipe-art">
                      <Plus size={24} aria-hidden="true" />
                    </span>
                    <span className="plan-card-title">
                      {m["queue.plan_recipe"]()}
                    </span>
                    <span className="meta">{m["queue.plan_hint"]()}</span>
                  </button>
                </li>
              </ol>
            </section>
            {recipeEntries.length > 0 && (
              <Button
                type="button"
                variant="outline"
                className="queue-to-list"
                aria-haspopup="dialog"
                onClick={() => {
                  // Entries already on a list stay unselected to avoid duplicates.
                  const pending = recipeEntries.filter(
                    (entry) => !entry.onList,
                  );
                  setSelectedIds(
                    (pending.length ? pending : recipeEntries).map(
                      (entry) => entry.id,
                    ),
                  );
                  setShoppingAdded(null);
                  shoppingSheet.current?.showModal();
                }}
              >
                <ListChecks aria-hidden="true" size={20} />
                {m["queue.to_list_action"]()}
              </Button>
            )}
          </div>
          <Sheet ref={shoppingSheet} title={m["queue.shopping_title"]()}>
            <fieldset className="picker-list" disabled={busy}>
              <legend className="field-label">
                {m["queue.shopping_meals"]()}
              </legend>
              {recipeEntries.map((entry) => (
                <label key={entry.id} className="picker-row">
                  <input
                    className="picker-input"
                    type="checkbox"
                    checked={selectedIds.includes(entry.id)}
                    onChange={(event) => {
                      setSelectedIds(
                        event.target.checked
                          ? [...selectedIds, entry.id]
                          : selectedIds.filter((id) => id !== entry.id),
                      );
                      setShoppingAdded(null);
                    }}
                  />
                  <span className="picker-row-main">
                    <span className="picker-row-title">{entry.title}</span>
                    <span className="meta">
                      {m["queue.servings_count"]({ count: entry.servings })}
                      {entry.onList && ` · ${m["queue.on_list"]()}`}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            {shoppingAdded !== null && (
              <p className="queue-shopping-result" role="status">
                {m["shopping.recipe_added"]({ count: shoppingAdded })}{" "}
                <Link className="text-link" to="/list">
                  {m["queue.open_list"]()}
                </Link>
              </p>
            )}
            <QueueShoppingPreview
              key={selectedEntries
                .map((entry) => `${entry.id}:${entry.servings}`)
                .join(",")}
              entries={selectedEntries}
              disabled={busy}
              onPendingChange={setShoppingPending}
              onAdded={(added) => {
                setSelectedIds([]);
                setShoppingAdded(added);
              }}
            />
          </Sheet>
        </>
      )}
      <p className="sr-only top-0" role="status">
        {announcement}
      </p>
    </>
  );
}
