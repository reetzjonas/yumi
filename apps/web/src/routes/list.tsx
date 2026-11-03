import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ShoppingBasket } from "lucide-react";
import { useState } from "react";
import { EmptyState, PageHeader } from "@/components/page";
import { ItemForm } from "@/components/shopping/item-form";
import { ListManager } from "@/components/shopping/list-manager";
import { ShoppingItems } from "@/components/shopping/shopping-items";
import { StoreSelect } from "@/components/shopping/store-select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/api-error";
import { useMe } from "@/lib/session";
import { useShoppingCategories, useShoppingLists } from "@/lib/shopping";
import { useStores } from "@/lib/stores";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/list")({ component: List });

function List() {
  const householdId = useMe()?.activeHouseholdId;
  return <HouseholdLists key={householdId} />;
}

function HouseholdLists() {
  const householdId = useMe()?.activeHouseholdId;
  const lists = useShoppingLists();
  const categories = useShoppingCategories();
  const stores = useStores();
  const [selectedId, setSelectedId] = useState("");
  const listId = lists.data?.some((list) => list.id === selectedId)
    ? selectedId
    : (lists.data?.[0]?.id ?? "");
  const detail = useQuery({
    queryKey: ["shopping", householdId, "detail", listId],
    enabled: !!householdId && !!listId,
    queryFn: async () =>
      (
        await ensureOk(
          await api.shopping.lists[":id"].$get({ param: { id: listId } }),
        )
      ).json(),
  });
  return (
    <>
      <PageHeader title={m.nav_list()} />
      {lists.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : lists.isError ? (
        <p className="form-error" role="alert">
          {errorMessage(lists.error)}
        </p>
      ) : (
        <>
          <ListManager selectedId={listId} onSelect={setSelectedId} />
          {!listId ? (
            <EmptyState
              icon={ShoppingBasket}
              title={m["shopping.no_lists"]()}
              description={m["shopping.no_lists_hint"]()}
            />
          ) : (
            <>
              {categories.isError && (
                <p className="form-error" role="alert">
                  {errorMessage(categories.error)}
                </p>
              )}
              {detail.data && (
                <StoreSelect
                  listId={listId}
                  storeId={detail.data.defaultStoreId}
                  stores={stores.data ?? []}
                />
              )}
              <section className="section">
                <h2>{m["shopping.add_item"]()}</h2>
                <ItemForm
                  key={listId}
                  listId={listId}
                  categories={categories.data ?? []}
                />
              </section>
              {detail.isPending ? (
                <Skeleton className="h-32 w-full" />
              ) : detail.isError ? (
                <p className="form-error" role="alert">
                  {errorMessage(detail.error)}
                </p>
              ) : (
                detail.data && (
                  <ShoppingItems
                    key={listId}
                    list={detail.data}
                    categories={categories.data ?? []}
                    categoryOrder={
                      stores.data?.find(
                        (store) => store.id === detail.data.defaultStoreId,
                      )?.categoryOrder
                    }
                  />
                )
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
