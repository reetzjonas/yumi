import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { MergedItem } from "@yumi/shared";
import { useId, useRef, useState } from "react";
import {
  IngredientChecklist,
  useChecklist,
} from "@/components/shopping/ingredient-checklist";
import { Button } from "@/components/ui/button";
import { ApiError, errorMessage } from "@/lib/api-error";
import { getLocale } from "@/lib/i18n";
import { leftoversKey } from "@/lib/leftovers";
import {
  addQueueShopping,
  previewQueueShopping,
  type QueueEntry,
  type QueueShoppingInput,
} from "@/lib/queue";
import { formatShoppingQuantity } from "@/lib/recipes";
import { useMe } from "@/lib/session";
import { useShoppingLists } from "@/lib/shopping";
import { m } from "@/paraglide/messages";

function checklistRows(
  items: MergedItem[],
  entries: QueueEntry[],
  staple: boolean,
) {
  return items.map((item) => ({
    key: item.key,
    label: item.label,
    amount: item.amounts
      .map((amount) => formatShoppingQuantity(amount.quantity, amount.unit))
      .join(" + "),
    detail: entries
      .filter((entry) =>
        item.sources.some(
          (source) =>
            (source.kind === "queue" && source.id === entry.id) ||
            (source.kind === "recipe" && source.id === entry.recipeId),
        ),
      )
      .map((entry) => entry.title)
      .filter((title, index, titles) => titles.indexOf(title) === index)
      .join(" · "),
    staple,
  }));
}

export function QueueShoppingPreview({
  entries,
  disabled,
  onPendingChange,
  onAdded,
}: {
  entries: QueueEntry[];
  disabled: boolean;
  onPendingChange: (pending: boolean) => void;
  onAdded: (added: number) => void;
}) {
  const id = useId();
  const householdId = useMe()?.activeHouseholdId;
  const queryClient = useQueryClient();
  const lists = useShoppingLists();
  const [selectedList, setSelectedList] = useState("");
  const request = useRef<{
    fingerprint: string;
    input: QueueShoppingInput;
  } | null>(null);
  const listId = lists.data?.some((list) => list.id === selectedList)
    ? selectedList
    : (lists.data?.[0]?.id ?? "");
  const preview = useMutation({
    mutationFn: previewQueueShopping,
  });
  const add = useMutation({
    mutationFn: addQueueShopping,
    onMutate: () => onPendingChange(true),
    onSuccess: async ({ added }) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["shopping", householdId],
        }),
        queryClient.invalidateQueries({
          queryKey: leftoversKey(householdId),
        }),
      ]);
      onAdded(added);
    },
    onSettled: () => onPendingChange(false),
  });
  const stale =
    add.isError &&
    add.error instanceof ApiError &&
    add.error.code === "invalid_input";
  const data = preview.data;
  const busy = disabled || preview.isPending || add.isPending;
  const rows = data
    ? [
        ...checklistRows(data.items, entries, false),
        ...checklistRows(data.staples, entries, true),
      ]
    : [];
  const checklist = useChecklist(rows);
  const itemCount = checklist.selected.length;

  function loadPreview() {
    if (!entries.length) return;
    add.reset();
    checklist.reset();
    request.current = null;
    preview.mutate({
      ids: entries.map((entry) => entry.id),
      locale: getLocale(),
    });
  }

  return (
    <div className="queue-shopping">
      <p role="status">
        {entries.length
          ? m["queue.selected_count"]({ count: entries.length })
          : m["queue.select_hint"]()}
      </p>
      <div className="recipe-actions">
        <Button
          type="button"
          variant={data || !entries.length ? "secondary" : "default"}
          disabled={busy || !entries.length}
          onClick={loadPreview}
        >
          {preview.isPending
            ? m["queue.preview_loading"]()
            : data
              ? m["queue.refresh_preview"]()
              : m["queue.preview"]()}
        </Button>
        {data && (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              preview.reset();
              add.reset();
            }}
          >
            {m["queue.cancel"]()}
          </Button>
        )}
      </div>
      {preview.isError && (
        <p className="form-error" role="alert">
          {errorMessage(preview.error)}
        </p>
      )}
      {data && !preview.isPending && (
        <div className="queue-shopping-preview" aria-busy={add.isPending}>
          {rows.length ? (
            <IngredientChecklist
              rows={rows}
              checklist={checklist}
              disabled={busy}
            />
          ) : (
            <p>{m["queue.preview_empty"]()}</p>
          )}
          {lists.isPending ? (
            <p role="status">{m["shopping.loading"]()}</p>
          ) : lists.isError ? (
            <div className="queue-preview-group">
              <p className="form-error" role="alert">
                {errorMessage(lists.error)}
              </p>
              <Button
                type="button"
                variant="secondary"
                disabled={lists.isFetching}
                onClick={() => lists.refetch()}
              >
                {m["queue.retry"]()}
              </Button>
            </div>
          ) : !listId ? (
            <p>
              {m["shopping.recipe_needs_list"]()}{" "}
              <Link className="text-link" to="/list">
                {m["shopping.create_list"]()}
              </Link>
            </p>
          ) : (
            <form
              className="queue-shopping-confirm"
              onSubmit={(event) => {
                event.preventDefault();
                if (!entries.length || !listId || !itemCount || busy || stale)
                  return;
                const payload = {
                  ids: entries.map((entry) => entry.id),
                  locale: getLocale(),
                  listId,
                  version: data.version,
                  keys: checklist.selected,
                };
                const fingerprint = JSON.stringify(payload);
                if (request.current?.fingerprint !== fingerprint) {
                  request.current = {
                    fingerprint,
                    input: { ...payload, requestId: crypto.randomUUID() },
                  };
                }
                add.mutate(request.current.input);
              }}
            >
              <div className="field">
                <label htmlFor={`${id}-list`}>
                  {m["shopping.choose_list"]()}
                </label>
                <select
                  id={`${id}-list`}
                  value={listId}
                  disabled={busy}
                  onChange={(event) => setSelectedList(event.target.value)}
                >
                  {lists.data.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                type="submit"
                disabled={busy || stale || !entries.length || !itemCount}
              >
                {add.isPending
                  ? m["queue.shopping_adding"]()
                  : itemCount === 1
                    ? m["shopping.add_selected_one"]()
                    : m["shopping.add_selected"]({ count: itemCount })}
              </Button>
            </form>
          )}
          {add.isError && (
            <p className="form-error" role="alert">
              {stale ? m["queue.preview_stale"]() : errorMessage(add.error)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
