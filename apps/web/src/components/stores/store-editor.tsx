import { useMutation, useQueryClient } from "@tanstack/react-query";
import { orderCategories } from "@yumi/shared";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/auth-layout";
import { CategoryOrder } from "@/components/stores/category-order";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/api-error";
import { useMe } from "@/lib/session";
import type { Category } from "@/lib/shopping";
import type { Store } from "@/lib/stores";
import { m } from "@/paraglide/messages";

export function StoreEditor({
  store,
  categories,
  onDone,
}: {
  store: Store;
  categories: Category[];
  onDone: () => void;
}) {
  const id = useId();
  const householdId = useMe()?.activeHouseholdId;
  const queryClient = useQueryClient();
  const defaultOrder = orderCategories(categories, null).map((c) => c.id);
  const [name, setName] = useState(store.name);
  const [order, setOrder] = useState(() =>
    orderCategories(categories, store.categoryOrder).map((c) => c.id),
  );
  const isDefault = order.join() === defaultOrder.join();
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["stores", householdId] }),
      queryClient.invalidateQueries({ queryKey: ["shopping", householdId] }),
    ]);
  const save = useMutation({
    mutationFn: async () =>
      ensureOk(
        await api.stores[":id"].$put({
          param: { id: store.id },
          json: { name: name.trim(), categoryOrder: isDefault ? [] : order },
        }),
      ),
    onSuccess: async () => {
      await invalidate();
      toast.success(m["stores.saved"]());
      onDone();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: async () =>
      ensureOk(await api.stores[":id"].$delete({ param: { id: store.id } })),
    onSuccess: async () => {
      await invalidate();
      onDone();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const busy = save.isPending || remove.isPending;
  return (
    <form
      className="store-editor"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) save.mutate();
      }}
    >
      <Field
        id={`${id}-name`}
        label={m["stores.name"]()}
        value={name}
        required
        maxLength={60}
        onChange={(event) => setName(event.target.value)}
      />
      <div className="store-order-heading">
        <h3>{m["stores.category_order"]()}</h3>
        <p className="muted">{m["stores.category_order_hint"]()}</p>
      </div>
      <CategoryOrder
        categories={categories}
        order={order}
        onChange={setOrder}
      />
      <div className="recipe-actions">
        <Button disabled={busy || !name.trim()}>{m["shopping.save"]()}</Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy || isDefault}
          onClick={() => setOrder(defaultOrder)}
        >
          {m["stores.reset_order"]()}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onDone}>
          {m["stores.cancel"]()}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            if (
              window.confirm(m["stores.delete_confirm"]({ name: store.name }))
            )
              remove.mutate();
          }}
        >
          {m["stores.delete"]()}
        </Button>
      </div>
    </form>
  );
}
