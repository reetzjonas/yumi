import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ShoppingEvent, shoppingEventBatchSchema } from "@yumi/shared";
import type { InferResponseType } from "hono/client";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/api-error";
import { enqueueEvents, loadOutbox, pendingRecords } from "@/lib/outbox";
import { useMe } from "@/lib/session";
import { applyShoppingEvents } from "@/lib/shopping-optimistic";
import { useOutboxRevision } from "@/lib/shopping-sync";

export type ShoppingList = InferResponseType<
  (typeof api.shopping.lists)[":id"]["$get"],
  200
>;
export type ShoppingItem = ShoppingList["items"][number];
export type Category = InferResponseType<
  typeof api.ingredients.categories.$get,
  200
>[number];
export type CatalogIngredient = InferResponseType<
  typeof api.ingredients.$get,
  200
>[number];

export function useShoppingLists() {
  const householdId = useMe()?.activeHouseholdId;
  return useQuery({
    queryKey: ["shopping", householdId, "lists"],
    enabled: !!householdId,
    networkMode: "offlineFirst",
    queryFn: async () =>
      (await ensureOk(await api.shopping.lists.$get())).json(),
  });
}

export function useShoppingCategories() {
  const householdId = useMe()?.activeHouseholdId;
  return useQuery({
    queryKey: ["shopping", householdId, "categories"],
    enabled: !!householdId,
    networkMode: "offlineFirst",
    queryFn: async () =>
      (await ensureOk(await api.ingredients.categories.$get())).json(),
  });
}

export function useShoppingList(listId: string) {
  const householdId = useMe()?.activeHouseholdId;
  useOutboxRevision();
  return useQuery({
    queryKey: ["shopping", householdId, "detail", listId],
    enabled: !!householdId && !!listId,
    networkMode: "offlineFirst",
    queryFn: async () => {
      await loadOutbox();
      const list = await (
        await ensureOk(
          await api.shopping.lists[":id"].$get({ param: { id: listId } }),
        )
      ).json();
      return applyShoppingEvents(
        list,
        pendingRecords(householdId ?? "", listId).map((record) => record.event),
      );
    },
    select: (list) =>
      applyShoppingEvents(
        list,
        pendingRecords(householdId ?? "", listId).map((record) => record.event),
      ),
  });
}

export function addItemEvent(
  payload: Extract<ShoppingEvent, { type: "item_added" }>["payload"],
): ShoppingEvent {
  return {
    id: crypto.randomUUID(),
    itemId: crypto.randomUUID(),
    clientTs: new Date().toISOString(),
    type: "item_added",
    payload,
  };
}

export function itemEvent(
  itemId: string,
  type: "item_checked" | "item_unchecked" | "item_removed",
  storeId: string | null = null,
): ShoppingEvent {
  return {
    id: crypto.randomUUID(),
    itemId,
    clientTs: new Date().toISOString(),
    type,
    storeId,
  };
}

export function useShoppingEvents(listId: string) {
  const householdId = useMe()?.activeHouseholdId;
  const queryClient = useQueryClient();
  return useMutation({
    networkMode: "always",
    mutationFn: async (events: ShoppingEvent[]) => {
      if (!householdId) throw new Error("no_active_household");
      const parsed: ShoppingEvent[] = [];
      for (let offset = 0; offset < events.length; offset += 500) {
        parsed.push(
          ...shoppingEventBatchSchema.parse({
            events: events.slice(offset, offset + 500),
          }).events,
        );
      }
      await enqueueEvents(householdId, listId, parsed);
      await queryClient.cancelQueries({
        queryKey: ["shopping", householdId, "detail", listId],
      });
      queryClient.setQueryData<ShoppingList>(
        ["shopping", householdId, "detail", listId],
        (list) => list && applyShoppingEvents(list, parsed),
      );
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}
