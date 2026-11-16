import {
  type NutritionValues,
  nutritionForPortions,
  nutritionPer100g,
} from "@yumi/shared";
import { useState } from "react";
import { ServingsStepper } from "@/components/recipes/servings-selector";
import { formatNumber } from "@/lib/i18n";
import { type NutritionBasis, useNutritionBasis } from "@/lib/nutrition-basis";
import type { RecipeDetail } from "@/lib/recipes";
import { m } from "@/paraglide/messages";

export const NUTRIENTS = [
  ["energyKcal", m["nutrition.energy"], "kcal"],
  ["proteinG", m["nutrition.protein"], "g"],
  ["fatG", m["nutrition.fat"], "g"],
  ["carbsG", m["nutrition.carbs"], "g"],
  ["sugarG", m["nutrition.sugar"], "g"],
  ["fiberG", m["nutrition.fiber"], "g"],
  ["saltG", m["nutrition.salt"], "g"],
] as const satisfies readonly (readonly [
  keyof NutritionValues,
  () => string,
  string,
])[];

export function RecipeNutrition({
  nutrition,
  servings,
}: {
  nutrition: NonNullable<RecipeDetail["nutrition"]>;
  /** Base servings of the recipe, for the counted total weight. */
  servings: number;
}) {
  const [portions, setPortions] = useState(1);
  const [basis, setBasis] = useNutritionBasis();
  const per100g = nutritionPer100g(
    nutrition.perServing,
    nutrition.weightPerServingG,
  );
  const showPer100g = basis === "100g" && per100g !== null;
  const values = showPer100g
    ? per100g
    : nutritionForPortions(nutrition.perServing, portions);
  return (
    <details className="recipe-nutrition-details">
      <summary>{m["recipes.nutrition_title"]()}</summary>
      {per100g && (
        <fieldset
          className="segmented nutrition-basis"
          aria-label={m["recipes.nutrition_basis"]()}
        >
          {(["portion", "100g"] as const satisfies NutritionBasis[]).map(
            (value) => (
              <button
                key={value}
                type="button"
                aria-pressed={(showPer100g ? "100g" : "portion") === value}
                onClick={() => setBasis(value)}
              >
                {value === "portion"
                  ? m["recipes.nutrition_per_portion"]()
                  : m["recipes.nutrition_per_100g"]()}
              </button>
            ),
          )}
        </fieldset>
      )}
      {showPer100g ? (
        <p className="row-detail">
          {m["recipes.nutrition_per_100g_hint"]({
            grams: formatNumber(nutrition.weightPerServingG * servings, {
              maximumFractionDigits: 0,
            }),
          })}
        </p>
      ) : (
        <div className="nutrition-portions">
          <span>{m["recipes.nutrition_for"]()}</span>
          <ServingsStepper
            compact
            value={portions}
            onChange={setPortions}
            label={m["recipes.servings"]()}
          />
          <span>
            {portions === 1
              ? m["recipes.nutrition_portion"]()
              : m["recipes.nutrition_portions"]()}
          </span>
        </div>
      )}
      <dl className="recipe-nutrition">
        {NUTRIENTS.map(([key, label, unit]) => (
          <div key={key}>
            <dt>{label()}</dt>
            <dd>
              {formatNumber(values[key], {
                maximumFractionDigits: key === "energyKcal" ? 0 : 1,
              })}{" "}
              {unit}
            </dd>
          </div>
        ))}
      </dl>
      <p className="row-detail">
        {m["recipes.nutrition_coverage"]({
          included: nutrition.includedIngredients,
          total: nutrition.totalIngredients,
        })}
      </p>
      {nutrition.ignoredIngredients > 0 && (
        <p className="row-detail">
          {m["recipes.nutrition_ignored"]({
            count: nutrition.ignoredIngredients,
          })}
        </p>
      )}
      <p className="row-detail">{m["recipes.nutrition_source"]()}</p>
    </details>
  );
}
