import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/auth-layout";
import {
  IngredientChecklist,
  useChecklist,
} from "@/components/shopping/ingredient-checklist";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/api-error";
import { getLocale } from "@/lib/i18n";
import { formatShoppingQuantity, unitLabel } from "@/lib/recipes";
import { useMe } from "@/lib/session";
import { useShoppingLists } from "@/lib/shopping";
import { m } from "@/paraglide/messages";

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
  const listId = lists.data?.some((list) => list.id === selectedId)
    ? selectedId
    : (lists.data?.[0]?.id ?? "");
  const amount = Number(servings);
  const validServings =
    Number.isInteger(amount) && amount >= 1 && amount <= 100;
  const locale = getLocale();
  const preview = useQuery({
    queryKey: [
      "shopping",
      householdId,
      "recipe-preview",
      recipeId,
      amount,
      locale,
    ],
    enabled: Boolean(householdId) && validServings,
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (
        await ensureOk(
          await api.shopping["recipe-preview"].$post({
            json: { recipeId, servings: amount, locale },
          }),
        )
      ).json(),
  });
  const rows = (preview.data?.lines ?? []).map((line) => ({
    key: line.id,
    label: line.label,
    amount:
      line.quantity !== null
        ? formatShoppingQuantity(line.quantity, line.unit)
        : line.unit
          ? unitLabel(line.unit)
          : "",
    staple: line.staple,
  }));
  const checklist = useChecklist(rows);
  const count = checklist.selected.length;
  const add = useMutation({
    mutationFn: async () =>
      (
        await ensureOk(
          await api.shopping.lists[":id"].recipes.$post({
            param: { id: listId },
            json: {
              recipeId,
              servings: amount,
              locale,
              lineIds: checklist.selected,
            },
          }),
        )
      ).json(),
    onSuccess: async ({ added }) => {
      await queryClient.invalidateQueries({
        queryKey: ["shopping", householdId],
      });
      toast.success(m["shopping.recipe_added"]({ count: added }));
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <div className="shopping-recipe">
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
            if (validServings && count && !preview.isFetching) add.mutate();
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
          {preview.isError ? (
            <p className="form-error" role="alert">
              {errorMessage(preview.error)}
            </p>
          ) : !preview.data ? (
            validServings && <p role="status">{m["shopping.loading"]()}</p>
          ) : rows.length ? (
            <IngredientChecklist
              rows={rows}
              checklist={checklist}
              disabled={add.isPending}
            />
          ) : (
            <p>{m["shopping.recipe_no_ingredients"]()}</p>
          )}
          <Button
            disabled={
              add.isPending || preview.isFetching || !validServings || !count
            }
          >
            {count === 1
              ? m["shopping.add_selected_one"]()
              : m["shopping.add_selected"]({ count })}
          </Button>
        </form>
      )}
    </div>
  );
}
