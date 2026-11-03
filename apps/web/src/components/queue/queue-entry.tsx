import { Link } from "@tanstack/react-router";
import {
  Check,
  ChevronDown,
  ChevronUp,
  GripVertical,
  SkipForward,
  Trash2,
} from "lucide-react";
import { type ComponentProps, useId, useState } from "react";
import { Field } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import type { QueueEntry, QueueEntryUpdate } from "@/lib/queue";
import { formatMinutes, totalMinutes } from "@/lib/recipes";
import { m } from "@/paraglide/messages";

export function MealQueueEntry({
  entry,
  index,
  count,
  disabled,
  error,
  selected,
  onSelect,
  removeError,
  onRemove,
  dragging,
  dropPosition,
  dragProps,
  onMove,
  onUpdate,
}: {
  entry: QueueEntry;
  index: number;
  count: number;
  disabled: boolean;
  error: string | null;
  selected: boolean;
  onSelect: (selected: boolean) => void;
  removeError: string | null;
  onRemove: (removeItems: boolean) => void;
  dragging: boolean;
  dropPosition: "before" | "after" | undefined;
  dragProps: ComponentProps<"button">;
  onMove: (offset: number) => void;
  onUpdate: (input: QueueEntryUpdate) => void;
}) {
  const id = useId();
  const [servings, setServings] = useState(String(entry.servings));
  const [plannedFor, setPlannedFor] = useState(entry.plannedFor ?? "");
  const [showRemove, setShowRemove] = useState(false);
  const [removeItems, setRemoveItems] = useState(false);
  const changed =
    Number(servings) !== entry.servings ||
    (plannedFor || null) !== entry.plannedFor;
  const minutes = totalMinutes(entry.recipe);
  const name = entry.recipe.title;

  return (
    <li
      className="queue-entry"
      data-queue-id={entry.id}
      data-dragging={dragging}
      data-drop={dropPosition}
    >
      <div className="queue-entry-heading">
        <label className="queue-checkbox queue-entry-select">
          <input
            type="checkbox"
            checked={selected}
            disabled={disabled}
            onChange={(event) => onSelect(event.target.checked)}
          />
          <span className="sr-only">{m["queue.select_meal"]({ name })}</span>
        </label>
        <span className="queue-position" aria-hidden="true">
          {index + 1}
        </span>
        <div className="row-main">
          <Link
            className="queue-recipe-link"
            to="/recipes/$id"
            params={{ id: entry.recipeId }}
          >
            {name}
          </Link>
          {minutes > 0 && (
            <p className="row-detail">
              {m["recipes.total_time"]({ time: formatMinutes(minutes) })}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          className="queue-drag-handle queue-icon-action"
          aria-label={m["queue.drag"]({ name })}
          aria-describedby="queue-order-hint"
          disabled={disabled}
          {...dragProps}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp" && index > 0) {
              event.preventDefault();
              onMove(-1);
            } else if (event.key === "ArrowDown" && index < count - 1) {
              event.preventDefault();
              onMove(1);
            }
            dragProps.onKeyDown?.(event);
          }}
        >
          <GripVertical size={22} aria-hidden="true" />
        </Button>
      </div>
      <form
        className="queue-entry-form"
        onSubmit={(event) => {
          event.preventDefault();
          onUpdate({
            servings: Number(servings),
            plannedFor: plannedFor || null,
          });
        }}
      >
        <Field
          id={`${id}-servings`}
          label={m["recipes.servings"]()}
          type="number"
          min={1}
          max={100}
          step={1}
          required
          value={servings}
          disabled={disabled}
          onChange={(event) => setServings(event.target.value)}
        />
        <Field
          id={`${id}-date`}
          label={m["queue.planned_for"]()}
          type="date"
          value={plannedFor}
          disabled={disabled}
          onChange={(event) => setPlannedFor(event.target.value)}
        />
        <Button
          type="submit"
          variant="secondary"
          disabled={disabled || !changed}
        >
          {m["queue.save"]()}
        </Button>
      </form>
      <div className="queue-entry-actions">
        <div className="queue-move-controls">
          <Button
            type="button"
            variant="ghost"
            className="queue-icon-action"
            aria-label={m["queue.move_up"]({ name })}
            disabled={disabled || index === 0}
            onClick={() => onMove(-1)}
          >
            <ChevronUp size={20} aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="queue-icon-action"
            aria-label={m["queue.move_down"]({ name })}
            disabled={disabled || index === count - 1}
            onClick={() => onMove(1)}
          >
            <ChevronDown size={20} aria-hidden="true" />
          </Button>
        </div>
        <div className="queue-status-controls">
          <Button
            type="button"
            variant="secondary"
            disabled={disabled}
            aria-label={m["queue.mark_cooked"]({ name })}
            onClick={() => onUpdate({ status: "cooked" })}
          >
            <Check size={18} aria-hidden="true" />
            {m["queue.cooked"]()}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={disabled}
            aria-label={m["queue.mark_skipped"]({ name })}
            onClick={() => onUpdate({ status: "skipped" })}
          >
            <SkipForward size={18} aria-hidden="true" />
            {m["queue.skip"]()}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={disabled}
            aria-expanded={showRemove}
            aria-controls={`${id}-remove`}
            aria-label={m["queue.remove_meal"]({ name })}
            onClick={() => setShowRemove(!showRemove)}
          >
            <Trash2 size={18} aria-hidden="true" />
            {m["queue.remove"]()}
          </Button>
        </div>
      </div>
      {showRemove && (
        <section
          id={`${id}-remove`}
          className="queue-remove-panel"
          aria-labelledby={`${id}-remove-title`}
        >
          <h3 id={`${id}-remove-title`}>
            {m["queue.remove_confirm"]({ name })}
          </h3>
          <p>{m["queue.remove_hint"]()}</p>
          <label className="queue-checkbox">
            <input
              type="checkbox"
              checked={removeItems}
              disabled={disabled}
              onChange={(event) => setRemoveItems(event.target.checked)}
            />
            <span>{m["queue.remove_items"]()}</span>
          </label>
          <div className="recipe-actions">
            <Button
              type="button"
              variant="secondary"
              disabled={disabled}
              onClick={() => onRemove(removeItems)}
            >
              {m["queue.remove"]()}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={disabled}
              onClick={() => {
                setShowRemove(false);
                setRemoveItems(false);
              }}
            >
              {m["queue.cancel"]()}
            </Button>
          </div>
          {removeError && (
            <p className="form-error" role="alert">
              {removeError}
            </p>
          )}
        </section>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}
