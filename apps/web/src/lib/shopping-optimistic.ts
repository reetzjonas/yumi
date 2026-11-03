import type { ShoppingEvent } from "@yumi/shared";
import type { ShoppingList } from "./shopping";

/** Replaying the outbox over a server snapshot must also be safe after an acknowledged write. */
export function applyShoppingEvents(
  list: ShoppingList,
  events: ShoppingEvent[],
): ShoppingList {
  let items = [...list.items];
  for (const event of events) {
    if (event.type === "item_added") {
      if (items.some((item) => item.id === event.itemId)) continue;
      items.push({
        id: event.itemId,
        label: event.payload.label,
        ingredientId: event.payload.ingredientId ?? null,
        quantity: event.payload.quantity ?? null,
        unit: event.payload.unit ?? null,
        categoryId: event.payload.categoryId ?? null,
        sources: event.payload.sources ?? [],
        checked: false,
        updatedAt: event.clientTs,
        ingredient: null,
      });
    } else if (event.type === "item_removed") {
      items = items.filter((item) => item.id !== event.itemId);
    } else {
      items = items.map((item) => {
        if (item.id !== event.itemId) return item;
        if (event.type === "item_updated") {
          return {
            ...item,
            ...event.payload,
            ingredient:
              event.payload.ingredientId === undefined ||
              event.payload.ingredientId === item.ingredientId
                ? item.ingredient
                : null,
            updatedAt: event.clientTs,
          };
        }
        return {
          ...item,
          checked: event.type === "item_checked",
          updatedAt: event.clientTs,
        };
      });
    }
  }
  return { ...list, items };
}
