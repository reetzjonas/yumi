import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, Megaphone, Plus, ShoppingBasket } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
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
import { announceShoppingTrip, usePushKey } from "@/lib/push";
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
  const pushKey = usePushKey();
  const trip = useMutation({
    mutationFn: () => announceShoppingTrip(listId),
    onSuccess: ({ sent }) =>
      toast.success(sent > 0 ? m["push.trip_sent"]() : m["push.trip_nobody"]()),
    onError: (error) => toast.error(errorMessage(error)),
  });
  const tripStore = stores.data?.find((item) => item.id === session.storeId);
  const store =
    tripStore ??
    stores.data?.find((item) => item.id === detail.data?.defaultStoreId);
  const learned = useStoreOrder(store?.id ?? "");
  useWakeLock(!!tripStore);
  const open = detail.data?.items.filter((item) => !item.checked).length ?? 0;
  const total = detail.data?.items.length ?? 0;
  const listName = lists.data?.find((list) => list.id === listId)?.name;
  const openAdd = () => quickSheet.current?.showModal();
  const addOnce = useRef(false);
  useEffect(() => {
    // `?add=1` (app shortcut, push notification) starts with the add sheet.
    if (add && listId && !addOnce.current) {
      addOnce.current = true;
      quickSheet.current?.showModal();
    }
  }, [add, listId]);
  return (
    <>
      <PageHeader
        title={listName ?? m["shopping.title"]()}
        eyebrow={
          listId && (
            <StoreSessionChip
              storeId={tripStore?.id ?? null}
              stores={stores.data ?? []}
              onChoose={session.choose}
            />
          )
        }
        actions={
          listId && (
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
          )
        }
      />
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
          {total === 0 ? (
            <ShoppingSyncStatus listId={listId} />
          ) : (
            <div className="list-progress">
              <div className="list-progress-text">
                {m["shopping.list_remaining"]({ open, total })}
                <ShoppingSyncStatus listId={listId} />
              </div>
              <progress
                max={total}
                value={total - open}
                aria-label={m["shopping.progress_label"]()}
              />
            </div>
          )}
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
                onQuickAdd={openAdd}
              />
            )
          )}
          <div className="list-extras">
            <Button
              type="button"
              variant="outline"
              aria-haspopup="dialog"
              onClick={() => recipeSheet.current?.showModal()}
            >
              <BookOpen size={20} aria-hidden="true" />
              {m["shopping.add_from_recipe"]()}
            </Button>
            {pushKey.data && (
              <Button
                type="button"
                variant="outline"
                disabled={trip.isPending}
                onClick={() => trip.mutate()}
              >
                <Megaphone size={20} aria-hidden="true" />
                {m["push.going_shopping"]()}
              </Button>
            )}
          </div>
          <button
            type="button"
            className="add-dock"
            aria-haspopup="dialog"
            onClick={openAdd}
          >
            <span>{m["shopping.quick_placeholder"]()}</span>
            <span className="add-dock-plus">
              <Plus size={22} aria-hidden="true" />
            </span>
          </button>
          <Sheet ref={quickSheet} title={m["shopping.quick_sheet"]()}>
            <QuickAdd key={`add-${listId}`} listId={listId} autoFocus />
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
