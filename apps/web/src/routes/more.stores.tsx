import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Store as StoreIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/auth-layout";
import { BackLink, EmptyState, PageHeader } from "@/components/page";
import { StoreEditor } from "@/components/stores/store-editor";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/api-error";
import { useMe } from "@/lib/session";
import { useShoppingCategories } from "@/lib/shopping";
import { useStores } from "@/lib/stores";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/more/stores")({ component: Stores });

function Stores() {
  const householdId = useMe()?.activeHouseholdId;
  const queryClient = useQueryClient();
  const stores = useStores();
  const categories = useShoppingCategories();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: async () =>
      (
        await ensureOk(
          await api.stores.$post({
            json: { name: name.trim(), categoryOrder: [] },
          }),
        )
      ).json(),
    onSuccess: async (store) => {
      setName("");
      await queryClient.invalidateQueries({
        queryKey: ["stores", householdId],
      });
      setEditing(store.id);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const error = stores.error ?? categories.error;
  return (
    <div className="settings-page">
      <PageHeader
        title={m["stores.title"]()}
        back={<BackLink to="/more" label={m.nav_more()} />}
      />
      <section className="section">
        <h2>{m["stores.create"]()}</h2>
        <p className="section-description">{m["stores.description"]()}</p>
        <form
          className="shopping-list-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <Field
            id="store-name"
            label={m["stores.name"]()}
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
          />
          <Button disabled={create.isPending || !name.trim()}>
            {m["stores.create"]()}
          </Button>
        </form>
      </section>
      {error ? (
        <p className="form-error" role="alert">
          {errorMessage(error)}
        </p>
      ) : !stores.data || !categories.data ? (
        <Skeleton className="h-32 w-full" />
      ) : !stores.data.length ? (
        <EmptyState
          icon={StoreIcon}
          title={m["stores.empty"]()}
          description={m["stores.empty_hint"]()}
        />
      ) : (
        <section className="section">
          <h2>{m["stores.title"]()}</h2>
          <ul className="row-list store-list">
            {stores.data.map((store) => (
              <li key={store.id} className="store-entry">
                <div className="row">
                  <StoreIcon aria-hidden="true" size={20} />
                  <div className="row-main">
                    <span className="row-title">{store.name}</span>
                    <span className="row-detail">
                      {store.categoryOrder?.length
                        ? m["stores.custom_order"]()
                        : m["stores.default_order"]()}
                    </span>
                  </div>
                  <Button
                    variant="secondary"
                    aria-expanded={editing === store.id}
                    onClick={() =>
                      setEditing(editing === store.id ? null : store.id)
                    }
                  >
                    {m["recipes.edit"]()}
                  </Button>
                </div>
                {editing === store.id && (
                  <StoreEditor
                    store={store}
                    categories={categories.data}
                    onDone={() => setEditing(null)}
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
