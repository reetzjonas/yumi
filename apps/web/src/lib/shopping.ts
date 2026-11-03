import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ShoppingEvent, shoppingEventBatchSchema } from "@yumi/shared";
import type { InferResponseType } from "hono/client";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/api-error";
import { useMe } from "@/lib/session";

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
    queryFn: async () =>
      (await ensureOk(await api.shopping.lists.$get())).json(),
  });
}

export function useShoppingCategories() {
  const householdId = useMe()?.activeHouseholdId;
  return useQuery({
    queryKey: ["shopping", householdId, "categories"],
    enabled: !!householdId,
    queryFn: async () =>
      (await ensureOk(await api.ingredients.categories.$get())).json(),
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
): ShoppingEvent {
  return {
    id: crypto.randomUUID(),
    itemId,
    clientTs: new Date().toISOString(),
    type,
  };
}

export function useShoppingEvents(listId: string) {
  const householdId = useMe()?.activeHouseholdId;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (events: ShoppingEvent[]) => {
      for (let offset = 0; offset < events.length; offset += 500) {
        const json = shoppingEventBatchSchema.parse({
          events: events.slice(offset, offset + 500),
        });
        await ensureOk(
          await api.shopping.lists[":id"].events.$post({
            param: { id: listId },
            json,
          }),
        );
      }
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ["shopping", householdId] }),
    onError: (error) => toast.error(errorMessage(error)),
  });
}
