import type { Dispatch, SetStateAction } from "react";
import { RowControls } from "@/components/recipes/row-controls";
import { Button } from "@/components/ui/button";
import { type IngredientRow, moveRow, type StepRow } from "@/lib/recipe-editor";
import { m } from "@/paraglide/messages";

export function StepEditor({
  rows,
  setRows,
  ingredients,
}: {
  rows: StepRow[];
  setRows: Dispatch<SetStateAction<StepRow[]>>;
  ingredients: IngredientRow[];
}) {
  return (
    <section className="recipe-form" aria-labelledby="step-editor-title">
      <h2 id="step-editor-title">{m["recipes.steps"]()}</h2>
      {rows.map((row, index) => {
        const item = m["recipes.step_number"]({ number: index + 1 });
        return (
          <div className="recipe-editor-row" key={row.key}>
            <div className="field">
              <label htmlFor={row.key}>{item}</label>
              <textarea
                id={row.key}
                value={row.text}
                rows={4}
                style={{ maxWidth: "100%", minWidth: 0 }}
                required
                maxLength={5000}
                onChange={(event) => {
                  const text = event.target.value;
                  setRows((current) =>
                    current.map((step) =>
                      step.key === row.key ? { ...step, text } : step,
                    ),
                  );
                }}
              />
              <fieldset className="step-ingredient-choices">
                <legend>{m["cooking.step_ingredients"]()}</legend>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={row.ingredientKeys === null}
                    onChange={(event) => {
                      const automatic = event.target.checked;
                      setRows((current) =>
                        current.map((step) =>
                          step.key === row.key
                            ? { ...step, ingredientKeys: automatic ? null : [] }
                            : step,
                        ),
                      );
                    }}
                  />
                  {m["cooking.auto_ingredients"]()}
                </label>
                {row.ingredientKeys !== null &&
                  ingredients.map((ingredient) => (
                    <label className="checkbox-label" key={ingredient.key}>
                      <input
                        type="checkbox"
                        checked={
                          row.ingredientKeys?.includes(ingredient.key) ?? false
                        }
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setRows((current) =>
                            current.map((step) =>
                              step.key === row.key
                                ? {
                                    ...step,
                                    ingredientKeys: checked
                                      ? [
                                          ...(step.ingredientKeys ?? []),
                                          ingredient.key,
                                        ]
                                      : (step.ingredientKeys ?? []).filter(
                                          (key) => key !== ingredient.key,
                                        ),
                                  }
                                : step,
                            ),
                          );
                        }}
                      />
                      {ingredient.name || ingredient.rawText}
                    </label>
                  ))}
              </fieldset>
            </div>
            <RowControls
              item={item}
              index={index}
              count={rows.length}
              onMove={(direction) =>
                setRows((current) => moveRow(current, index, direction))
              }
              onRemove={() =>
                setRows((current) =>
                  current.filter((step) => step.key !== row.key),
                )
              }
            />
          </div>
        );
      })}
      <Button
        type="button"
        variant="secondary"
        disabled={rows.length >= 100}
        onClick={() =>
          setRows((current) => [
            ...current,
            { key: crypto.randomUUID(), text: "", ingredientKeys: null },
          ])
        }
      >
        {m["recipes.step_add"]()}
      </Button>
    </section>
  );
}
