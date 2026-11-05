import { useQuery } from "@tanstack/react-query";
import { parseIngredientLine, quickAddFields } from "@yumi/shared";
import { LayoutGrid, Plus } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import {
  type CreatedIngredient,
  CreateIngredient,
} from "@/components/ingredients/create-ingredient";
import { Button } from "@/components/ui/button";
import { Pictogram } from "@/components/ui/pictogram";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/api-error";
import { ingredientName } from "@/lib/recipes";
import { useMe } from "@/lib/session";
import {
  addItemEvent,
  useShoppingCategories,
  useShoppingEvents,
} from "@/lib/shopping";
import { m } from "@/paraglide/messages";

export function QuickAdd({
  listId,
  onTiles,
}: {
  listId: string;
  onTiles: () => void;
}) {
  const id = useId();
  const householdId = useMe()?.activeHouseholdId;
  const events = useShoppingEvents(listId);
  const categories = useShoppingCategories();
  const [text, setText] = useState("");
  const [created, setCreated] = useState<CreatedIngredient | null>(null);
  const parsed = parseIngredientLine(text);
  const q = (parsed.name || text).trim();
  const suggestions = useQuery({
    queryKey: ["shopping", householdId, "catalog", q],
    enabled: !!householdId && q.length > 1,
    queryFn: async () =>
      (
        await ensureOk(await api.ingredients.$get({ query: { q, limit: "6" } }))
      ).json(),
  });
  const [matching, setMatching] = useState(false);
  const busy = events.isPending || matching;
  const add = (fields: ReturnType<typeof quickAddFields>) =>
    events.mutate([addItemEvent(fields)], {
      onSuccess: () => {
        setText("");
        setCreated(null);
      },
    });
  const knownName = suggestions.data?.some(
    (ingredient) =>
      ingredient.nameDe.toLocaleLowerCase() === q.toLocaleLowerCase() ||
      ingredient.nameEn.toLocaleLowerCase() === q.toLocaleLowerCase(),
  );
  return (
    <form
      className="quick-add"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!text.trim()) return;
        if (created) {
          add(
            quickAddFields(
              { ...parsed, unitText: null },
              {
                id: created.id,
                name: ingredientName(created),
                categoryId: created.categoryId,
              },
            ),
          );
          return;
        }
        setMatching(true);
        try {
          const [line] = await (
            await ensureOk(
              await api.ingredients.parse.$post({ json: { lines: [text] } }),
            )
          ).json();
          if (!line) return;
          add(
            quickAddFields(
              line,
              line.ingredient && {
                id: line.ingredient.id,
                name: ingredientName(line.ingredient),
                categoryId: line.ingredient.categoryId,
              },
            ),
          );
        } catch (error) {
          toast.error(errorMessage(error));
        } finally {
          setMatching(false);
        }
      }}
    >
      <label htmlFor={id} className="sr-only">
        {m["shopping.quick_label"]()}
      </label>
      <div className="quick-add-row">
        <input
          id={id}
          className="quick-add-input"
          value={text}
          autoComplete="off"
          enterKeyHint="done"
          maxLength={200}
          placeholder={m["shopping.quick_placeholder"]()}
          aria-describedby={`${id}-hint`}
          onChange={(event) => {
            setText(event.target.value);
            setCreated(null);
          }}
        />
        <Button
          variant={text.trim() ? "default" : "outline"}
          className="icon-action"
          aria-label={m["shopping.add"]()}
          disabled={busy || !text.trim()}
        >
          <Plus size={20} aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          className="icon-action"
          aria-label={m["shopping.quick_sheet"]()}
          aria-haspopup="dialog"
          onClick={onTiles}
        >
          <LayoutGrid size={20} aria-hidden="true" />
        </Button>
      </div>
      <p id={`${id}-hint`} className="sr-only">
        {m["shopping.quick_hint"]()}
      </p>
      {created && (
        <p className="row-detail" role="status">
          {m["ingredients.linked"]({ name: ingredientName(created) })}
        </p>
      )}
      {!created && q.length > 1 && q.length <= 100 && !knownName && (
        <CreateIngredient
          key={q}
          name={q}
          disabled={busy}
          onCreated={setCreated}
        />
      )}
      {suggestions.isError && (
        <p className="form-error" role="alert">
          {errorMessage(suggestions.error)}
        </p>
      )}
      {q.length > 1 && !!suggestions.data?.length && (
        <ul
          className="quick-suggestions"
          aria-label={m["shopping.suggestions"]()}
        >
          {suggestions.data.map((ingredient) => (
            <li key={ingredient.id}>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  add(
                    quickAddFields(
                      { ...parsed, unitText: null },
                      {
                        id: ingredient.id,
                        name: ingredientName(ingredient),
                        categoryId: ingredient.categoryId,
                      },
                    ),
                  )
                }
              >
                <Pictogram
                  icon={ingredient.icon}
                  fallback={
                    categories.data?.find(
                      (category) => category.id === ingredient.categoryId,
                    )?.icon
                  }
                />
                {ingredientName(ingredient)}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
