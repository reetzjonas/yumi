import { createFileRoute, Link } from "@tanstack/react-router";
import { ShoppingBasket } from "lucide-react";
import { useState } from "react";
import { EmptyState, PageHeader } from "@/components/page";
import { ItemForm } from "@/components/shopping/item-form";
import { ItemTiles } from "@/components/shopping/item-tiles";
import { ListManager } from "@/components/shopping/list-manager";
import { QuickAdd } from "@/components/shopping/quick-add";
import { RecurringItems } from "@/components/shopping/recurring-items";
import { ShoppingItems } from "@/components/shopping/shopping-items";
import { StoreSelect } from "@/components/shopping/store-select";
import { ShoppingSyncStatus } from "@/components/shopping/sync-status";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api-error";
import { useMe } from "@/lib/session";
import {
  useShoppingCategories,
  useShoppingList,
  useShoppingLists,
} from "@/lib/shopping";
import { useShoppingRealtime } from "@/lib/shopping-sync";
import { useStores } from "@/lib/stores";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/list")({ component: List });

function List() {
  const householdId = useMe()?.activeHouseholdId;
  return <HouseholdLists key={householdId} />;
}

function HouseholdLists() {
  useShoppingRealtime();
  const lists = useShoppingLists();
  const categories = useShoppingCategories();
  const stores = useStores();
  const [selectedId, setSelectedId] = useState("");
  const listId = lists.data?.some((list) => list.id === selectedId)
    ? selectedId
    : (lists.data?.[0]?.id ?? "");
  const detail = useShoppingList(listId);
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
              <ShoppingSyncStatus listId={listId} />
              {detail.data && (
                <Button asChild>
                  <Link to="/shop/$listId" params={{ listId }}>
                    {m["shopping.start"]()}
                  </Link>
                </Button>
              )}
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
              <div className="list-split">
                <section className="section list-split-add">
                  <h2>{m["shopping.add_item"]()}</h2>
                  <QuickAdd key={listId} listId={listId} />
                  {detail.data && (
                    <ItemTiles
                      key={`tiles-${listId}`}
                      list={detail.data}
                      categories={categories.data ?? []}
                    />
                  )}
                  <details className="shopping-catalog">
                    <summary>{m["shopping.more_options"]()}</summary>
                    <ItemForm
                      key={listId}
                      listId={listId}
                      categories={categories.data ?? []}
                    />
                  </details>
                </section>
                <div className="list-split-items">
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
                </div>
                <div className="list-split-recurring">
                  <RecurringItems key={`recurring-${listId}`} listId={listId} />
                </div>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
