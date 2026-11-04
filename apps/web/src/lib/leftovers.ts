import { useQuery } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { api } from "@/lib/api";
import { ensureOk } from "@/lib/api-error";
import { useMe } from "@/lib/session";

export type Leftover = InferResponseType<
  typeof api.leftovers.$get,
  200
>[number];
export type LeftoverSuggestion = InferResponseType<
  typeof api.leftovers.suggestions.$get,
  200
>[number];
type LeftoverUpdate = InferRequestType<
  (typeof api.leftovers)[":id"]["$patch"]
>["json"];

export const leftoversKey = (householdId: string | null | undefined) =>
  ["leftovers", householdId] as const;

export function useLeftovers() {
  const householdId = useMe()?.activeHouseholdId;
  return useQuery({
    queryKey: [...leftoversKey(householdId), "list"],
    enabled: Boolean(householdId),
    queryFn: async ({ signal }) =>
      (
        await ensureOk(await api.leftovers.$get({}, { init: { signal } }))
      ).json(),
  });
}

export function useLeftoverSuggestions(similar: boolean) {
  const householdId = useMe()?.activeHouseholdId;
  return useQuery({
    queryKey: [...leftoversKey(householdId), "suggestions", similar],
    enabled: Boolean(householdId),
    queryFn: async ({ signal }) =>
      (
        await ensureOk(
          await api.leftovers.suggestions.$get(
            { query: { similar: similar ? "true" : "false" } },
            { init: { signal } },
          ),
        )
      ).json(),
  });
}

export async function updateLeftover(id: string, input: LeftoverUpdate) {
  await ensureOk(
    await api.leftovers[":id"].$patch({ param: { id }, json: input }),
  );
}

export async function dismissLeftover(id: string) {
  await ensureOk(await api.leftovers[":id"].$delete({ param: { id } }));
}
