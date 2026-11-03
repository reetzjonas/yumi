import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/api-error";
import { useMe } from "@/lib/session";
import type { Store } from "@/lib/stores";
import { m } from "@/paraglide/messages";

export function StoreSelect({
  listId,
  storeId,
  stores,
}: {
  listId: string;
  storeId: string | null;
  stores: Store[];
}) {
  const householdId = useMe()?.activeHouseholdId;
  const queryClient = useQueryClient();
  const assign = useMutation({
    mutationFn: async (next: string | null) =>
      ensureOk(
        await api.shopping.lists[":id"].store.$put({
          param: { id: listId },
          json: { storeId: next },
        }),
      ),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ["shopping", householdId] }),
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <section className="section shopping-manager">
      <div className="field">
        <label htmlFor="shopping-store">{m["stores.list_store"]()}</label>
        <select
          id="shopping-store"
          value={storeId ?? ""}
          disabled={assign.isPending}
          onChange={(event) => assign.mutate(event.target.value || null)}
        >
          <option value="">{m["stores.no_store"]()}</option>
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </select>
      </div>
      <Link to="/more/stores" className="text-link">
        {m["stores.manage"]()}
      </Link>
    </section>
  );
}
