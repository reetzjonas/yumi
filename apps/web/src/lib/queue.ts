import { useQuery } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { api } from "@/lib/api";
import { ensureOk } from "@/lib/api-error";
import { useMe } from "@/lib/session";

export type QueueEntry = InferResponseType<typeof api.queue.$get, 200>[number];
export type QueueEntryInput = InferRequestType<typeof api.queue.$post>["json"];
export type QueueEntryUpdate = InferRequestType<
  (typeof api.queue)[":id"]["$patch"]
>["json"];

export const queueKey = (householdId: string | null | undefined) =>
  ["queue", householdId] as const;

export function useQueue() {
  const householdId = useMe()?.activeHouseholdId;
  return useQuery({
    queryKey: queueKey(householdId),
    enabled: Boolean(householdId),
    queryFn: async ({ signal }) =>
      (await ensureOk(await api.queue.$get({}, { init: { signal } }))).json(),
  });
}

export async function addQueueEntry(input: QueueEntryInput) {
  await ensureOk(await api.queue.$post({ json: input }));
}

export async function updateQueueEntry(id: string, input: QueueEntryUpdate) {
  await ensureOk(await api.queue[":id"].$patch({ param: { id }, json: input }));
}

export async function reorderQueue(ids: string[]) {
  await ensureOk(await api.queue.order.$put({ json: { ids } }));
}
