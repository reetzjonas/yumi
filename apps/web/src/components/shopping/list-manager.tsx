import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import { type ReactNode, useId, useRef, useState } from "react";
import { Field, FormError } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/api-error";
import { useMe } from "@/lib/session";
import { useShoppingLists } from "@/lib/shopping";
import { m } from "@/paraglide/messages";

type Panel = "menu" | "create" | "rename" | "delete";

type ListAction =
  | { type: "create"; name: string }
  | { type: "rename"; id: string; name: string }
  | { type: "delete"; id: string };

function useListAction(onSelect: (id: string) => void, onDone?: () => void) {
  const householdId = useMe()?.activeHouseholdId;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action: ListAction) => {
      if (action.type === "create") {
        const list = await (
          await ensureOk(
            await api.shopping.lists.$post({ json: { name: action.name } }),
          )
        ).json();
        onSelect(list.id);
      } else if (action.type === "rename") {
        await ensureOk(
          await api.shopping.lists[":id"].$patch({
            param: { id: action.id },
            json: { name: action.name },
          }),
        );
      } else {
        await ensureOk(
          await api.shopping.lists[":id"].$delete({
            param: { id: action.id },
          }),
        );
        onSelect("");
      }
    },
    onSuccess: async () => {
      onDone?.();
      await queryClient.invalidateQueries({
        queryKey: ["shopping", householdId],
      });
    },
  });
}

function ListNameForm({
  initial = "",
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: {
  initial?: string;
  submitLabel: string;
  pending: boolean;
  onSubmit: (name: string) => void;
  onCancel?: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(initial);
  return (
    <form
      className="shopping-list-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) onSubmit(name.trim());
      }}
    >
      <Field
        id={`${id}-name`}
        label={m["shopping.list_name"]()}
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
        maxLength={60}
      />
      <div className="recipe-actions">
        <Button disabled={pending || !name.trim()}>{submitLabel}</Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {m["recipes.cancel"]()}
          </Button>
        )}
      </div>
    </form>
  );
}

export function CreateListForm({
  onSelect,
}: {
  onSelect: (id: string) => void;
}) {
  const action = useListAction(onSelect);
  return (
    <>
      <ListNameForm
        submitLabel={m["shopping.create_list"]()}
        pending={action.isPending}
        onSubmit={(name) => action.mutate({ type: "create", name })}
      />
      <FormError message={action.isError ? errorMessage(action.error) : null} />
    </>
  );
}

export function ListManager({
  selectedId,
  onSelect,
  store,
  children,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
  store?: ReactNode;
  children?: ReactNode;
}) {
  const lists = useShoppingLists();
  const selected = lists.data?.find((list) => list.id === selectedId);
  const sheet = useRef<HTMLDialogElement>(null);
  const [panel, setPanel] = useState<Panel>("menu");
  const action = useListAction(onSelect, () => sheet.current?.close());
  if (!selected) return null;
  const name = selected.name;

  return (
    <div className="list-toolbar">
      <Button
        type="button"
        variant="outline"
        className="list-switch"
        aria-label={m["shopping.list_actions"]({ name })}
        aria-haspopup="dialog"
        onClick={() => {
          setPanel("menu");
          action.reset();
          sheet.current?.showModal();
        }}
      >
        <span>{name}</span>
        <ChevronDown size={18} aria-hidden="true" />
      </Button>
      {children}
      <Sheet
        ref={sheet}
        title={m["shopping.lists_title"]()}
        onClose={() => setPanel("menu")}
      >
        {panel === "menu" && (
          <>
            <ul className="list-rows">
              {lists.data?.map((list) => (
                <li key={list.id}>
                  <button
                    type="button"
                    className="list-row"
                    aria-current={list.id === selectedId}
                    onClick={() => {
                      onSelect(list.id);
                      sheet.current?.close();
                    }}
                  >
                    <span className="picker-row-main">
                      <span className="picker-row-title">{list.name}</span>
                      <span className="meta">
                        {m["shopping.open_count"]({ count: list.openCount })}
                      </span>
                    </span>
                    {list.id === selectedId && (
                      <span className="badge">{m["shopping.active"]()}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            <ul className="queue-menu">
              <li>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setPanel("create")}
                >
                  <Plus size={18} aria-hidden="true" />
                  {m["shopping.new_list"]()}
                </Button>
              </li>
              <li>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setPanel("rename")}
                >
                  <Pencil size={18} aria-hidden="true" />
                  {m["shopping.rename_list"]()}
                </Button>
              </li>
            </ul>
            {store}
            <ul className="queue-menu">
              <li>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setPanel("delete")}
                >
                  <Trash2 size={18} aria-hidden="true" />
                  {m["shopping.delete_list"]()}
                </Button>
              </li>
            </ul>
          </>
        )}
        {panel === "create" && (
          <ListNameForm
            submitLabel={m["shopping.create_list"]()}
            pending={action.isPending}
            onSubmit={(next) => action.mutate({ type: "create", name: next })}
            onCancel={() => setPanel("menu")}
          />
        )}
        {panel === "rename" && (
          <ListNameForm
            initial={name}
            submitLabel={m["shopping.save"]()}
            pending={action.isPending}
            onSubmit={(next) =>
              action.mutate({ type: "rename", id: selected.id, name: next })
            }
            onCancel={() => setPanel("menu")}
          />
        )}
        {panel === "delete" && (
          <section className="queue-remove-panel">
            <h3>{m["shopping.delete_confirm"]({ name })}</h3>
            <div className="recipe-actions">
              <Button
                type="button"
                variant="destructive"
                disabled={action.isPending}
                onClick={() =>
                  action.mutate({ type: "delete", id: selected.id })
                }
              >
                {m["shopping.delete_list"]()}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setPanel("menu")}
              >
                {m["recipes.cancel"]()}
              </Button>
            </div>
          </section>
        )}
        <FormError
          message={action.isError ? errorMessage(action.error) : null}
        />
      </Sheet>
    </div>
  );
}
