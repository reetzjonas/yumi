import { Minus, Plus } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { m } from "@/paraglide/messages";

export function ServingsSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="servings-selector">
      <label htmlFor={id}>{m["recipes.servings"]()}</label>
      <div className="servings-controls">
        <Button
          type="button"
          variant="outline"
          aria-label={m["recipes.servings_decrease"]()}
          title={m["recipes.servings_decrease"]()}
          disabled={value === 1}
          onClick={() => onChange(value - 1)}
        >
          <Minus size={18} aria-hidden="true" />
        </Button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={1}
          max={100}
          step={1}
          required
          value={value}
          onChange={(event) => {
            const next = event.currentTarget.valueAsNumber;
            if (Number.isInteger(next) && next >= 1 && next <= 100)
              onChange(next);
          }}
        />
        <Button
          type="button"
          variant="outline"
          aria-label={m["recipes.servings_increase"]()}
          title={m["recipes.servings_increase"]()}
          disabled={value === 100}
          onClick={() => onChange(value + 1)}
        >
          <Plus size={18} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
