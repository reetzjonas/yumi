import type { Dispatch, SetStateAction } from "react";
import { RowControls } from "@/components/recipes/row-controls";
import { Button } from "@/components/ui/button";
import { moveRow, type StepRow } from "@/lib/recipe-editor";
import { m } from "@/paraglide/messages";

export function StepEditor({
  rows,
  setRows,
}: {
  rows: StepRow[];
  setRows: Dispatch<SetStateAction<StepRow[]>>;
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
            { key: crypto.randomUUID(), text: "" },
          ])
        }
      >
        {m["recipes.step_add"]()}
      </Button>
    </section>
  );
}
