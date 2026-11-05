import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Pictogram } from "@/components/ui/pictogram";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/api-error";
import { ingredientName } from "@/lib/recipes";
import { useMe } from "@/lib/session";
import {
  addItemEvent,
  type Category,
  type ShoppingList,
  useShoppingEvents,
} from "@/lib/shopping";
import { m } from "@/paraglide/messages";

type TileItem = {
  key: string;
  label: string;
  icon: string | null;
  fallback: string | null;
  ingredientId: string | null;
  categoryId: string | null;
};

function Tiles({
  items,
  list,
  label,
}: {
  items: TileItem[];
  list: ShoppingList;
  label: string;
}) {
  const events = useShoppingEvents(list.id);
  const open = new Set(
    list.items
      .filter((item) => !item.checked)
      .map((item) => item.ingredientId ?? item.label.toLowerCase()),
  );
  return (
    <ul className="item-tiles" aria-label={label}>
      {items.map((item) => {
        const onList = open.has(item.ingredientId ?? item.label.toLowerCase());
        return (
          <li key={item.key}>
            <button
              type="button"
              className="item-tile"
              data-on-list={onList}
              disabled={events.isPending}
              onClick={() =>
                events.mutate([
                  addItemEvent({
                    label: item.label,
                    ingredientId: item.ingredientId,
                    categoryId: item.categoryId,
                  }),
                ])
              }
            >
              <Pictogram icon={item.icon} fallback={item.fallback} size={36} />
              <span className="item-tile-label">{item.label}</span>
              {onList && (
                <span className="sr-only">{m["shopping.on_list"]()}</span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function ItemTiles({
  list,
  categories,
}: {
  list: ShoppingList;
  categories: Category[];
}) {
  const householdId = useMe()?.activeHouseholdId;
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const recent = useQuery({
    queryKey: ["shopping", householdId, "recent"],
    enabled: !!householdId,
    queryFn: async () =>
      (await ensureOk(await api.shopping.recent.$get())).json(),
  });
  const catalog = useQuery({
    queryKey: ["shopping", householdId, "tiles", categoryId],
    enabled: !!householdId && !!categoryId,
    queryFn: async () =>
      (
        await ensureOk(
          await api.ingredients.categories[":id"].ingredients.$get({
            param: { id: categoryId ?? "" },
          }),
        )
      ).json(),
  });
  const category = categories.find((c) => c.id === categoryId);
  const error = recent.error ?? catalog.error;
  return (
    <div className="item-tiles-panel">
      {error && (
        <p className="form-error" role="alert">
          {errorMessage(error)}
        </p>
      )}
      {!!recent.data?.length && (
        <div className="item-tiles-group">
          <h3>{m["shopping.recent"]()}</h3>
          <Tiles
            list={list}
            label={m["shopping.recent"]()}
            items={recent.data.map((item) => ({
              key: item.key,
              label: item.ingredient
                ? ingredientName(item.ingredient)
                : item.label,
              icon: item.ingredient?.icon ?? null,
              fallback:
                categories.find(
                  (c) =>
                    c.id === (item.ingredient?.categoryId ?? item.categoryId),
                )?.icon ?? null,
              ingredientId: item.ingredient?.id ?? null,
              categoryId: item.ingredient?.categoryId ?? item.categoryId,
            }))}
          />
        </div>
      )}
      <div className="item-tiles-group">
        <h3>{category ? ingredientName(category) : m["shopping.browse"]()}</h3>
        {category ? (
          <>
            <Button variant="ghost" onClick={() => setCategoryId(null)}>
              {m["shopping.all_categories"]()}
            </Button>
            {catalog.data && (
              <Tiles
                list={list}
                label={ingredientName(category)}
                items={catalog.data
                  .map((ingredient) => ({
                    key: ingredient.id,
                    label: ingredientName(ingredient),
                    icon: ingredient.icon,
                    fallback: category.icon,
                    ingredientId: ingredient.id,
                    categoryId: ingredient.categoryId,
                  }))
                  .sort((a, b) => a.label.localeCompare(b.label))}
              />
            )}
          </>
        ) : (
          <ul className="item-tiles" aria-label={m["shopping.browse"]()}>
            {categories.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="item-tile"
                  onClick={() => setCategoryId(c.id)}
                >
                  <Pictogram icon={c.icon} size={36} />
                  <span className="item-tile-label">{ingredientName(c)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
