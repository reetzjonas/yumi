import { useQueryClient } from "@tanstack/react-query";
import { shoppingEventBatchSchema } from "@yumi/shared";
import { useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  loadOutbox,
  outboxRevision,
  outboxSessionVersion,
  pendingRecords,
  removeRecords,
  replayOutbox,
  subscribeOutbox,
} from "@/lib/outbox";
import { useMe } from "@/lib/session";
import { m } from "@/paraglide/messages";

export function useOutboxRevision() {
  return useSyncExternalStore(subscribeOutbox, outboxRevision);
}

/** Mounted for the whole authenticated app, so leaving the list does not suspend replay. */
export function useShoppingSync() {
  const householdId = useMe()?.activeHouseholdId;
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!householdId) return;
    const activeHouseholdId = householdId;
    let active = true;
    let running = false;
    let requested = false;
    let delay = 1_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const sessionVersion = outboxSessionVersion();
    const isActive = () => active && sessionVersion === outboxSessionVersion();
    const invalidate = () =>
      queryClient.invalidateQueries({ queryKey: ["shopping", householdId] });
    async function flush() {
      requested = true;
      if (running || !isActive() || !navigator.onLine) return;
      running = true;
      clearTimeout(timer);
      try {
        await loadOutbox();
        do {
          requested = false;
          const retry = await replayOutbox(pendingRecords(activeHouseholdId), {
            active: isActive,
            send: (listId, events) =>
              api.shopping.lists[":id"].events.$post(
                {
                  param: { id: listId },
                  json: shoppingEventBatchSchema.parse({ events }),
                },
                { init: { signal: controller.signal } },
              ),
            remove: async (batch) => {
              await removeRecords(batch);
              // A read after the acknowledgement replaces the optimistic snapshot.
              void invalidate();
            },
            rejected: () => toast.error(m["shopping.sync_rejected"]()),
          });
          if (retry) {
            timer = setTimeout(() => void flush(), delay);
            delay = Math.min(delay * 2, 60_000);
            requested = false;
            break;
          }
          delay = 1_000;
        } while (requested && isActive());
      } catch {
        if (active) toast.error(m["shopping.local_storage_error"]());
      } finally {
        running = false;
      }
    }
    const onChange = () => {
      if (!isActive()) controller.abort();
      else void flush();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") onChange();
    };
    const unsubscribe = subscribeOutbox(onChange);
    window.addEventListener("online", onChange);
    document.addEventListener("visibilitychange", onVisible);
    onChange();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
      unsubscribe();
      window.removeEventListener("online", onChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [householdId, queryClient]);
}

export function useShoppingRealtime() {
  const householdId = useMe()?.activeHouseholdId;
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!householdId) return;
    const stream = new EventSource("/api/shopping/stream");
    const invalidate = () =>
      void queryClient.invalidateQueries({
        queryKey: ["shopping", householdId],
      });
    stream.addEventListener("list", invalidate);
    // Reconcile changes missed while disconnected as soon as the new subscription is ready.
    stream.addEventListener("ready", invalidate);
    return () => stream.close();
  }, [householdId, queryClient]);
}
