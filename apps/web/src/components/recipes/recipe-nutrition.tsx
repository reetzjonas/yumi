import { type NutritionValues, nutritionForPortions } from "@yumi/shared";
import { useState } from "react";
import { ServingsStepper } from "@/components/recipes/servings-selector";
import { formatNumber } from "@/lib/i18n";
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
}: {
  nutrition: NonNullable<RecipeDetail["nutrition"]>;
}) {
  const [portions, setPortions] = useState(1);
  const values = nutritionForPortions(nutrition.perServing, portions);
  return (
    <details className="recipe-nutrition-details">
      <summary>{m["recipes.nutrition_title"]()}</summary>
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
