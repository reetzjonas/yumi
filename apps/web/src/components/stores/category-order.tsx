import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ingredientName } from "@/lib/recipes";
import type { Category } from "@/lib/shopping";
import { m } from "@/paraglide/messages";

function move(ids: string[], from: number, to: number) {
  const next = [...ids];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}

export function CategoryOrder({
  categories,
  order,
  onChange,
}: {
  categories: Category[];
  order: string[];
  onChange: (order: string[]) => void;
}) {
  const [dragging, setDragging] = useState<number | null>(null);
  const byId = new Map(categories.map((category) => [category.id, category]));
  return (
    <ol className="row-list store-order">
      {order.map((id, index) => {
        const category = byId.get(id);
        if (!category) return null;
        const name = ingredientName(category);
        return (
          <li
            key={id}
            className="row store-order-row"
            draggable
            data-dragging={dragging === index}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              setDragging(index);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (dragging !== null && dragging !== index)
                onChange(move(order, dragging, index));
              setDragging(null);
            }}
            onDragEnd={() => setDragging(null)}
          >
            <GripVertical aria-hidden="true" size={20} className="store-grip" />
            <span className="row-main row-title">
              {category.icon && `${category.icon} `}
              {name}
            </span>
            <Button
              type="button"
              variant="ghost"
              aria-label={m["stores.move_up"]({ name })}
              disabled={index === 0}
              onClick={() => onChange(move(order, index, index - 1))}
            >
              <ChevronUp aria-hidden="true" size={20} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              aria-label={m["stores.move_down"]({ name })}
              disabled={index === order.length - 1}
              onClick={() => onChange(move(order, index, index + 1))}
            >
              <ChevronDown aria-hidden="true" size={20} />
            </Button>
          </li>
        );
      })}
    </ol>
  );
}
