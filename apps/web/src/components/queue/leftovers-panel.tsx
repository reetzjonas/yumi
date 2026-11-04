import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { UNITS, unitSchema } from "@yumi/shared";
import { CalendarPlus } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api-error";
import {
  dismissLeftover,
  type Leftover,
  type LeftoverSuggestion,
  leftoversKey,
  updateLeftover,
  useLeftoverSuggestions,
  useLeftovers,
} from "@/lib/leftovers";
import { addQueueEntry, queueKey } from "@/lib/queue";
import {
  formatMinutes,
  formatQuantity,
  ingredientName,
  parseQuantityInput,
  quantityInputValue,
  totalMinutes,
  unitLabel,
} from "@/lib/recipes";
import { useMe } from "@/lib/session";
import { m } from "@/paraglide/messages";

function LeftoverRow({ leftover }: { leftover: Leftover }) {
  const id = useId();
  const householdId = useMe()?.activeHouseholdId;
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [quantityText, setQuantityText] = useState(
    quantityInputValue(leftover.quantity),
  );
  const [unit, setUnit] = useState(leftover.unit);
  const [invalid, setInvalid] = useState(false);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: leftoversKey(householdId) });
  const update = useMutation({
    mutationFn: ({ quantity }: { quantity: number }) =>
      updateLeftover(leftover.id, { quantity, unit }),
    onSuccess: () => setEditing(false),
    onSettled: refresh,
  });
  const dismiss = useMutation({
    mutationFn: () => dismissLeftover(leftover.id),
    onSettled: refresh,
  });
  const busy = update.isPending || dismiss.isPending;
  const name = ingredientName(leftover);

  return (
    <li className="shopping-entry">
      <div className="row shopping-row">
        <div className="row-main">
          <span className="row-title">{name}</span>
          <span className="row-detail tabular-nums">
            {formatQuantity(leftover.quantity, leftover.unit)}
          </span>
        </div>
        <div className="recipe-actions">
          <Button
            variant="ghost"
            disabled={busy}
            aria-expanded={editing}
            aria-controls={`${id}-edit`}
            aria-label={m["leftovers.edit"]({ name })}
            onClick={() => {
              setQuantityText(quantityInputValue(leftover.quantity));
              setUnit(leftover.unit);
              setInvalid(false);
              update.reset();
              setEditing(!editing);
            }}
          >
            {m["recipes.edit"]()}
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            aria-label={m["leftovers.dismiss"]({ name })}
            onClick={() => dismiss.mutate()}
          >
            {m["leftovers.dismiss_action"]()}
          </Button>
        </div>
      </div>
      {editing && (
        <form
          id={`${id}-edit`}
          className="shopping-expanded"
          onSubmit={(event) => {
            event.preventDefault();
            const quantity = parseQuantityInput(quantityText);
            if (
              quantity === null ||
              !Number.isFinite(quantity) ||
              quantity <= 0 ||
              quantity > 1_000_000
            ) {
              setInvalid(true);
              return;
            }
            setInvalid(false);
            update.mutate({ quantity });
          }}
        >
          <fieldset className="shopping-item-fields" disabled={busy}>
            <legend className="sr-only">{m["leftovers.edit"]({ name })}</legend>
            <div className="shopping-amount-fields">
              <Field
                id={`${id}-quantity`}
                label={m["recipes.ingredient_quantity"]()}
                inputMode="decimal"
                required
                value={quantityText}
                aria-invalid={invalid}
                aria-describedby={invalid ? `${id}-quantity-error` : undefined}
                onChange={(event) => {
                  setQuantityText(event.target.value);
                  setInvalid(false);
                }}
              />
              <div className="field">
                <label htmlFor={`${id}-unit`}>
                  {m["recipes.ingredient_unit"]()}
                </label>
                <select
                  id={`${id}-unit`}
                  value={unit}
                  onChange={(event) => {
                    const parsed = unitSchema.safeParse(event.target.value);
                    if (parsed.success) setUnit(parsed.data);
                  }}
                >
                  {UNITS.map((value) => (
                    <option key={value} value={value}>
                      {unitLabel(value)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {invalid && (
              <p
                id={`${id}-quantity-error`}
                className="form-error"
                role="alert"
              >
                {m["leftovers.invalid_quantity"]()}
              </p>
            )}
            <div className="recipe-actions">
              <Button variant="secondary" type="submit">
                {m["queue.save"]()}
              </Button>
              <Button
                variant="ghost"
                type="button"
                onClick={() => setEditing(false)}
              >
                {m["queue.cancel"]()}
              </Button>
            </div>
          </fieldset>
        </form>
      )}
      {(update.isError || dismiss.isError) && (
        <p className="form-error" role="alert">
          {errorMessage(update.isError ? update.error : dismiss.error)}
        </p>
      )}
    </li>
  );
}

function SuggestionRow({ recipe }: { recipe: LeftoverSuggestion }) {
  const householdId = useMe()?.activeHouseholdId;
  const queryClient = useQueryClient();
  const add = useMutation({
    mutationFn: () =>
      addQueueEntry({
        recipeId: recipe.id,
        servings: recipe.servings,
        plannedFor: null,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queueKey(householdId) }),
        queryClient.invalidateQueries({ queryKey: leftoversKey(householdId) }),
      ]);
      toast.success(m["queue.added"]());
    },
  });

  return (
    <li>
      <div className="row shopping-row">
        <div className="row-main">
          <Link
            className="row-title text-link"
            to="/recipes/$id"
            params={{ id: recipe.id }}
          >
            {recipe.title}
          </Link>
          <span className="row-detail">
            {[
              m["leftovers.servings"]({ count: recipe.servings }),
              totalMinutes(recipe) > 0 && formatMinutes(totalMinutes(recipe)),
              recipe.leftoverCoverage > 0
                ? m["leftovers.uses_leftovers"]()
                : m["leftovers.uses_similar"](),
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        <Button
          variant="secondary"
          disabled={add.isPending}
          aria-label={m["leftovers.add_recipe"]({ name: recipe.title })}
          onClick={() => add.mutate()}
        >
          <CalendarPlus size={18} aria-hidden="true" />
          {add.isPending ? m["queue.adding"]() : m["queue.add"]()}
        </Button>
      </div>
      {add.isError && (
        <p className="form-error" role="alert">
          {errorMessage(add.error)}
        </p>
      )}
    </li>
  );
}

export function LeftoversPanel() {
  const id = useId();
  const [similar, setSimilar] = useState(false);
  const leftovers = useLeftovers();
  const suggestions = useLeftoverSuggestions(similar);

  return (
    <section className="queue-shopping" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{m["leftovers.title"]()}</h2>
      <p className="row-detail">{m["leftovers.hint"]()}</p>
      {leftovers.isPending ? (
        <p role="status">{m["shopping.loading"]()}</p>
      ) : leftovers.isError ? (
        <div className="queue-preview-group">
          <p className="form-error" role="alert">
            {errorMessage(leftovers.error)}
          </p>
          <Button
            variant="secondary"
            disabled={leftovers.isFetching}
            onClick={() => leftovers.refetch()}
          >
            {m["queue.retry"]()}
          </Button>
        </div>
      ) : leftovers.data.length ? (
        <ul className="queue-preview-items">
          {leftovers.data.map((leftover) => (
            <LeftoverRow key={leftover.id} leftover={leftover} />
          ))}
        </ul>
      ) : (
        <p className="row-detail">{m["leftovers.empty"]()}</p>
      )}
      <section
        className="queue-preview-group"
        aria-labelledby={`${id}-recipes`}
      >
        <h3 id={`${id}-recipes`}>{m["leftovers.suggestions"]()}</h3>
        <label className="queue-checkbox">
          <input
            type="checkbox"
            checked={similar}
            onChange={(event) => setSimilar(event.target.checked)}
          />
          <span>{m["leftovers.include_similar"]()}</span>
        </label>
        {suggestions.isPending ? (
          <p role="status">{m["shopping.loading"]()}</p>
        ) : suggestions.isError ? (
          <div className="queue-preview-group">
            <p className="form-error" role="alert">
              {errorMessage(suggestions.error)}
            </p>
            <Button
              variant="secondary"
              disabled={suggestions.isFetching}
              onClick={() => suggestions.refetch()}
            >
              {m["queue.retry"]()}
            </Button>
          </div>
        ) : suggestions.data.length ? (
          <ul className="queue-preview-items">
            {suggestions.data.map((recipe) => (
              <SuggestionRow key={recipe.id} recipe={recipe} />
            ))}
          </ul>
        ) : (
          <p className="row-detail">{m["leftovers.no_suggestions"]()}</p>
        )}
      </section>
    </section>
  );
}
