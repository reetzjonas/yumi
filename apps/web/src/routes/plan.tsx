import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ListChecks, Plus, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { EmptyState, PageHeader } from "@/components/page";
import { MealQueueEntry } from "@/components/queue/queue-entry";
import { RecipePicker } from "@/components/queue/recipe-picker";
import { QueueShoppingPreview } from "@/components/queue/shopping-preview";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api-error";
import { leftoversKey } from "@/lib/leftovers";
import {
  type QueueEntryUpdate,
  queueKey,
  removeQueueEntry,
  reorderQueue,
  updateQueueEntry,
  useQueue,
} from "@/lib/queue";
import { useMe } from "@/lib/session";
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
  const [drag, setDrag] = useState<{ id: string; targetId: string } | null>(
    null,
  );
  const dragRef = useRef<typeof drag>(null);
  const [announcement, setAnnouncement] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const pickerSheet = useRef<HTMLDialogElement>(null);
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
    onSuccess: async (_, { input }) => {
      if (input.status === "cooked") {
        await queryClient.invalidateQueries({
          queryKey: ["recipes", householdId],
        });
        toast.success(m["queue.cooked_saved"]());
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
  const selectedEntries = entries.filter((entry) =>
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

  return (
    <>
      <PageHeader title={m["queue.title"]()} />
      <div className="recipe-library-actions queue-header-actions">
        <Button asChild variant="outline">
          <Link to="/plan/suggestions">
            <Sparkles aria-hidden="true" size={20} />
            {m["queue.suggestions"]()}
          </Link>
        </Button>
        <Button
          type="button"
          variant={entries.length ? "outline" : "default"}
          aria-haspopup="dialog"
          onClick={() => pickerSheet.current?.showModal()}
        >
          <Plus aria-hidden="true" size={20} />
          {m["queue.plan_recipe"]()}
        </Button>
      </div>
      <Sheet ref={pickerSheet} title={m["queue.add"]()}>
        <RecipePicker />
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
            {m.plan_recipes_link()}
          </Button>
        </EmptyState>
      ) : (
        <>
          {reorder.isError && (
            <p className="form-error" role="alert">
              {errorMessage(reorder.error)}
            </p>
          )}
          <ol className="queue-list" aria-busy={busy}>
            {entries.map((entry, index) => (
              <MealQueueEntry
                key={`${entry.id}-${entry.servings}-${entry.plannedFor}`}
                entry={entry}
                index={index}
                count={entries.length}
                disabled={busy}
                removeError={
                  remove.isError && remove.variables.id === entry.id
                    ? errorMessage(remove.error)
                    : null
                }
                onRemove={(removeItems) =>
                  remove.mutate({ id: entry.id, removeItems })
                }
                error={
                  update.isError && update.variables.id === entry.id
                    ? errorMessage(update.error)
                    : null
                }
                dragging={drag?.id === entry.id}
                dropPosition={
                  drag && drag.targetId === entry.id && drag.id !== entry.id
                    ? entries.findIndex((item) => item.id === drag.id) < index
                      ? "after"
                      : "before"
                    : undefined
                }
                onMove={(offset) => {
                  const target = entries[index + offset];
                  if (target) move(entry.id, target.id);
                }}
                onUpdate={(input) => update.mutate({ id: entry.id, input })}
                dragProps={{
                  onPointerDown: (event) => {
                    if (busy || !event.isPrimary || event.button !== 0) return;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    dragRef.current = { id: entry.id, targetId: entry.id };
                    setDrag(dragRef.current);
                  },
                  onPointerMove: (event) => {
                    if (!dragRef.current) return;
                    const scroller =
                      event.currentTarget.closest<HTMLElement>(".app-main");
                    if (scroller) {
                      const bounds = scroller.getBoundingClientRect();
                      if (event.clientY < bounds.top + 72)
                        scroller.scrollBy(0, -16);
                      else if (event.clientY > bounds.bottom - 96)
                        scroller.scrollBy(0, 16);
                    }
                    const targetId = document
                      .elementFromPoint(event.clientX, event.clientY)
                      ?.closest<HTMLElement>("[data-queue-id]")
                      ?.dataset.queueId;
                    if (targetId && targetId !== dragRef.current.targetId) {
                      dragRef.current = { id: entry.id, targetId };
                      setDrag(dragRef.current);
                    }
                  },
                  onPointerUp: (event) => {
                    const current = dragRef.current;
                    dragRef.current = null;
                    setDrag(null);
                    event.currentTarget.releasePointerCapture(event.pointerId);
                    if (current) move(current.id, current.targetId);
                  },
                  onLostPointerCapture: () => {
                    dragRef.current = null;
                    setDrag(null);
                  },
                  onKeyDown: (event) => {
                    if (event.key === "Escape") {
                      dragRef.current = null;
                      setDrag(null);
                    }
                  },
                }}
              />
            ))}
          </ol>
          <p id="queue-order-hint" className="queue-hint">
            {m["queue.order_hint"]()}
          </p>
          <div className="sticky-action">
            <Button
              type="button"
              className="w-full"
              aria-haspopup="dialog"
              onClick={() => {
                setSelectedIds(entries.map((entry) => entry.id));
                setShoppingAdded(null);
                shoppingSheet.current?.showModal();
              }}
            >
              <ListChecks aria-hidden="true" size={20} />
              {entries.length === 1
                ? m["queue.to_list_one"]()
                : m["queue.to_list"]({ count: entries.length })}
            </Button>
          </div>
          <Sheet ref={shoppingSheet} title={m["queue.shopping_title"]()}>
            <fieldset className="picker-list" disabled={busy}>
              <legend className="field-label">
                {m["queue.shopping_meals"]()}
              </legend>
              {entries.map((entry) => (
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
                    <span className="picker-row-title">
                      {entry.recipe.title}
                    </span>
                    <span className="meta">
                      {m["queue.servings_count"]({ count: entry.servings })}
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
