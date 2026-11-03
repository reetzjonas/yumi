import { createFileRoute, Link } from "@tanstack/react-router";
import { ShoppingBasket } from "lucide-react";
import { useState } from "react";
import { EmptyState, PageHeader } from "@/components/page";
import { ItemForm } from "@/components/shopping/item-form";
import { ItemTiles } from "@/components/shopping/item-tiles";
import {
  CreateListForm,
  ListManager,
} from "@/components/shopping/list-manager";
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
      <div className="list-heading">
        <PageHeader title={m.nav_list()} />
        {listId && detail.data && (
          <Button asChild className="list-start">
            <Link to="/shop/$listId" params={{ listId }}>
              {m["shopping.start"]()}
            </Link>
          </Button>
        )}
        {listId && (
          <ListManager
            selectedId={listId}
            onSelect={setSelectedId}
            store={
              detail.data && (
                <StoreSelect
                  listId={listId}
                  storeId={detail.data.defaultStoreId}
                  stores={stores.data ?? []}
                />
              )
            }
          />
        )}
      </div>
      {lists.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : lists.isError ? (
        <p className="form-error" role="alert">
          {errorMessage(lists.error)}
        </p>
      ) : !listId ? (
        <EmptyState
          icon={ShoppingBasket}
          title={m["shopping.no_lists"]()}
          description={m["shopping.no_lists_hint"]()}
        >
          <CreateListForm onSelect={setSelectedId} />
        </EmptyState>
      ) : (
        <>
          <ShoppingSyncStatus listId={listId} />
          {categories.isError && (
            <p className="form-error" role="alert">
              {errorMessage(categories.error)}
            </p>
          )}
          <div className="list-split">
            <section className="section list-split-add">
              <h2>{m["shopping.add_item"]()}</h2>
              <QuickAdd key={listId} listId={listId} />
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
            <div className="section list-split-browse">
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
            </div>
            <div className="list-split-recurring">
              <RecurringItems key={`recurring-${listId}`} listId={listId} />
            </div>
          </div>
        </>
      )}
    </>
  );
}
