import { createFileRoute, Link } from "@tanstack/react-router";
import {
  type MergedItem,
  mergeShoppingItems,
  orderCategories,
} from "@yumi/shared";
import { ArrowLeft, Check, Circle, ShoppingBasket } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, PageHeader } from "@/components/page";
import { ShoppingSyncStatus } from "@/components/shopping/sync-status";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api-error";
import { formatQuantity, ingredientName } from "@/lib/recipes";
import { useMe } from "@/lib/session";
import {
  itemEvent,
  type ShoppingList,
  useShoppingCategories,
  useShoppingEvents,
  useShoppingList,
} from "@/lib/shopping";
import { useShoppingRealtime } from "@/lib/shopping-sync";
import { useStores } from "@/lib/stores";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/shop/$listId")({
  component: ShoppingMode,
});

function ShoppingMode() {
  const { listId } = Route.useParams();
  const householdId = useMe()?.activeHouseholdId;
  useShoppingRealtime();
  const detail = useShoppingList(listId);
  return (
    <>
      <PageHeader title={detail.data?.name ?? m["shopping.mode"]()}>
        <Link to="/list" className="back-link">
          <ArrowLeft aria-hidden="true" size={18} />
          {m["shopping.exit"]()}
        </Link>
      </PageHeader>
      <ShoppingSyncStatus listId={listId} />
      {detail.data ? (
        <FocusedList key={`${householdId}-${listId}`} list={detail.data} />
      ) : detail.isError ? (
        <p className="form-error" role="alert">
          {errorMessage(detail.error)}
        </p>
      ) : (
        <Skeleton className="h-32 w-full" />
      )}
    </>
  );
}

function FocusedList({ list }: { list: ShoppingList }) {
  const stores = useStores();
  const categories = useShoppingCategories();
  const events = useShoppingEvents(list.id);
  const [storeId, setStoreId] = useState(list.defaultStoreId ?? "");
  const rows = mergeShoppingItems(
    list.items.map((item) => ({
      ...item,
      label: item.ingredient ? ingredientName(item.ingredient) : item.label,
      factors: item.ingredient
        ? {
            densityGPerMl: item.ingredient.densityGPerMl,
            pieceWeightG: item.ingredient.pieceWeightG,
          }
        : undefined,
    })),
  );
  const checked = rows.filter((row) => row.checked);
  const checkedCount = list.items.filter((item) => item.checked).length;
  const groups = [
    ...orderCategories(
      categories.data ?? [],
      stores.data?.find((store) => store.id === storeId)?.categoryOrder,
    ),
    { id: null, nameDe: "", nameEn: "", icon: null },
  ];

  function toggle(row: MergedItem) {
    const selectedStore = storeId || null;
    const type = row.checked ? "item_unchecked" : "item_checked";
    // Preserve the pre-toggle selection, even if the shopper changes stores before undo.
    const inverse = row.checked ? "item_checked" : "item_unchecked";
    events.mutate(
      row.itemIds.map((id) => itemEvent(id, type, selectedStore)),
      {
        onSuccess: () =>
          toast(
            row.checked
              ? m["shopping.unchecked_toast"]({ name: row.label })
              : m["shopping.checked_toast"]({ name: row.label }),
            {
              action: {
                label: m["shopping.undo"](),
                onClick: () =>
                  events.mutate(
                    row.itemIds.map((id) =>
                      itemEvent(id, inverse, selectedStore),
                    ),
                  ),
              },
            },
          ),
      },
    );
  }

  function renderRows(items: MergedItem[]) {
    return (
      <ul className="row-list">
        {items.map((row) => (
          <li key={row.key}>
            <button
              type="button"
              className="shopping-focus-row"
              aria-pressed={row.checked}
              aria-label={m["shopping.toggle_item"]({ name: row.label })}
              disabled={events.isPending}
              onClick={() => toggle(row)}
            >
              {row.checked ? (
                <Check aria-hidden="true" size={26} />
              ) : (
                <Circle aria-hidden="true" size={26} />
              )}
              <span>
                {row.amounts
                  .map((amount) => formatQuantity(amount.quantity, amount.unit))
                  .join(" + ")}{" "}
                {row.label}
              </span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="shopping-focus">
      <section className="section shopping-store-picker">
        <div className="field">
          <label htmlFor="shopping-trip-store">
            {m["shopping.trip_store"]()}
          </label>
          <select
            id="shopping-trip-store"
            value={storeId}
            onChange={(event) => setStoreId(event.target.value)}
          >
            <option value="">{m["stores.no_store"]()}</option>
            {stores.data?.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </div>
        {stores.isError && (
          <p className="form-error" role="alert">
            {errorMessage(stores.error)}
          </p>
        )}
      </section>
      <div className="shopping-progress">
        <p aria-live="polite">
          {m["shopping.progress"]({
            checked: checkedCount,
            total: list.items.length,
          })}
        </p>
        <progress
          value={checkedCount}
          max={list.items.length || 1}
          aria-label={m["shopping.progress"]({
            checked: checkedCount,
            total: list.items.length,
          })}
        />
      </div>
      {!rows.length ? (
        <EmptyState
          icon={ShoppingBasket}
          title={m.list_empty_title()}
          description={m["shopping.empty_hint"]()}
        />
      ) : (
        <>
          {categories.isError && (
            <p className="form-error" role="alert">
              {errorMessage(categories.error)}
            </p>
          )}
          {groups.map((category) => {
            const group = rows.filter(
              (row) =>
                !row.checked &&
                (category.id === null
                  ? !categories.data?.some(
                      (known) => known.id === row.categoryId,
                    )
                  : row.categoryId === category.id),
            );
            if (!group.length) return null;
            return (
              <section key={category.id ?? "none"} className="section">
                <h2>
                  {category.icon && `${category.icon} `}
                  {category.id
                    ? ingredientName(category)
                    : m["shopping.uncategorized"]()}
                </h2>
                {renderRows(group)}
              </section>
            );
          })}
          {checked.length > 0 && (
            <details className="shopping-checked">
              <summary>
                {m["shopping.checked_count"]({ count: checkedCount })}
              </summary>
              {renderRows(checked)}
            </details>
          )}
        </>
      )}
    </div>
  );
}
