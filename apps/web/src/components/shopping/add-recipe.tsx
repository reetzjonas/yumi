import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/auth-layout";
import { StapleCheck } from "@/components/shopping/staple-check";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/api-error";
import { getLocale } from "@/lib/i18n";
import { useMe } from "@/lib/session";
import { useShoppingLists } from "@/lib/shopping";
import { m } from "@/paraglide/messages";

type StapleItems = Parameters<typeof StapleCheck>[0]["staples"];

export function AddRecipeToList({
  recipeId,
  servings: defaultServings,
}: {
  recipeId: string;
  servings: number;
}) {
  const id = useId();
  const householdId = useMe()?.activeHouseholdId;
  const lists = useShoppingLists();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const [servings, setServings] = useState(String(defaultServings));
  const [staples, setStaples] = useState<{
    listId: string;
    items: StapleItems;
  } | null>(null);
  const listId = lists.data?.some((list) => list.id === selectedId)
    ? selectedId
    : (lists.data?.[0]?.id ?? "");
  const add = useMutation({
    mutationFn: async () =>
      (
        await ensureOk(
          await api.shopping.lists[":id"].recipes.$post({
            param: { id: listId },
            json: { recipeId, servings: Number(servings), locale: getLocale() },
          }),
        )
      ).json(),
    onSuccess: async ({ added, staples: skipped }) => {
      setStaples(skipped.length ? { listId, items: skipped } : null);
      await queryClient.invalidateQueries({
        queryKey: ["shopping", householdId],
      });
      toast.success(m["shopping.recipe_added"]({ count: added }));
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <section className="section shopping-recipe">
      <h2>{m["shopping.add_recipe"]()}</h2>
      {lists.isPending ? (
        <p role="status">{m["shopping.loading"]()}</p>
      ) : lists.isError ? (
        <p className="form-error" role="alert">
          {errorMessage(lists.error)}
        </p>
      ) : !listId ? (
        <>
          <p>{m["shopping.recipe_needs_list"]()}</p>
          <Button asChild>
            <Link to="/list">{m["shopping.create_list"]()}</Link>
          </Button>
        </>
      ) : (
        <form
          className="shopping-recipe-form"
          onSubmit={(event) => {
            event.preventDefault();
            const amount = Number(servings);
            if (Number.isInteger(amount) && amount >= 1 && amount <= 100)
              add.mutate();
          }}
        >
          <div className="field">
            <label htmlFor={`${id}-list`}>{m["shopping.choose_list"]()}</label>
            <select
              id={`${id}-list`}
              value={listId}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {lists.data?.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </select>
          </div>
          <Field
            id={`${id}-servings`}
            label={m["recipes.servings"]()}
            type="number"
            min={1}
            max={100}
            step={1}
            required
            value={servings}
            onChange={(event) => setServings(event.target.value)}
          />
          <Button disabled={add.isPending}>{m["shopping.add_recipe"]()}</Button>
        </form>
      )}
      {staples && (
        <StapleCheck
          listId={staples.listId}
          staples={staples.items}
          onDone={(remaining) =>
            setStaples(
              remaining.length ? { ...staples, items: remaining } : null,
            )
          }
        />
      )}
    </section>
  );
}
