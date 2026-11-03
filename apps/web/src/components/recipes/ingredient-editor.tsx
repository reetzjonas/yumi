import { useMutation } from "@tanstack/react-query";
import { type Dispatch, type SetStateAction, useState } from "react";
import { FormError } from "@/components/auth-layout";
import { IngredientEditorRow } from "@/components/recipes/ingredient-row";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/api-error";
import {
  type IngredientRow,
  moveRow,
  newIngredient,
  parsedIngredient,
} from "@/lib/recipe-editor";
import { m } from "@/paraglide/messages";

export function IngredientEditor({
  rows,
  setRows,
  onParsingChange,
}: {
  rows: IngredientRow[];
  setRows: Dispatch<SetStateAction<IngredientRow[]>>;
  onParsingChange: (pending: boolean) => void;
}) {
  const [paste, setPaste] = useState("");
  const parse = useMutation({
    mutationFn: async (lines: string[]) => {
      const batches = [];
      for (let index = 0; index < lines.length; index += 100) {
        batches.push(lines.slice(index, index + 100));
      }
      return (
        await Promise.all(
          batches.map(async (batch) =>
            (
              await ensureOk(
                await api.ingredients.parse.$post({ json: { lines: batch } }),
              )
            ).json(),
          ),
        )
      ).flat();
    },
    onSuccess: (lines) => {
      setRows((current) => [...current, ...lines.map(parsedIngredient)]);
      setPaste("");
    },
    onSettled: () => onParsingChange(false),
  });
  const lines = paste
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return (
    <section className="recipe-form" aria-labelledby="ingredient-editor-title">
      <h2 id="ingredient-editor-title">{m["recipes.ingredients"]()}</h2>
      <div className="field">
        <label htmlFor="ingredient-paste">{m["recipes.paste_label"]()}</label>
        <textarea
          id="ingredient-paste"
          rows={5}
          disabled={parse.isPending}
          value={paste}
          onChange={(event) => setPaste(event.target.value)}
          aria-describedby="ingredient-paste-hint"
        />
        <p id="ingredient-paste-hint" className="muted">
          {m["recipes.paste_hint"]()}
        </p>
      </div>
      <Button
        type="button"
        variant="secondary"
        disabled={
          !lines.length || parse.isPending || rows.length + lines.length > 200
        }
        onClick={() => {
          onParsingChange(true);
          parse.mutate(lines);
        }}
      >
        {m["recipes.paste_action"]()}
      </Button>
      <FormError message={parse.isError ? errorMessage(parse.error) : null} />
      {rows.map((row, index) => (
        <IngredientEditorRow
          key={row.key}
          row={row}
          index={index}
          count={rows.length}
          onChange={(updated) =>
            setRows((current) =>
              current.map((line) => (line.key === row.key ? updated : line)),
            )
          }
          onMove={(direction) =>
            setRows((current) => moveRow(current, index, direction))
          }
          onRemove={() =>
            setRows((current) => current.filter((line) => line.key !== row.key))
          }
        />
      ))}
      <Button
        type="button"
        variant="secondary"
        disabled={rows.length >= 200 || parse.isPending}
        onClick={() => setRows((current) => [...current, newIngredient()])}
      >
        {m["recipes.ingredient_add"]()}
      </Button>
    </section>
  );
}
