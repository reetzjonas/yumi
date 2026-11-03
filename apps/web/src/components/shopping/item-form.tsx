import { type ShoppingEvent, UNITS, type Unit, unitSchema } from "@yumi/shared";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/auth-layout";
import { CatalogPicker } from "@/components/shopping/catalog-picker";
import { Button } from "@/components/ui/button";
import {
  ingredientName,
  parseQuantityInput,
  quantityInputValue,
  unitLabel,
} from "@/lib/recipes";
import {
  type Category,
  itemEvent,
  type ShoppingItem,
  useShoppingEvents,
} from "@/lib/shopping";
import { m } from "@/paraglide/messages";

export function ItemForm({
  listId,
  categories,
  item,
}: {
  listId: string;
  categories: Category[];
  item?: ShoppingItem;
}) {
  const id = useId();
  const events = useShoppingEvents(listId);
  const [label, setLabel] = useState(item?.label ?? "");
  const [quantityText, setQuantityText] = useState(
    quantityInputValue(item?.quantity ?? null),
  );
  const [unit, setUnit] = useState<Unit | null>(item?.unit ?? null);
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? "");
  const [ingredientId, setIngredientId] = useState<string | null>(
    item?.ingredientId ?? null,
  );
  return (
    <form
      className="shopping-item-form"
      onSubmit={(event) => {
        event.preventDefault();
        const quantity = parseQuantityInput(quantityText);
        if (
          quantity !== null &&
          (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000)
        ) {
          toast.error(m["shopping.invalid_quantity"]());
          return;
        }
        if (!label.trim()) return;
        const base = {
          id: crypto.randomUUID(),
          itemId: item?.id ?? crypto.randomUUID(),
          clientTs: new Date().toISOString(),
        };
        const payload = {
          label: label.trim(),
          quantity,
          unit,
          categoryId: categoryId || null,
          ingredientId,
        };
        const change: ShoppingEvent = item
          ? { ...base, type: "item_updated", payload }
          : { ...base, type: "item_added", payload };
        events.mutate([change], {
          onSuccess: () => {
            if (!item) {
              setLabel("");
              setQuantityText("");
              setUnit(null);
              setCategoryId("");
              setIngredientId(null);
            }
          },
        });
      }}
    >
      <fieldset className="shopping-item-fields" disabled={events.isPending}>
        <Field
          id={`${id}-label`}
          label={m["shopping.item_label"]()}
          value={label}
          required
          maxLength={200}
          onChange={(event) => {
            setLabel(event.target.value);
            setIngredientId(null);
          }}
        />
        <CatalogPicker
          onSelect={(ingredient) => {
            setLabel(ingredientName(ingredient));
            setIngredientId(ingredient.id);
            setCategoryId(ingredient.categoryId ?? "");
            setUnit(unitSchema.safeParse(ingredient.defaultUnit).data ?? null);
          }}
        />
        {ingredientId && (
          <p className="row-detail">{m["shopping.catalog_linked"]()}</p>
        )}
        <div className="shopping-amount-fields">
          <Field
            id={`${id}-quantity`}
            label={m["recipes.ingredient_quantity"]()}
            inputMode="decimal"
            value={quantityText}
            onChange={(event) => setQuantityText(event.target.value)}
          />
          <div className="field">
            <label htmlFor={`${id}-unit`}>
              {m["recipes.ingredient_unit"]()}
            </label>
            <select
              id={`${id}-unit`}
              value={unit ?? ""}
              onChange={(event) =>
                setUnit(unitSchema.safeParse(event.target.value).data ?? null)
              }
            >
              <option value="">{m["recipes.ingredient_no_unit"]()}</option>
              {UNITS.map((value) => (
                <option key={value} value={value}>
                  {unitLabel(value)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor={`${id}-category`}>{m["shopping.category"]()}</label>
          <select
            id={`${id}-category`}
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">{m["shopping.uncategorized"]()}</option>
            {[...categories]
              .sort((a, b) => a.defaultPosition - b.defaultPosition)
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.icon && `${category.icon} `}
                  {ingredientName(category)}
                </option>
              ))}
          </select>
        </div>
        <div className="recipe-actions">
          <Button disabled={!label.trim()}>
            {item ? m["shopping.save"]() : m["shopping.add_item"]()}
          </Button>
          {item && (
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                events.mutate([itemEvent(item.id, "item_removed")])
              }
            >
              {m["shopping.remove_item"]()}
            </Button>
          )}
        </div>
      </fieldset>
    </form>
  );
}
