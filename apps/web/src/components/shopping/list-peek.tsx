import { Link } from "@tanstack/react-router";
import { mergeShoppingItems } from "@yumi/shared";
import { useId } from "react";
import { formatQuantity, ingredientName } from "@/lib/recipes";
import { useShoppingList, useShoppingLists } from "@/lib/shopping";
import { m } from "@/paraglide/messages";

export function ListPeek() {
  const id = useId();
  const lists = useShoppingLists();
  const listId = lists.data?.[0]?.id ?? "";
  const detail = useShoppingList(listId);
  const list = detail.data;
  if (!list) return null;
  const rows = mergeShoppingItems(
    list.items.map((item) => ({
      ...item,
      label: item.ingredient ? ingredientName(item.ingredient) : item.label,
    })),
  );
  const open = rows.filter((row) => !row.checked);
  return (
    <section className="list-peek" aria-labelledby={`${id}-title`}>
      <div className="list-peek-heading">
        <h2 id={`${id}-title`}>{list.name}</h2>
        <span className="row-detail">
          {m["shopping.progress"]({
            checked: rows.length - open.length,
            total: rows.length,
          })}
        </span>
      </div>
      {open.length ? (
        <ul className="list-peek-items">
          {open.map((row) => (
            <li key={row.key}>
              <span>{row.label}</span>
              <span className="row-detail">
                {row.amounts
                  .map((amount) => formatQuantity(amount.quantity, amount.unit))
                  .join(" + ")}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="row-detail">{m.list_empty_title()}</p>
      )}
      <Link className="text-link" to="/list">
        {m["queue.open_list"]()}
      </Link>
    </section>
  );
}
