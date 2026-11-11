import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UNITS, type Unit, unitSchema } from "@yumi/shared";
import { Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/auth-layout";
import { CatalogPicker } from "@/components/shopping/catalog-picker";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/api-error";
import { formatDate, getLocale } from "@/lib/i18n";
import {
  formatQuantity,
  ingredientName,
  parseQuantityInput,
  unitLabel,
} from "@/lib/recipes";
import { useMe } from "@/lib/session";
import { m } from "@/paraglide/messages";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];
const INTERVALS = [1, 2, 3, 4];

/** 2026-11-01 is a Sunday, so day n of that week has weekday n. */
const weekdayName = (weekday: number) =>
  new Intl.DateTimeFormat(getLocale(), {
    weekday: "long",
    timeZone: "UTC",
  }).format(Date.UTC(2026, 10, 1 + weekday));

export function RecurringItems({ listId }: { listId: string }) {
  const id = useId();
  const householdId = useMe()?.activeHouseholdId;
  const queryClient = useQueryClient();
  const queryKey = ["shopping", householdId, "recurring", listId];
  const rules = useQuery({
    queryKey,
    enabled: !!householdId,
    queryFn: async () =>
      (
        await ensureOk(
          await api.shopping.lists[":id"].recurring.$get({
            param: { id: listId },
          }),
        )
      ).json(),
  });
  const [label, setLabel] = useState("");
  const [ingredient, setIngredient] = useState<{
    id: string;
    categoryId: string | null;
  } | null>(null);
  const [quantityText, setQuantityText] = useState("");
  const [unit, setUnit] = useState<Unit | null>(null);
  const [weekday, setWeekday] = useState(6);
  const [intervalWeeks, setIntervalWeeks] = useState(1);
  const invalidate = () => queryClient.invalidateQueries({ queryKey });
  const create = useMutation({
    mutationFn: async (quantity: number | null) =>
      ensureOk(
        await api.shopping.lists[":id"].recurring.$post({
          param: { id: listId },
          json: {
            label: label.trim(),
            ingredientId: ingredient?.id ?? null,
            categoryId: ingredient?.categoryId ?? null,
            quantity,
            unit: quantity === null ? null : unit,
            weekday,
            intervalWeeks,
          },
        }),
      ),
    onSuccess: async () => {
      setLabel("");
      setIngredient(null);
      setQuantityText("");
      setUnit(null);
      await invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: async (ruleId: string) =>
      ensureOk(
        await api.shopping.recurring[":id"].$delete({ param: { id: ruleId } }),
      ),
    onSettled: invalidate,
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <section className="recurring-items">
      {rules.isError && (
        <p className="form-error" role="alert">
          {errorMessage(rules.error)}
        </p>
      )}
      {!!rules.data?.length && (
        <ul className="row-list store-list">
          {rules.data.map((rule) => {
            const name = rule.ingredient
              ? ingredientName(rule.ingredient)
              : rule.label;
            const ruleUnit = unitSchema.safeParse(rule.unit).data ?? null;
            const day = weekdayName(rule.weekday);
            return (
              <li key={rule.id} className="row">
                <div className="row-main">
                  <span className="row-title">
                    {rule.quantity !== null &&
                      `${formatQuantity(rule.quantity, ruleUnit)} `}
                    {name}
                  </span>
                  <span className="row-detail">
                    {rule.intervalWeeks === 1
                      ? m["recurring.every_week"]({ day })
                      : m["recurring.every_n_weeks"]({
                          count: rule.intervalWeeks,
                          day,
                        })}
                    {" · "}
                    {m["recurring.next"]({
                      date: formatDate(new Date(`${rule.nextDue}T00:00:00Z`), {
                        dateStyle: "medium",
                        timeZone: "UTC",
                      }),
                    })}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  aria-label={m["recurring.remove"]({ name })}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(rule.id)}
                >
                  <Trash2 aria-hidden="true" size={18} />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <form
        className="shopping-item-form"
        onSubmit={(event) => {
          event.preventDefault();
          const quantity = parseQuantityInput(quantityText);
          if (
            quantity !== null &&
            (!Number.isFinite(quantity) ||
              quantity <= 0 ||
              quantity > 1_000_000)
          ) {
            toast.error(m["shopping.invalid_quantity"]());
            return;
          }
          if (label.trim()) create.mutate(quantity);
        }}
      >
        <h3 className="section-label">{m["recurring.add"]()}</h3>
        <fieldset className="shopping-item-fields" disabled={create.isPending}>
          <Field
            id={`${id}-label`}
            label={m["shopping.item_label"]()}
            value={label}
            required
            maxLength={200}
            onChange={(event) => {
              setLabel(event.target.value);
              setIngredient(null);
            }}
          />
          <CatalogPicker
            onSelect={(picked) => {
              setLabel(ingredientName(picked));
              setIngredient({ id: picked.id, categoryId: picked.categoryId });
            }}
          />
          <div className="shopping-amount-fields">
            <Field
              id={`${id}-quantity`}
              label={m["recipes.ingredient_quantity"]()}
              inputMode="decimal"
              value={quantityText}
              onChange={(event) => setQuantityText(event.target.value)}
            />
            <div className="field">
              <label htmlFor={`${id}-unit`}>
                {m["recipes.ingredient_unit"]()}
              </label>
              <select
                id={`${id}-unit`}
                value={unit ?? ""}
                onChange={(event) =>
                  setUnit(unitSchema.safeParse(event.target.value).data ?? null)
                }
              >
                <option value="">{m["recipes.ingredient_no_unit"]()}</option>
                {UNITS.map((value) => (
                  <option key={value} value={value}>
                    {unitLabel(value)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="shopping-amount-fields">
            <div className="field">
              <label htmlFor={`${id}-weekday`}>
                {m["recurring.weekday"]()}
              </label>
              <select
                id={`${id}-weekday`}
                value={weekday}
                onChange={(event) => setWeekday(Number(event.target.value))}
              >
                {WEEKDAYS.map((day) => (
                  <option key={day} value={day}>
                    {weekdayName(day)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${id}-interval`}>
                {m["recurring.interval"]()}
              </label>
              <select
                id={`${id}-interval`}
                value={intervalWeeks}
                onChange={(event) =>
                  setIntervalWeeks(Number(event.target.value))
                }
              >
                {INTERVALS.map((weeks) => (
                  <option key={weeks} value={weeks}>
                    {weeks === 1
                      ? m["recurring.weekly"]()
                      : m["recurring.every_weeks"]({ count: weeks })}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Button variant="secondary" disabled={!label.trim()}>
            {m["recurring.add"]()}
          </Button>
        </fieldset>
      </form>
    </section>
  );
}
