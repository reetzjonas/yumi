import { Link } from "@tanstack/react-router";
import { mergeShoppingItems } from "@yumi/shared";
import { ShoppingBasket } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/page";
import { ItemForm } from "@/components/shopping/item-form";
import { Button } from "@/components/ui/button";
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
  return (
    <div className="shopping-sources row-detail">
      {recipes
        .filter((recipe) =>
          sources.some(
            (source) => source.kind === "recipe" && source.id === recipe.id,
          ),
        )
        .map((recipe) => (
          <Link key={recipe.id} to="/recipes/$id" params={{ id: recipe.id }}>
            {recipe.title}
          </Link>
        ))}
    </div>
  );
}

export function ShoppingItems({
  list,
  categories,
}: {
  list: ShoppingList;
  categories: Category[];
}) {
  const events = useShoppingEvents(list.id);
  const [expanded, setExpanded] = useState<string | null>(null);
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
    ...[...categories].sort((a, b) => a.defaultPosition - b.defaultPosition),
    { id: null, nameDe: "", nameEn: "", icon: null },
  ];
  if (!rows.length)
    return (
      <EmptyState
        icon={ShoppingBasket}
        title={m.list_empty_title()}
        description={m["shopping.empty_hint"]()}
      />
    );
  return (
    <div className="shopping-items">
      {!!checkedIds.length && (
        <Button
          variant="secondary"
          disabled={events.isPending}
          onClick={() =>
            events.mutate(checkedIds.map((id) => itemEvent(id, "item_removed")))
          }
        >
          {m["shopping.clear_checked"]()}
        </Button>
      )}
      {groups.map((category) => {
        const group = rows.filter((row) =>
          category.id === null
            ? !categories.some((known) => known.id === row.categoryId)
            : row.categoryId === category.id,
        );
        if (!group.length) return null;
        return (
          <section
            key={category.id ?? "none"}
            className="section shopping-category"
          >
            <h2>
              {category.icon && `${category.icon} `}
              {category.id
                ? ingredientName(category)
                : m["shopping.uncategorized"]()}
            </h2>
            <ul className="row-list">
              {group
                .sort((a, b) => Number(a.checked) - Number(b.checked))
                .map((row) => (
                  <li key={row.key} className="shopping-entry">
                    <div
                      className="row shopping-row"
                      data-checked={row.checked}
                    >
                      <label className="shopping-check">
                        <input
                          type="checkbox"
                          checked={row.checked}
                          disabled={events.isPending}
                          onChange={() =>
                            events.mutate(
                              row.itemIds.map((id) =>
                                itemEvent(
                                  id,
                                  row.checked
                                    ? "item_unchecked"
                                    : "item_checked",
                                ),
                              ),
                            )
                          }
                        />
                        <span className="sr-only">
                          {m["shopping.toggle_item"]({ name: row.label })}
                        </span>
                      </label>
                      <div className="row-main">
                        <span className="row-title">
                          {row.amounts
                            .map((amount) =>
                              formatQuantity(amount.quantity, amount.unit),
                            )
                            .join(" + ")}{" "}
                          {row.label}
                        </span>
                        <RecipeSources
                          sources={row.sources}
                          recipes={list.recipes}
                        />
                      </div>
                      <div className="recipe-actions">
                        <Button
                          variant="ghost"
                          aria-expanded={expanded === row.key}
                          onClick={() =>
                            setExpanded(expanded === row.key ? null : row.key)
                          }
                        >
                          {m["recipes.edit"]()}
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={events.isPending}
                          onClick={() =>
                            events.mutate(
                              row.itemIds.map((id) =>
                                itemEvent(id, "item_removed"),
                              ),
                            )
                          }
                        >
                          {m["shopping.remove_item"]()}
                        </Button>
                      </div>
                    </div>
                    {expanded === row.key && (
                      <div className="shopping-expanded">
                        <p className="muted">
                          {m["shopping.edit_entries"]({
                            count: row.itemIds.length,
                          })}
                        </p>
                        {list.items
                          .filter((item) => row.itemIds.includes(item.id))
                          .map((item, index) => (
                            <div
                              key={`${item.id}-${item.updatedAt}`}
                              className="shopping-individual"
                            >
                              <h3>
                                {m["shopping.entry_number"]({
                                  number: index + 1,
                                })}
                              </h3>
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
                        <Button
                          variant="ghost"
                          onClick={() => setExpanded(null)}
                        >
                          {m["shopping.close_edit"]()}
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
