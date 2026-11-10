import { createFileRoute } from "@tanstack/react-router";
import { ShoppingBasket } from "lucide-react";
import { useRef, useState } from "react";
import { EmptyState, PageHeader } from "@/components/page";
import { RecipePicker } from "@/components/queue/recipe-picker";
import { AddRecipeToList } from "@/components/shopping/add-recipe";
import { ItemForm } from "@/components/shopping/item-form";
import { ItemTiles } from "@/components/shopping/item-tiles";
import {
  CreateListForm,
  ListManager,
} from "@/components/shopping/list-manager";
import { QuickAdd } from "@/components/shopping/quick-add";
import { ShoppingItems } from "@/components/shopping/shopping-items";
import { StoreSelect } from "@/components/shopping/store-select";
import { StoreSessionChip } from "@/components/shopping/store-session";
import { ShoppingSyncStatus } from "@/components/shopping/sync-status";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api-error";
import { useMe } from "@/lib/session";
import {
  useShoppingCategories,
  useShoppingList,
  useShoppingLists,
} from "@/lib/shopping";
import { useStoreSession, useWakeLock } from "@/lib/shopping-session";
import { useShoppingRealtime } from "@/lib/shopping-sync";
import { useStoreOrder, useStores } from "@/lib/stores";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/list")({
  // `?add=1` (PWA shortcut) focuses the quick-add field.
  validateSearch: (search: Record<string, unknown>): { add?: boolean } =>
    search.add ? { add: true } : {},
  component: List,
});

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
  const quickSheet = useRef<HTMLDialogElement>(null);
  const recipeSheet = useRef<HTMLDialogElement>(null);
  const session = useStoreSession(listId);
  const { add } = Route.useSearch();
  const tripStore = stores.data?.find((item) => item.id === session.storeId);
  const store =
    tripStore ??
    stores.data?.find((item) => item.id === detail.data?.defaultStoreId);
  const learned = useStoreOrder(store?.id ?? "");
  useWakeLock(!!tripStore);
  const open = detail.data?.items.filter((item) => !item.checked).length ?? 0;
  const total = detail.data?.items.length ?? 0;
  return (
    <>
      <PageHeader title={m["shopping.title"]()} />
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
        <div className="shopping-page">
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
          >
            <StoreSessionChip
              storeId={tripStore?.id ?? null}
              stores={stores.data ?? []}
              onChoose={session.choose}
            />
          </ListManager>
          <QuickAdd
            key={`add-${listId}`}
            autoFocus={add}
            listId={listId}
            onTiles={() => quickSheet.current?.showModal()}
          />
          {total > 0 && (
            <div className="list-progress">
              <div className="list-progress-row">
                <ShoppingSyncStatus listId={listId} />
                <span className="meta">
                  {m["shopping.list_progress"]({ done: total - open, total })}
                </span>
              </div>
              <progress
                className="progress-bar"
                max={total}
                value={total - open}
                aria-label={m["shopping.progress_label"]()}
              />
            </div>
          )}
          {total === 0 && <ShoppingSyncStatus listId={listId} />}
          {learned.isError && (
            <p className="form-error" role="alert">
              {errorMessage(learned.error)}
            </p>
          )}
          {categories.isError && (
            <p className="form-error" role="alert">
              {errorMessage(categories.error)}
            </p>
          )}
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
                categoryOrder={store?.categoryOrder}
                learned={learned.data}
                onActivity={session.touch}
                onQuickAdd={() => quickSheet.current?.showModal()}
              />
            )
          )}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            aria-haspopup="dialog"
            onClick={() => recipeSheet.current?.showModal()}
          >
            {m["shopping.add_from_recipe"]()}
          </Button>
          <Sheet ref={quickSheet} title={m["shopping.quick_sheet"]()}>
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
          </Sheet>
          <Sheet ref={recipeSheet} title={m["shopping.add_recipe"]()}>
            <RecipePicker
              renderPicked={(recipe) => (
                <AddRecipeToList
                  key={recipe.id}
                  recipeId={recipe.id}
                  servings={recipe.servings}
                />
              )}
            />
          </Sheet>
        </div>
      )}
    </>
  );
}
