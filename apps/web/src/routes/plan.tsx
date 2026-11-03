import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ListChecks } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { EmptyState, PageHeader } from "@/components/page";
import { MealQueueEntry } from "@/components/queue/queue-entry";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api-error";
import {
  type QueueEntryUpdate,
  queueKey,
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
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: queueKey(householdId) });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: QueueEntryUpdate }) =>
      updateQueueEntry(id, input),
    onSuccess: (_, { input }) => {
      if (input.status === "cooked") toast.success(m["queue.cooked_saved"]());
      else if (input.status === "skipped")
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
  const entries = query.data ?? [];
  const busy = update.isPending || reorder.isPending || query.isFetching;

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
        <Button asChild>
          <Link to="/recipes">{m["queue.add_meal"]()}</Link>
        </Button>
      </div>
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
          <p id="queue-order-hint" className="queue-hint">
            {m["queue.order_hint"]()}
          </p>
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
        </>
      )}
      <p className="sr-only top-0" role="status">
        {announcement}
      </p>
    </>
  );
}
