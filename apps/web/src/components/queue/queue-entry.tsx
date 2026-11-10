import { Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  Ellipsis,
  Flame,
  GripVertical,
  Trash2,
  Utensils,
} from "lucide-react";
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
  hero = false,
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
  /** The next meal: a large card with the cooking actions. */
  hero?: boolean;
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
  const [title, setTitle] = useState(entry.title);
  const [note, setNote] = useState(entry.note ?? "");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removeItems, setRemoveItems] = useState(false);
  const recipe = entry.recipe;
  const minutes = recipe ? totalMinutes(recipe) : 0;
  const name = entry.title;
  const meta = [
    !recipe
      ? m["queue.without_recipe"]()
      : entry.servings === 1
        ? m["queue.servings_one"]()
        : m["queue.servings_count"]({ count: entry.servings }),
    entry.plannedFor
      ? formatDate(new Date(`${entry.plannedFor}T00:00:00`), {
          weekday: "short",
          day: "numeric",
          month: "numeric",
        })
      : null,
    minutes > 0 && formatMinutes(minutes),
    entry.onList && m["queue.on_list"](),
  ]
    .filter(Boolean)
    .join(" · ");

  const Entry = hero ? "article" : "li";
  const openSheet = () => sheet.current?.showModal();
  const media = recipe?.imageKey
    ? recipeImageUrl(recipe.id, recipe.imageKey, hero ? "full" : "thumb")
    : null;

  return (
    <Entry
      className={hero ? "queue-hero" : "queue-entry"}
      data-queue-id={entry.id}
      data-dragging={dragging}
      data-drop={dropPosition}
    >
      {hero ? (
        <>
          {media && <img className="queue-hero-media" src={media} alt="" />}
          <div className="queue-hero-body">
            <h2 className="queue-hero-title">
              {recipe ? (
                <Link to="/recipes/$id" params={{ id: recipe.id }}>
                  {name}
                </Link>
              ) : (
                name
              )}
            </h2>
            <p className="meta">{meta}</p>
            {entry.note && <p className="meta queue-note">{entry.note}</p>}
            <div className="queue-actions">
              {recipe && (
                <Button asChild>
                  <Link
                    to="/cook/$id"
                    params={{ id: recipe.id }}
                    search={{ servings: entry.servings }}
                  >
                    <Flame size={20} aria-hidden="true" />
                    {m["recipes.cook_action"]()}
                  </Link>
                </Button>
              )}
              <Button
                type="button"
                variant={recipe ? "outline" : "default"}
                disabled={disabled}
                aria-label={
                  recipe
                    ? m["queue.mark_cooked"]({ name })
                    : m["queue.mark_done"]({ name })
                }
                onClick={() => onUpdate({ status: "cooked" })}
              >
                {recipe ? m["queue.cooked"]() : m["queue.done"]()}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="icon-action"
                disabled={disabled}
                aria-label={m["queue.edit_meal"]({ name })}
                aria-haspopup="dialog"
                onClick={openSheet}
              >
                <Ellipsis size={20} aria-hidden="true" />
              </Button>
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </>
      ) : (
        <>
          <button
            type="button"
            className="queue-row"
            disabled={disabled}
            aria-haspopup="dialog"
            onClick={openSheet}
          >
            {media ? (
              <img
                className="queue-thumb"
                src={media}
                alt=""
                width={48}
                height={48}
                loading="lazy"
              />
            ) : (
              <span className="queue-thumb is-empty">
                <Utensils size={20} aria-hidden="true" />
              </span>
            )}
            <span className="queue-body">
              <span className="queue-title">{name}</span>
              <span className="meta">{meta}</span>
              {entry.note && (
                <span className="meta queue-note">{entry.note}</span>
              )}
            </span>
          </button>
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
            <GripVertical size={20} aria-hidden="true" />
          </button>
        </>
      )}
      <Sheet
        ref={sheet}
        title={m["queue.edit"]()}
        meta={name}
        onClose={() => {
          setConfirmRemove(false);
          setRemoveItems(false);
          setPlannedFor(entry.plannedFor ?? "");
          setTitle(entry.title);
          setNote(entry.note ?? "");
        }}
      >
        {recipe && (
          <div className="sheet-row">
            <span className="field-label">{m["recipes.servings"]()}</span>
            <ServingsStepper
              value={entry.servings}
              compact
              disabled={disabled}
              onChange={(servings) => onUpdate({ servings })}
            />
          </div>
        )}
        <div className="queue-sheet-actions">
          {recipe && (
            <Button asChild variant="outline">
              <Link to="/recipes/$id" params={{ id: recipe.id }}>
                {m["queue.view_recipe"]()}
              </Link>
            </Button>
          )}
          {!hero && (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={() => onUpdate({ status: "cooked" })}
              >
                {recipe ? m["queue.cooked"]() : m["queue.done"]()}
              </Button>
              {recipe && (
                <Button asChild variant="outline">
                  <Link
                    to="/cook/$id"
                    params={{ id: recipe.id }}
                    search={{ servings: entry.servings }}
                  >
                    {m["recipes.cook_action"]()}
                  </Link>
                </Button>
              )}
            </>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => onUpdate({ status: "skipped" })}
          >
            {m["queue.skip"]()}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="icon-action"
            disabled={disabled || index === 0}
            aria-label={m["queue.move_up"]({ name })}
            title={m["queue.move_up_short"]()}
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
            title={m["queue.move_down_short"]()}
            onClick={() => onMove(1)}
          >
            <ArrowDown size={20} aria-hidden="true" />
          </Button>
        </div>
        <form
          className="queue-entry-form recipe-form"
          onSubmit={(event) => {
            event.preventDefault();
            onUpdate({
              plannedFor: plannedFor || null,
              note: note.trim() || null,
              ...(!recipe && { title: title.trim() }),
            });
          }}
        >
          {!recipe && (
            <Field
              id={`${id}-title`}
              label={m["queue.meal_title"]()}
              required
              maxLength={200}
              value={title}
              disabled={disabled}
              onChange={(event) => setTitle(event.target.value)}
            />
          )}
          <div className="field">
            <label htmlFor={`${id}-note`}>{m["queue.meal_note"]()}</label>
            <textarea
              id={`${id}-note`}
              rows={3}
              maxLength={2000}
              value={note}
              disabled={disabled}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
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
            disabled={
              disabled ||
              ((plannedFor || null) === entry.plannedFor &&
                title === entry.title &&
                (note || null) === entry.note)
            }
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
            {recipe && (
              <>
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
              </>
            )}
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
    </Entry>
  );
}
