import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { m } from "@/paraglide/messages";

export function RowControls({
  item,
  index,
  count,
  onMove,
  onRemove,
}: {
  item: string;
  index: number;
  count: number;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className="recipe-row-controls">
      <Button
        type="button"
        variant="ghost"
        aria-label={m["recipes.move_up"]({ item })}
        disabled={index === 0}
        onClick={() => onMove(-1)}
      >
        <ArrowUp aria-hidden="true" size={18} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        aria-label={m["recipes.move_down"]({ item })}
        disabled={index === count - 1}
        onClick={() => onMove(1)}
      >
        <ArrowDown aria-hidden="true" size={18} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        aria-label={m["recipes.remove"]({ item })}
        onClick={onRemove}
      >
        <Trash2 aria-hidden="true" size={18} />
      </Button>
    </div>
  );
}
