import { useQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api } from "@/lib/api";
import { ensureOk } from "@/lib/api-error";
import { useMe } from "@/lib/session";

export type Store = InferResponseType<typeof api.stores.$get, 200>[number];

export function useStores() {
  const householdId = useMe()?.activeHouseholdId;
  return useQuery({
    queryKey: ["stores", householdId],
    enabled: !!householdId,
    queryFn: async () => (await ensureOk(await api.stores.$get())).json(),
  });
}
