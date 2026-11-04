import { Minus, Plus } from "lucide-react";
import { m } from "@/paraglide/messages";

export function ServingsStepper({
  value,
  onChange,
  compact = false,
  disabled = false,
  label = m["recipes.servings"](),
}: {
  value: number;
  onChange: (value: number) => void;
  compact?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <fieldset
      className={compact ? "stepper is-compact" : "stepper"}
      aria-label={label}
      disabled={disabled}
    >
      <button
        type="button"
        className="stepper-button"
        aria-label={m["recipes.servings_decrease"]()}
        disabled={value === 1}
        onClick={() => onChange(value - 1)}
      >
        <Minus size={20} aria-hidden="true" />
      </button>
      <output className="stepper-value" aria-live="polite">
        {compact ? value : m["recipes.servings_count"]({ count: value })}
      </output>
      <button
        type="button"
        className="stepper-button"
        aria-label={m["recipes.servings_increase"]()}
        disabled={value === 100}
        onClick={() => onChange(value + 1)}
      >
        <Plus size={20} aria-hidden="true" />
      </button>
    </fieldset>
  );
}
