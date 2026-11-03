import {
  type QueryClient,
  queryOptions,
  useQuery,
} from "@tanstack/react-query";
import { api } from "@/lib/api";
import { clearOutbox } from "@/lib/outbox";
import { clearApiCache } from "@/lib/pwa-cache";

async function fetchMe() {
  const res = await api.me.$get();
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`me failed: ${res.status}`);
  return res.json();
}

export type Me = NonNullable<Awaited<ReturnType<typeof fetchMe>>>;

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: fetchMe,
  staleTime: 60_000,
  networkMode: "offlineFirst",
});

export function useMe() {
  return useQuery(meQuery).data ?? null;
}

/**
 * Drops every cached server read. Call after sign-in/out and household switches so no data of
 * another account or household is shown.
 */
export async function resetClientState(queryClient: QueryClient) {
  const me = queryClient.getQueryData(meQuery.queryKey);
  await clearOutbox(me?.activeHouseholdId ?? undefined);
  await clearApiCache();
  // resetQueries drops cached data and refetches mounted queries (clear() would orphan them)
  await queryClient.resetQueries();
}

/** Only allow same-origin relative redirect targets. */
export function safeRedirect(target: unknown): string | undefined {
  return typeof target === "string" &&
    target.startsWith("/") &&
    !target.startsWith("//")
    ? target
    : undefined;
}
