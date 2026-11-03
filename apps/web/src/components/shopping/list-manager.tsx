import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/api-error";
import { useMe } from "@/lib/session";
import { useShoppingLists } from "@/lib/shopping";
import { m } from "@/paraglide/messages";

export function ListManager({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const householdId = useMe()?.activeHouseholdId;
  const queryClient = useQueryClient();
  const lists = useShoppingLists();
  const selected = lists.data?.find((list) => list.id === selectedId);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const manage = useMutation({
    mutationFn: async (action: "create" | "rename" | "delete") => {
      if (action === "create") {
        const list = await (
          await ensureOk(
            await api.shopping.lists.$post({ json: { name: name.trim() } }),
          )
        ).json();
        onSelect(list.id);
      } else if (action === "rename") {
        await ensureOk(
          await api.shopping.lists[":id"].$patch({
            param: { id: selectedId },
            json: { name: name.trim() },
          }),
        );
      } else {
        await ensureOk(
          await api.shopping.lists[":id"].$delete({
            param: { id: selectedId },
          }),
        );
        onSelect("");
      }
    },
    onSuccess: async () => {
      setName("");
      setRenaming(false);
      await queryClient.invalidateQueries({
        queryKey: ["shopping", householdId],
      });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <section className="section shopping-manager">
      {!!lists.data?.length && (
        <>
          <div className="field">
            <label htmlFor="shopping-list">{m["shopping.choose_list"]()}</label>
            <select
              id="shopping-list"
              value={selectedId}
              onChange={(event) => {
                onSelect(event.target.value);
                setRenaming(false);
                setName("");
              }}
            >
              {lists.data.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name} ({list.openCount})
                </option>
              ))}
            </select>
          </div>
          <div className="recipe-actions">
            <Button
              variant="secondary"
              disabled={manage.isPending}
              onClick={() => {
                setName(selected?.name ?? "");
                setRenaming(true);
              }}
            >
              {m["shopping.rename_list"]()}
            </Button>
            <Button
              variant="ghost"
              disabled={manage.isPending}
              onClick={() => {
                if (
                  selected &&
                  window.confirm(
                    m["shopping.delete_confirm"]({ name: selected.name }),
                  )
                )
                  manage.mutate("delete");
              }}
            >
              {m["shopping.delete_list"]()}
            </Button>
          </div>
        </>
      )}
      <form
        className="shopping-list-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) manage.mutate(renaming ? "rename" : "create");
        }}
      >
        <Field
          id="shopping-list-name"
          label={m["shopping.list_name"]()}
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={60}
        />
        <div className="recipe-actions">
          <Button
            variant={selectedId ? "secondary" : "default"}
            disabled={manage.isPending || !name.trim()}
          >
            {renaming ? m["shopping.save"]() : m["shopping.create_list"]()}
          </Button>
          {renaming && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setRenaming(false);
                setName("");
              }}
            >
              {m["recipes.cancel"]()}
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
