import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ensureOk } from "@/lib/api-error";

export function useAppVersion() {
  return useQuery({
    queryKey: ["health"],
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async () => (await ensureOk(await api.health.$get())).json(),
  }).data?.version;
}
