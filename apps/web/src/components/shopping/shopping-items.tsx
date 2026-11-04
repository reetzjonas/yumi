import { mergeShoppingItems, orderCategories } from "@yumi/shared";
import { ShoppingBasket, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { EmptyState } from "@/components/page";
import { ItemForm } from "@/components/shopping/item-form";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { formatQuantity, ingredientName } from "@/lib/recipes";
import {
  type Category,
  itemEvent,
  type ShoppingList,
  useShoppingEvents,
} from "@/lib/shopping";
import { m } from "@/paraglide/messages";

function RecipeSources({
  sources,
  recipes,
}: {
  sources: ShoppingList["items"][number]["sources"];
  recipes: ShoppingList["recipes"];
}) {
  const names = recipes.filter((recipe) =>
    sources.some(
      (source) => source.kind === "recipe" && source.id === recipe.id,
    ),
  );
  if (!names.length) return null;
  return (
    <span className="shopping-sources">
      {names.map((recipe) => (
        <span key={recipe.id} className="badge badge-muted">
          {recipe.title}
        </span>
      ))}
    </span>
  );
}

export function ShoppingItems({
  list,
  categories,
  categoryOrder,
  onQuickAdd,
}: {
  list: ShoppingList;
  categories: Category[];
  categoryOrder?: string[] | null;
  onQuickAdd: () => void;
}) {
  const events = useShoppingEvents(list.id);
  const sheet = useRef<HTMLDialogElement>(null);
  const [editKey, setEditKey] = useState<string | null>(null);
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
  const checkedIds = list.items
    .filter((item) => item.checked)
    .map((item) => item.id);
  const groups = [
    ...orderCategories(categories, categoryOrder),
    { id: null, nameDe: "", nameEn: "", icon: null },
  ];
  const editing = rows.find((row) => row.key === editKey);
  if (!rows.length)
    return (
      <EmptyState
        icon={ShoppingBasket}
        title={m.list_empty_title()}
        description={m["shopping.empty_hint"]()}
      >
        <Button type="button" onClick={onQuickAdd}>
          {m["shopping.quick_sheet"]()}
        </Button>
      </EmptyState>
    );

  const renderRow = (row: (typeof rows)[number]) => (
    <li key={row.key} className="list-item" data-checked={row.checked}>
      <label className="list-item-check">
        <input
          type="checkbox"
          checked={row.checked}
          disabled={events.isPending}
          onChange={() =>
            events.mutate(
              row.itemIds.map((id) =>
                itemEvent(id, row.checked ? "item_unchecked" : "item_checked"),
              ),
            )
          }
        />
        <span className="sr-only">
          {m["shopping.toggle_item"]({ name: row.label })}
        </span>
      </label>
      <button
        type="button"
        className="list-item-body"
        aria-haspopup="dialog"
        aria-label={m["shopping.edit_item"]({ name: row.label })}
        onClick={() => {
          setEditKey(row.key);
          sheet.current?.showModal();
        }}
      >
        <span className="list-item-title">
          <span className="shopping-name">{row.label}</span>{" "}
          <span className="shopping-quantity">
            {row.amounts
              .map((amount) => formatQuantity(amount.quantity, amount.unit))
              .join(" + ")}
          </span>
        </span>
        <RecipeSources sources={row.sources} recipes={list.recipes} />
        {row.itemIds.length > 1 && (
          <span className="meta">
            {m["shopping.merged"]({ count: row.itemIds.length })}
          </span>
        )}
      </button>
    </li>
  );

  return (
    <div className="shopping-items">
      {groups.map((category) => {
        const group = rows.filter(
          (row) =>
            !row.checked &&
            (category.id === null
              ? !categories.some((known) => known.id === row.categoryId)
              : row.categoryId === category.id),
        );
        if (!group.length) return null;
        return (
          <section key={category.id ?? "none"} className="shopping-category">
            <h2 className="section-label">
              {category.id
                ? ingredientName(category)
                : m["shopping.uncategorized"]()}
            </h2>
            <ul className="list-items">{group.map(renderRow)}</ul>
          </section>
        );
      })}
      {!!checkedIds.length && (
        <section className="shopping-category shopping-done">
          <div className="shopping-done-heading">
            <h2 className="section-label">
              {m["shopping.done_count"]({
                count: rows.filter((row) => row.checked).length,
              })}
            </h2>
            <Button
              variant="ghost"
              disabled={events.isPending}
              onClick={() =>
                events.mutate(
                  checkedIds.map((id) => itemEvent(id, "item_removed")),
                )
              }
            >
              {m["shopping.clear_checked"]()}
            </Button>
          </div>
          <ul className="list-items">
            {rows.filter((row) => row.checked).map(renderRow)}
          </ul>
        </section>
      )}
      <Sheet
        ref={sheet}
        title={m["shopping.edit_title"]()}
        meta={editing?.label}
        onClose={() => setEditKey(null)}
      >
        {editing && (
          <>
            {editing.itemIds.length > 1 && (
              <p className="meta">
                {m["shopping.edit_entries"]({ count: editing.itemIds.length })}
              </p>
            )}
            {list.items
              .filter((item) => editing.itemIds.includes(item.id))
              .map((item, index) => (
                <div
                  key={`${item.id}-${item.updatedAt}`}
                  className={
                    editing.itemIds.length > 1
                      ? "shopping-individual"
                      : "shopping-individual is-single"
                  }
                >
                  {editing.itemIds.length > 1 && (
                    <h3>{m["shopping.entry_number"]({ number: index + 1 })}</h3>
                  )}
                  <RecipeSources
                    sources={item.sources}
                    recipes={list.recipes}
                  />
                  <ItemForm
                    listId={list.id}
                    categories={categories}
                    item={item}
                  />
                </div>
              ))}
            {editing.itemIds.length > 1 && (
              <Button
                variant="ghost"
                className="button-danger-text"
                disabled={events.isPending}
                onClick={() =>
                  events.mutate(
                    editing.itemIds.map((id) => itemEvent(id, "item_removed")),
                    { onSuccess: () => sheet.current?.close() },
                  )
                }
              >
                <Trash2 size={18} aria-hidden="true" />
                {m["shopping.remove_all"]()}
              </Button>
            )}
          </>
        )}
      </Sheet>
    </div>
  );
}
