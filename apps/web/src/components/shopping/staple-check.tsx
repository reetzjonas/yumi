import type { ShoppingEvent } from "@yumi/shared";
import { Button } from "@/components/ui/button";
import { formatQuantity, unitLabel } from "@/lib/recipes";
import { addItemEvent, useShoppingEvents } from "@/lib/shopping";
import { m } from "@/paraglide/messages";

type Payload = Extract<ShoppingEvent, { type: "item_added" }>["payload"];

/** Staples skipped when a recipe was added, offered to add anyway. */
export function StapleCheck({
  listId,
  staples,
  onDone,
}: {
  listId: string;
  staples: Payload[];
  onDone: (remaining: Payload[]) => void;
}) {
  const events = useShoppingEvents(listId);
  const add = (chosen: Payload[]) =>
    events.mutate(chosen.map(addItemEvent), {
      onSuccess: () => onDone(staples.filter((s) => !chosen.includes(s))),
    });
  return (
    <section className="staple-check" aria-label={m["pantry.check_title"]()}>
      <h3>{m["pantry.check_title"]()}</h3>
      <p className="muted">{m["pantry.check_hint"]()}</p>
      <ul className="row-list store-list">
        {staples.map((staple) => (
          <li key={staple.ingredientId ?? staple.label} className="row">
            <span className="row-main row-title">
              {staple.quantity != null &&
                `${formatQuantity(staple.quantity, staple.unit ?? null)} `}
              {staple.quantity == null &&
                staple.unit &&
                `${unitLabel(staple.unit)} `}
              {staple.label}
            </span>
            <Button
              variant="secondary"
              disabled={events.isPending}
              onClick={() => add([staple])}
            >
              {m["pantry.add_anyway"]()}
            </Button>
          </li>
        ))}
      </ul>
      <div className="recipe-actions">
        {staples.length > 1 && (
          <Button disabled={events.isPending} onClick={() => add(staples)}>
            {m["pantry.add_all"]()}
          </Button>
        )}
        <Button variant="ghost" onClick={() => onDone([])}>
          {m["pantry.all_at_home"]()}
        </Button>
      </div>
    </section>
  );
}
