import { Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Ellipsis,
  GripVertical,
  Pencil,
  SkipForward,
  Trash2,
  X,
} from "lucide-react";
import { type ComponentProps, useId, useRef, useState } from "react";
import { Field } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/i18n";
import type { QueueEntry, QueueEntryUpdate } from "@/lib/queue";
import { formatMinutes, totalMinutes } from "@/lib/recipes";
import { m } from "@/paraglide/messages";

type Panel = "closed" | "menu" | "edit" | "remove";

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
  const sheet = useRef<HTMLDialogElement>(null);
  const [panel, setPanel] = useState<Panel>("closed");
  const [servings, setServings] = useState(String(entry.servings));
  const [plannedFor, setPlannedFor] = useState(entry.plannedFor ?? "");
  const [removeItems, setRemoveItems] = useState(false);
  const changed =
    Number(servings) !== entry.servings ||
    (plannedFor || null) !== entry.plannedFor;
  const minutes = totalMinutes(entry.recipe);
  const name = entry.recipe.title;
  const meta = [
    entry.servings === 1
      ? m["queue.servings_one"]()
      : m["queue.servings_count"]({ count: entry.servings }),
    entry.plannedFor &&
      formatDate(new Date(`${entry.plannedFor}T00:00:00`), {
        weekday: "short",
        day: "numeric",
        month: "numeric",
      }),
    minutes > 0 && formatMinutes(minutes),
  ]
    .filter(Boolean)
    .join(" · ");

  function open() {
    setPanel("menu");
    sheet.current?.showModal();
  }

  function close() {
    sheet.current?.close();
  }

  function reset() {
    setPanel("closed");
    setRemoveItems(false);
    setServings(String(entry.servings));
    setPlannedFor(entry.plannedFor ?? "");
  }

  function move(offset: number) {
    close();
    onMove(offset);
  }

  return (
    <li
      className="queue-entry"
      data-queue-id={entry.id}
      data-dragging={dragging}
      data-drop={dropPosition}
    >
      <div className="queue-entry-row">
        <label className="queue-checkbox queue-entry-select">
          <input
            type="checkbox"
            checked={selected}
            disabled={disabled}
            onChange={(event) => onSelect(event.target.checked)}
          />
          <span className="sr-only">{m["queue.select_meal"]({ name })}</span>
        </label>
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
          <GripVertical size={20} aria-hidden="true" />
        </Button>
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
          <p className="row-detail">{meta}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="queue-icon-action queue-menu-button"
          aria-label={m["queue.more_actions"]({ name })}
          aria-haspopup="dialog"
          onClick={open}
        >
          <Ellipsis size={20} aria-hidden="true" />
        </Button>
      </div>
      <dialog
        ref={sheet}
        className="sheet"
        aria-labelledby={`${id}-sheet-title`}
        onClose={reset}
      >
        <div className="sheet-content">
          <div className="sheet-header">
            <div className="row-main">
              <h2 id={`${id}-sheet-title`} className="sheet-title">
                {name}
              </h2>
              <p className="row-detail">{meta}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              aria-label={m["queue.close_menu"]()}
              onClick={close}
            >
              <X size={20} aria-hidden="true" />
            </Button>
          </div>
          {panel === "menu" && (
            <ul className="queue-menu">
              <li>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={disabled}
                  aria-label={m["queue.mark_cooked"]({ name })}
                  onClick={() => onUpdate({ status: "cooked" })}
                >
                  <Check size={18} aria-hidden="true" />
                  {m["queue.cooked"]()}
                </Button>
              </li>
              <li>
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
              </li>
              <li>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => setPanel("edit")}
                >
                  <Pencil size={18} aria-hidden="true" />
                  {m["queue.edit"]()}
                </Button>
              </li>
              <li>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={disabled || index === 0}
                  aria-label={m["queue.move_up"]({ name })}
                  onClick={() => move(-1)}
                >
                  <ArrowUp size={18} aria-hidden="true" />
                  {m["queue.move_up_short"]()}
                </Button>
              </li>
              <li>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={disabled || index === count - 1}
                  aria-label={m["queue.move_down"]({ name })}
                  onClick={() => move(1)}
                >
                  <ArrowDown size={18} aria-hidden="true" />
                  {m["queue.move_down_short"]()}
                </Button>
              </li>
              <li>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={disabled}
                  aria-label={m["queue.remove_meal"]({ name })}
                  onClick={() => setPanel("remove")}
                >
                  <Trash2 size={18} aria-hidden="true" />
                  {m["queue.remove"]()}
                </Button>
              </li>
            </ul>
          )}
          {panel === "edit" && (
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
              <div className="recipe-actions">
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={disabled || !changed}
                >
                  {m["queue.save"]()}
                </Button>
                <Button type="button" variant="ghost" onClick={close}>
                  {m["queue.cancel"]()}
                </Button>
              </div>
            </form>
          )}
          {panel === "remove" && (
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
                  onClick={close}
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
        </div>
      </dialog>
      {error && panel === "closed" && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}
