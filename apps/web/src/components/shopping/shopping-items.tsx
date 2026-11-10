import {
  type learnShoppingOrder,
  type MergedItem,
  mergeShoppingItems,
  sortShoppingItems,
} from "@yumi/shared";
import {
  Check,
  Grid2x2,
  Pencil,
  Rows3,
  ShoppingBasket,
  Trash2,
  X,
} from "lucide-react";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/page";
import { ItemForm } from "@/components/shopping/item-form";
import { Button } from "@/components/ui/button";
import { Pictogram } from "@/components/ui/pictogram";
import { Sheet } from "@/components/ui/sheet";
import { errorMessage } from "@/lib/api-error";
import { readPreference, writePreference } from "@/lib/preferences";
import { formatShoppingQuantity, ingredientName } from "@/lib/recipes";
import {
  addItemEvent,
  type Category,
  itemEvent,
  type ShoppingList,
  useShoppingEvents,
} from "@/lib/shopping";
import { m } from "@/paraglide/messages";

const SETTLE_MS = 600;
const LONG_PRESS_MS = 450;
const GESTURE_SLOP_PX = 10;
const HINT_KEY = "yumi.shopping.gesture-hint-dismissed";
const VIEW_KEY = "yumi.shopping.view";

type LearnedOrder = ReturnType<typeof learnShoppingOrder>;
const NO_LEARNING: LearnedOrder = { ingredients: [], categories: [] };

function sourceTitles(
  sources: ShoppingList["items"][number]["sources"],
  recipes: ShoppingList["recipes"],
) {
  return recipes
    .filter((recipe) =>
      sources.some(
        (source) => source.kind === "recipe" && source.id === recipe.id,
      ),
    )
    .map((recipe) => recipe.title)
    .join(", ");
}

const amountText = (row: MergedItem) =>
  row.amounts
    .map((amount) => formatShoppingQuantity(amount.quantity, amount.unit))
    .join(" + ");

function RecipeSources({
  sources,
  recipes,
}: {
  sources: ShoppingList["items"][number]["sources"];
  recipes: ShoppingList["recipes"];
}) {
  const names = recipes.filter((recipe) =>
    sources.some(
      (source) => source.kind === "recipe" && source.id === recipe.id,
    ),
  );
  if (!names.length) return null;
  return (
    <span className="shopping-sources">
      {names.map((recipe) => (
        <span key={recipe.id} className="badge badge-muted">
          {recipe.title}
        </span>
      ))}
    </span>
  );
}

type Gesture = {
  pointerId: number;
  x: number;
  y: number;
  dx: number;
  mode: "pending" | "swipe" | "scroll" | "press";
  timer: number;
};

function ShoppingRow({
  row,
  checked,
  recipes,
  disabled,
  error,
  icon,
  fallback,
  onToggle,
  onEdit,
  onRemove,
}: {
  row: MergedItem;
  checked: boolean;
  recipes: ShoppingList["recipes"];
  disabled: boolean;
  error?: string;
  icon?: string | null;
  fallback?: string | null;
  onToggle: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const sources = sourceTitles(row.sources, recipes);

  const finish = () => {
    if (gesture.current) window.clearTimeout(gesture.current.timer);
    gesture.current = null;
    setDragging(false);
  };
  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || disabled) return;
    suppressClick.current = false;
    const timer = window.setTimeout(() => {
      if (gesture.current?.mode !== "pending") return;
      gesture.current.mode = "press";
      suppressClick.current = true;
      navigator.vibrate?.(10);
      onEdit();
    }, LONG_PRESS_MS);
    gesture.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      dx: 0,
      mode: "pending",
      timer,
    };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (current.mode === "pending" && Math.hypot(dx, dy) > GESTURE_SLOP_PX) {
      window.clearTimeout(current.timer);
      if (dx < 0 && Math.abs(dx) > Math.abs(dy)) {
        current.mode = "swipe";
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
      } else current.mode = "scroll";
    }
    if (current.mode === "swipe") {
      current.dx = Math.min(0, dx);
      setOffset(current.dx);
    }
  };
  const onPointerUp = () => {
    const current = gesture.current;
    if (current?.mode === "swipe") {
      suppressClick.current = true;
      const width = surface.current?.offsetWidth ?? 320;
      if (current.dx < -Math.max(96, width * 0.35)) {
        setOffset(0);
        onRemove();
      } else setOffset(0);
    }
    finish();
  };
  const guarded = (action: () => void) => () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    action();
  };

  return (
    <li className="list-item" data-checked={checked} data-dragging={dragging}>
      <div className="list-item-swipe" aria-hidden="true">
        <Trash2 size={22} />
      </div>
      <div
        ref={surface}
        className="list-item-surface"
        style={offset ? { transform: `translateX(${offset}px)` } : undefined}
      >
        <button
          type="button"
          className="list-item-toggle"
          aria-pressed={checked}
          disabled={disabled}
          onClick={guarded(onToggle)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            setOffset(0);
            finish();
          }}
          onContextMenu={(event) => {
            if (gesture.current) event.preventDefault();
          }}
        >
          <span className="list-item-box" aria-hidden="true">
            {checked && <Check size={18} strokeWidth={3} />}
          </span>
          <Pictogram icon={icon} fallback={fallback} size={32} />
          <span className="list-item-body">
            <span className="shopping-name">{row.label}</span>
            {sources && <span className="shopping-source">{sources}</span>}
          </span>
          <span className="shopping-quantity">{amountText(row)}</span>
        </button>
        <Button
          type="button"
          variant="ghost"
          className="icon-action list-item-edit"
          aria-haspopup="dialog"
          aria-label={m["shopping.edit_item"]({ name: row.label })}
          title={m["shopping.edit_item"]({ name: row.label })}
          onClick={guarded(onEdit)}
        >
          <Pencil size={18} aria-hidden="true" />
        </Button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

function ShoppingTile({
  row,
  checked,
  disabled,
  error,
  icon,
  fallback,
  hue,
  onToggle,
  onEdit,
}: {
  row: MergedItem;
  checked: boolean;
  disabled: boolean;
  error?: string;
  icon?: string | null;
  fallback?: string | null;
  /** Category hue; undefined keeps the neutral tile. */
  hue?: number;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const press = useRef<{ x: number; y: number; timer: number } | null>(null);
  const suppressClick = useRef(false);
  const cancel = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  };
  return (
    <li
      className="list-tile-item"
      data-checked={checked}
      style={
        hue === undefined ? undefined : ({ "--tile-hue": hue } as CSSProperties)
      }
    >
      <button
        type="button"
        className="list-tile"
        aria-pressed={checked}
        disabled={disabled}
        onClick={() => {
          if (suppressClick.current) suppressClick.current = false;
          else onToggle();
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 || disabled) return;
          suppressClick.current = false;
          press.current = {
            x: event.clientX,
            y: event.clientY,
            timer: window.setTimeout(() => {
              press.current = null;
              suppressClick.current = true;
              navigator.vibrate?.(10);
              onEdit();
            }, LONG_PRESS_MS),
          };
        }}
        onPointerMove={(event) => {
          const start = press.current;
          if (
            start &&
            Math.hypot(event.clientX - start.x, event.clientY - start.y) >
              GESTURE_SLOP_PX
          )
            cancel();
        }}
        onPointerUp={cancel}
        onPointerCancel={cancel}
        onContextMenu={(event) => event.preventDefault()}
      >
        <Pictogram icon={icon} fallback={fallback} size={36} />
        <span className="list-tile-name">{row.label}</span>
        <span className="list-tile-quantity">{amountText(row)}</span>
      </button>
      <Button
        type="button"
        variant="ghost"
        className="icon-action list-tile-edit"
        aria-haspopup="dialog"
        aria-label={m["shopping.edit_item"]({ name: row.label })}
        title={m["shopping.edit_item"]({ name: row.label })}
        onClick={onEdit}
      >
        <Pencil size={16} aria-hidden="true" />
      </Button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

function GestureHint({ tiles }: { tiles: boolean }) {
  const [visible, setVisible] = useState(
    () =>
      window.matchMedia("(pointer: coarse)").matches &&
      localStorage.getItem(HINT_KEY) !== "1",
  );
  if (!visible) return null;
  return (
    <p className="gesture-hint">
      <span>
        {tiles
          ? m["shopping.gesture_hint_tiles"]()
          : m["shopping.gesture_hint"]()}
      </span>
      <Button
        type="button"
        variant="ghost"
        className="icon-action"
        aria-label={m["shopping.dismiss_hint"]()}
        onClick={() => {
          localStorage.setItem(HINT_KEY, "1");
          setVisible(false);
        }}
      >
        <X size={18} aria-hidden="true" />
      </Button>
    </p>
  );
}

export function ShoppingItems({
  list,
  categories,
  categoryOrder,
  learned,
  onActivity,
  onQuickAdd,
}: {
  list: ShoppingList;
  categories: Category[];
  categoryOrder?: string[] | null;
  learned?: LearnedOrder;
  onActivity: () => string | null;
  onQuickAdd: () => void;
}) {
  const events = useShoppingEvents(list.id);
  const sheet = useRef<HTMLDialogElement>(null);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [actionRow, setActionRow] = useState<string | null>(null);
  const [settling, setSettling] = useState<Record<string, MergedItem>>({});
  const [view, setView] = useState<"rows" | "tiles">(() =>
    readPreference(VIEW_KEY) === "tiles" ? "tiles" : "rows",
  );
  const tiles = view === "tiles";
  const rows = mergeShoppingItems(
    list.items.map((item) => ({
      ...item,
      label: item.ingredient ? ingredientName(item.ingredient) : item.label,
      factors: item.ingredient
        ? {
            densityGPerMl: item.ingredient.densityGPerMl,
            pieceWeightG: item.ingredient.pieceWeightG,
          }
        : undefined,
    })),
  );
  const checkedById = new Map(
    list.items.map((item) => [item.id, item.checked]),
  );
  const openKeys = new Set(
    rows.filter((row) => !row.checked).map((row) => row.key),
  );
  const settled = Object.values(settling).filter(
    (row) =>
      !openKeys.has(row.key) &&
      row.itemIds.every((id) => checkedById.get(id) === true),
  );
  const settlingIds = new Set(settled.flatMap((row) => row.itemIds));
  const settlingKeys = new Set(settled.map((row) => row.key));
  const open = sortShoppingItems(
    [...rows.filter((row) => !row.checked), ...settled],
    categories,
    categoryOrder,
    learned ?? NO_LEARNING,
  );
  const done = rows.filter(
    (row) => row.checked && !row.itemIds.some((id) => settlingIds.has(id)),
  );
  const runs: { categoryId: string | null; rows: MergedItem[] }[] = [];
  for (const row of open) {
    const last = runs.at(-1);
    if (last && last.categoryId === row.categoryId) last.rows.push(row);
    else runs.push({ categoryId: row.categoryId, rows: [row] });
  }
  const categoryName = (id: string | null) => {
    const category = categories.find((item) => item.id === id);
    return category ? ingredientName(category) : m["shopping.uncategorized"]();
  };
  const editing = rows.find((row) => row.key === editKey);
  const checkedIds = list.items
    .filter((item) => item.checked)
    .map((item) => item.id);

  if (!rows.length)
    return (
      <EmptyState
        icon={ShoppingBasket}
        title={m.list_empty_title()}
        description={m["shopping.empty_hint"]()}
      >
        <Button type="button" onClick={onQuickAdd}>
          {m["shopping.quick_sheet"]()}
        </Button>
      </EmptyState>
    );

  function send(
    ids: string[],
    type: "item_checked" | "item_unchecked",
    label: string,
    storeId: string | null,
  ) {
    const inverse = type === "item_checked" ? "item_unchecked" : "item_checked";
    events.mutate(
      ids.map((id) => itemEvent(id, type, storeId)),
      {
        onSuccess: () =>
          toast(
            type === "item_checked"
              ? m["shopping.checked_toast"]({ name: label })
              : m["shopping.unchecked_toast"]({ name: label }),
            {
              className: "shopping-feedback",
              action: {
                label: m["shopping.undo"](),
                onClick: () =>
                  events.mutate(
                    ids.map((id) => itemEvent(id, inverse, storeId)),
                  ),
              },
            },
          ),
      },
    );
  }

  function toggle(row: MergedItem) {
    setActionRow(row.key);
    const storeId = onActivity();
    if (settlingKeys.has(row.key)) {
      setSettling(({ [row.key]: _, ...rest }) => rest);
      send(row.itemIds, "item_unchecked", row.label, storeId);
      return;
    }
    if (row.checked) {
      send(row.itemIds, "item_unchecked", row.label, storeId);
      return;
    }
    setSettling((current) => ({ ...current, [row.key]: row }));
    window.setTimeout(
      () => setSettling(({ [row.key]: _, ...rest }) => rest),
      SETTLE_MS,
    );
    send(row.itemIds, "item_checked", row.label, storeId);
  }

  function remove(row: MergedItem) {
    setActionRow(row.key);
    const removed = list.items.filter((item) => row.itemIds.includes(item.id));
    events.mutate(
      row.itemIds.map((id) => itemEvent(id, "item_removed")),
      {
        onSuccess: () =>
          toast(m["shopping.removed_toast"]({ name: row.label }), {
            className: "shopping-feedback",
            action: {
              label: m["shopping.undo"](),
              onClick: () =>
                events.mutate(
                  removed.flatMap((item) => {
                    const restore = { ...addItemEvent(item), itemId: item.id };
                    return item.checked
                      ? [restore, itemEvent(item.id, "item_checked")]
                      : [restore];
                  }),
                ),
            },
          }),
      },
    );
  }

  const renderRow = (row: MergedItem) => {
    const shared = {
      row,
      checked: row.checked || settlingKeys.has(row.key),
      disabled: events.isPending,
      icon: list.items.find((item) => item.id === row.itemIds[0])?.ingredient
        ?.icon,
      fallback: categories.find((category) => category.id === row.categoryId)
        ?.icon,
      error:
        actionRow === row.key && events.isError
          ? errorMessage(events.error)
          : undefined,
      onToggle: () => toggle(row),
      onEdit: () => {
        setEditKey(row.key);
        sheet.current?.showModal();
      },
    };
    if (!tiles)
      return (
        <ShoppingRow
          key={row.key}
          {...shared}
          recipes={list.recipes}
          onRemove={() => remove(row)}
        />
      );
    const categoryIndex = categories.findIndex(
      (category) => category.id === row.categoryId,
    );
    return (
      <ShoppingTile
        key={row.key}
        {...shared}
        hue={categoryIndex < 0 ? undefined : (categoryIndex * 47 + 20) % 360}
      />
    );
  };
  const itemsClass = tiles ? "list-tiles" : "list-items";

  return (
    <div className="shopping-items">
      <GestureHint tiles={tiles} />
      <fieldset className="list-view-toggle">
        <legend className="sr-only">{m["shopping.view_label"]()}</legend>
        {(["rows", "tiles"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={view === value}
            aria-label={
              value === "rows"
                ? m["shopping.view_rows"]()
                : m["shopping.view_tiles"]()
            }
            title={
              value === "rows"
                ? m["shopping.view_rows"]()
                : m["shopping.view_tiles"]()
            }
            onClick={() => {
              setView(value);
              writePreference(VIEW_KEY, value);
            }}
          >
            {value === "rows" ? (
              <Rows3 size={18} aria-hidden="true" />
            ) : (
              <Grid2x2 size={18} aria-hidden="true" />
            )}
          </button>
        ))}
      </fieldset>
      {runs.map((run) => (
        <section key={run.rows[0]?.key} className="shopping-category">
          <h2 className="section-label">{categoryName(run.categoryId)}</h2>
          <ul className={itemsClass}>{run.rows.map(renderRow)}</ul>
        </section>
      ))}
      {!!done.length && (
        <section className="shopping-category shopping-done">
          <div className="shopping-done-heading">
            <h2 className="section-label">
              {m["shopping.done_count"]({ count: done.length })}
            </h2>
            <Button
              variant="ghost"
              disabled={events.isPending}
              onClick={() =>
                events.mutate(
                  checkedIds.map((id) => itemEvent(id, "item_removed")),
                )
              }
            >
              {m["shopping.clear_checked"]()}
            </Button>
          </div>
          <ul className={itemsClass}>{done.map(renderRow)}</ul>
        </section>
      )}
      <Sheet
        ref={sheet}
        title={m["shopping.edit_title"]()}
        meta={editing?.label}
        onClose={() => setEditKey(null)}
      >
        {editing && (
          <>
            {editing.itemIds.length > 1 && (
              <p className="meta">
                {m["shopping.edit_entries"]({ count: editing.itemIds.length })}
              </p>
            )}
            {list.items
              .filter((item) => editing.itemIds.includes(item.id))
              .map((item, index) => (
                <div
                  key={`${item.id}-${item.updatedAt}`}
                  className={
                    editing.itemIds.length > 1
                      ? "shopping-individual"
                      : "shopping-individual is-single"
                  }
                >
                  {editing.itemIds.length > 1 && (
                    <h3>{m["shopping.entry_number"]({ number: index + 1 })}</h3>
                  )}
                  <RecipeSources
                    sources={item.sources}
                    recipes={list.recipes}
                  />
                  <ItemForm
                    listId={list.id}
                    categories={categories}
                    item={item}
                  />
                </div>
              ))}
            {editing.itemIds.length > 1 && (
              <Button
                variant="ghost"
                className="button-danger-text"
                disabled={events.isPending}
                onClick={() =>
                  events.mutate(
                    editing.itemIds.map((id) => itemEvent(id, "item_removed")),
                    { onSuccess: () => sheet.current?.close() },
                  )
                }
              >
                <Trash2 size={18} aria-hidden="true" />
                {m["shopping.remove_all"]()}
              </Button>
            )}
          </>
        )}
      </Sheet>
    </div>
  );
}
