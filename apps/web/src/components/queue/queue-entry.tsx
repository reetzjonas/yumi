import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";
import { type ComponentProps, useId, useRef, useState } from "react";
import { Field } from "@/components/auth-layout";
import { ServingsStepper } from "@/components/recipes/servings-selector";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { formatDate } from "@/lib/i18n";
import type { QueueEntry, QueueEntryUpdate } from "@/lib/queue";
import { formatMinutes, recipeImageUrl, totalMinutes } from "@/lib/recipes";
import { m } from "@/paraglide/messages";

export function MealQueueEntry({
  entry,
  index,
  count,
  disabled,
  error,
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
  removeError: string | null;
  onRemove: (removeItems: boolean) => void;
  dragging: boolean;
  dropPosition: "before" | "after" | undefined;
  dragProps: ComponentProps<"button">;
  onMove: (offset: number) => void;
  onUpdate: (input: QueueEntryUpdate) => void;
}) {
  const id = useId();
  const sheet = useRef<HTMLDialogElement>(null);
  const [plannedFor, setPlannedFor] = useState(entry.plannedFor ?? "");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removeItems, setRemoveItems] = useState(false);
  const minutes = totalMinutes(entry.recipe);
  const name = entry.recipe.title;
  const meta = [
    entry.servings === 1
      ? m["queue.servings_one"]()
      : m["queue.servings_count"]({ count: entry.servings }),
    entry.plannedFor
      ? formatDate(new Date(`${entry.plannedFor}T00:00:00`), {
          weekday: "short",
          day: "numeric",
          month: "numeric",
        })
      : m["queue.no_day"](),
    minutes > 0 && formatMinutes(minutes),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li
      className="queue-entry"
      data-queue-id={entry.id}
      data-dragging={dragging}
      data-drop={dropPosition}
    >
      <button
        type="button"
        className="queue-handle"
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
        {index + 1}
      </button>
      {entry.recipe.imageKey ? (
        <img
          className="queue-thumb"
          src={recipeImageUrl(entry.recipeId, entry.recipe.imageKey, "thumb")}
          alt=""
          width={56}
          height={56}
          loading="lazy"
        />
      ) : (
        <span className="queue-thumb is-empty" />
      )}
      <div className="queue-body">
        <Link
          className="queue-title"
          to="/recipes/$id"
          params={{ id: entry.recipeId }}
        >
          {name}
        </Link>
        <p className="meta">{meta}</p>
        <div className="queue-controls">
          <ServingsStepper
            value={entry.servings}
            compact
            disabled={disabled}
            label={m["queue.servings_for"]({ name })}
            onChange={(servings) => onUpdate({ servings })}
          />
          <Button
            type="button"
            variant="ghost"
            className="icon-action"
            disabled={disabled || index === 0}
            aria-label={m["queue.move_up"]({ name })}
            onClick={() => onMove(-1)}
          >
            <ArrowUp size={20} aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="icon-action"
            disabled={disabled || index === count - 1}
            aria-label={m["queue.move_down"]({ name })}
            onClick={() => onMove(1)}
          >
            <ArrowDown size={20} aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="icon-action"
            disabled={disabled}
            aria-label={m["queue.edit_meal"]({ name })}
            aria-haspopup="dialog"
            onClick={() => sheet.current?.showModal()}
          >
            <Pencil size={20} aria-hidden="true" />
          </Button>
        </div>
        <div className="queue-actions">
          <Button asChild variant="outline">
            <Link
              to="/cook/$id"
              params={{ id: entry.recipeId }}
              search={{ servings: entry.servings }}
            >
              {m["recipes.cook_action"]()}
            </Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={disabled}
            aria-label={m["queue.mark_cooked"]({ name })}
            onClick={() => onUpdate({ status: "cooked" })}
          >
            {m["queue.cooked"]()}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={disabled}
            aria-label={m["queue.mark_skipped"]({ name })}
            onClick={() => onUpdate({ status: "skipped" })}
          >
            {m["queue.skip"]()}
          </Button>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <Sheet
        ref={sheet}
        title={m["queue.edit"]()}
        meta={name}
        onClose={() => {
          setConfirmRemove(false);
          setRemoveItems(false);
          setPlannedFor(entry.plannedFor ?? "");
        }}
      >
        <div className="sheet-row">
          <span className="field-label">{m["recipes.servings"]()}</span>
          <ServingsStepper
            value={entry.servings}
            compact
            disabled={disabled}
            onChange={(servings) => onUpdate({ servings })}
          />
        </div>
        <form
          className="queue-entry-form"
          onSubmit={(event) => {
            event.preventDefault();
            onUpdate({ plannedFor: plannedFor || null });
          }}
        >
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
            variant="outline"
            disabled={disabled || (plannedFor || null) === entry.plannedFor}
          >
            {m["queue.save"]()}
          </Button>
        </form>
        {confirmRemove ? (
          <section
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
                variant="destructive"
                disabled={disabled}
                onClick={() => onRemove(removeItems)}
              >
                {m["queue.remove"]()}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={disabled}
                onClick={() => setConfirmRemove(false)}
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
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="button-danger-text"
            disabled={disabled}
            aria-label={m["queue.remove_meal"]({ name })}
            onClick={() => setConfirmRemove(true)}
          >
            <Trash2 size={18} aria-hidden="true" />
            {m["queue.remove"]()}
          </Button>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </Sheet>
    </li>
  );
}
