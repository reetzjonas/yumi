import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  type MergedItem,
  mergeShoppingItems,
  sortShoppingItems,
} from "@yumi/shared";
import { Check, ShoppingBasket, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/page";
import { ShoppingSyncStatus } from "@/components/shopping/sync-status";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
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
import { useStoreOrder, useStores } from "@/lib/stores";
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
    <main className="mode-view">
      {detail.data ? (
        <FocusedList key={`${householdId}-${listId}`} list={detail.data} />
      ) : (
        <>
          <ModeHeader title={m["shopping.mode"]()} />
          <div className="mode-body">
            {detail.isError ? (
              <p className="form-error" role="alert">
                {errorMessage(detail.error)}
              </p>
            ) : (
              <Skeleton className="h-32 w-full" />
            )}
          </div>
        </>
      )}
      <Toaster />
    </main>
  );
}

function ModeHeader({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="mode-header">
      <Button asChild variant="ghost" className="icon-action">
        <Link to="/list" aria-label={m["shopping.exit"]()}>
          <X size={24} aria-hidden="true" />
        </Link>
      </Button>
      <div className="mode-title">
        <h1>{title}</h1>
        {children}
      </div>
    </header>
  );
}

function FocusedList({ list }: { list: ShoppingList }) {
  const navigate = useNavigate();
  const stores = useStores();
  const categories = useShoppingCategories();
  const events = useShoppingEvents(list.id);
  const [storeId, setStoreId] = useState(list.defaultStoreId ?? "");
  const learned = useStoreOrder(storeId);
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
  const checkedIds = list.items
    .filter((item) => item.checked)
    .map((item) => item.id);
  const ordered = sortShoppingItems(
    rows.filter((row) => !row.checked),
    categories.data ?? [],
    stores.data?.find((store) => store.id === storeId)?.categoryOrder,
    learned.data ?? { ingredients: [], categories: [] },
  );
  const runs: { categoryId: string | null; rows: MergedItem[] }[] = [];
  for (const row of ordered) {
    const last = runs.at(-1);
    if (last && last.categoryId === row.categoryId) last.rows.push(row);
    else runs.push({ categoryId: row.categoryId, rows: [row] });
  }
  const categoryName = (id: string | null) => {
    const category = categories.data?.find((item) => item.id === id);
    return category ? ingredientName(category) : m["shopping.uncategorized"]();
  };

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
      <ul className="mode-rows">
        {items.map((row) => (
          <li key={row.key}>
            <button
              type="button"
              className="mode-row"
              aria-pressed={row.checked}
              aria-label={m["shopping.toggle_item"]({ name: row.label })}
              disabled={events.isPending}
              onClick={() => toggle(row)}
            >
              <span className="mode-box" aria-hidden="true">
                {row.checked && <Check size={20} strokeWidth={3} />}
              </span>
              <span className="mode-row-name">{row.label}</span>
              <span className="mode-row-quantity">
                {row.amounts
                  .map((amount) => formatQuantity(amount.quantity, amount.unit))
                  .join(" + ")}
              </span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      <ModeHeader title={list.name}>
        <p className="mode-subtitle">
          <label htmlFor="shopping-trip-store" className="sr-only">
            {m["shopping.trip_store"]()}
          </label>
          <select
            id="shopping-trip-store"
            className="mode-store"
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
          <span aria-live="polite">
            {" · "}
            {m["shopping.progress"]({
              checked: checkedIds.length,
              total: list.items.length,
            })}
          </span>
        </p>
      </ModeHeader>
      <progress
        className="progress-bar mode-progress"
        value={checkedIds.length}
        max={list.items.length || 1}
        aria-label={m["shopping.progress_label"]()}
      />
      <div className="mode-body">
        <ShoppingSyncStatus listId={list.id} />
        {stores.isError && (
          <p className="form-error" role="alert">
            {errorMessage(stores.error)}
          </p>
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
        {!rows.length ? (
          <EmptyState
            icon={ShoppingBasket}
            title={m.list_empty_title()}
            description={m["shopping.empty_hint"]()}
          />
        ) : (
          <>
            {runs.map((run) => (
              <section key={run.rows[0]?.key} className="mode-group">
                <h2 className="section-label">
                  {categoryName(run.categoryId)}
                </h2>
                {renderRows(run.rows)}
              </section>
            ))}
            {ordered.length === 0 && (
              <EmptyState
                icon={Check}
                title={m["shopping.all_done_title"]()}
                description={m["shopping.all_done_hint"]()}
              />
            )}
            {checked.length > 0 && (
              <section className="mode-group mode-done">
                <h2 className="section-label">
                  {m["shopping.in_cart"]({ count: checkedIds.length })}
                </h2>
                {renderRows(checked)}
              </section>
            )}
            <p className="meta">{m["stores.learning_hint"]()}</p>
          </>
        )}
      </div>
      <footer className="mode-footer">
        <Button
          type="button"
          variant="outline"
          disabled={events.isPending || checkedIds.length === 0}
          onClick={() =>
            events.mutate(checkedIds.map((id) => itemEvent(id, "item_removed")))
          }
        >
          {m["shopping.clear_done"]()}
        </Button>
        <Button type="button" onClick={() => void navigate({ to: "/list" })}>
          {m["shopping.finish"]()}
        </Button>
      </footer>
    </>
  );
}
