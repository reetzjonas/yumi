import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ListChecks } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { EmptyState, PageHeader } from "@/components/page";
import { LeftoversPanel } from "@/components/queue/leftovers-panel";
import { MealQueueEntry } from "@/components/queue/queue-entry";
import { QueueShoppingPreview } from "@/components/queue/shopping-preview";
import { ListPeek } from "@/components/shopping/list-peek";
import { Button } from "@/components/ui/button";
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
      <div className="recipe-list-heading">
        <PageHeader title={m.nav_plan()} />
        <Button
          asChild
          variant={
            selectedEntries.length || !entries.length ? "secondary" : "default"
          }
        >
          <Link to="/recipes">{m["queue.add_meal"]()}</Link>
        </Button>
      </div>
      <div className="split plan-split">
        <div className="split-main">
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
              <Button asChild>
                <Link to="/recipes">{m.plan_recipes_link()}</Link>
              </Button>
            </EmptyState>
          ) : (
            <>
              <label className="queue-checkbox queue-select-all">
                <input
                  type="checkbox"
                  checked={selectedEntries.length === entries.length}
                  ref={(input) => {
                    if (input)
                      input.indeterminate =
                        selectedEntries.length > 0 &&
                        selectedEntries.length < entries.length;
                  }}
                  disabled={busy}
                  onChange={(event) => {
                    setSelectedIds(
                      event.target.checked
                        ? entries.map((entry) => entry.id)
                        : [],
                    );
                    setShoppingAdded(null);
                  }}
                />
                <span>{m["queue.select_all"]()}</span>
              </label>
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
                    selected={selectedIds.includes(entry.id)}
                    onSelect={(selected) => {
                      setSelectedIds(
                        selected
                          ? [
                              ...selectedEntries.map((item) => item.id),
                              entry.id,
                            ]
                          : selectedIds.filter((id) => id !== entry.id),
                      );
                      setShoppingAdded(null);
                    }}
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
                        ? entries.findIndex((item) => item.id === drag.id) <
                          index
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
                        if (busy || !event.isPrimary || event.button !== 0)
                          return;
                        event.currentTarget.setPointerCapture(event.pointerId);
                        dragRef.current = { id: entry.id, targetId: entry.id };
                        setDrag(dragRef.current);
                      },
                      onPointerMove: (event) => {
                        if (!dragRef.current) return;
                        const scroller = [".split-main", ".app-main"]
                          .map((selector) =>
                            event.currentTarget.closest<HTMLElement>(selector),
                          )
                          .find(
                            (element) =>
                              element &&
                              element.scrollHeight > element.clientHeight,
                          );
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
                        event.currentTarget.releasePointerCapture(
                          event.pointerId,
                        );
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
            </>
          )}
          <LeftoversPanel />
        </div>
        <aside className="split-side">
          <ListPeek />
        </aside>
      </div>
      <p className="sr-only top-0" role="status">
        {announcement}
      </p>
    </>
  );
}
