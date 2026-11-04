import { UNITS, unitSchema } from "@yumi/shared";
import { Field } from "@/components/auth-layout";
import { CreateIngredient } from "@/components/ingredients/create-ingredient";
import { RowControls } from "@/components/recipes/row-controls";
import type { IngredientRow } from "@/lib/recipe-editor";
import { ingredientName, unitLabel } from "@/lib/recipes";
import { m } from "@/paraglide/messages";

export function IngredientEditorRow({
  row,
  index,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  row: IngredientRow;
  index: number;
  count: number;
  onChange: (row: IngredientRow) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const item = m["recipes.ingredient_number"]({ number: index + 1 });
  function update(patch: Partial<IngredientRow>, changed = true) {
    onChange({ ...row, ...patch, changed: row.changed || changed });
  }
  return (
    <div className="recipe-editor-row">
      <strong>{item}</strong>
      <Field
        id={`${row.key}-section`}
        label={m["recipes.ingredient_section"]()}
        placeholder={m["recipes.ingredient_section_placeholder"]()}
        value={row.section}
        style={{ maxWidth: "100%", minWidth: 0 }}
        maxLength={100}
        onChange={(event) => update({ section: event.target.value }, false)}
      />
      <div className="recipe-inline-fields">
        <Field
          id={`${row.key}-quantity`}
          label={m["recipes.ingredient_quantity"]()}
          inputMode="decimal"
          value={row.quantity}
          style={{ maxWidth: "100%", minWidth: 0 }}
          onChange={(event) => update({ quantity: event.target.value })}
        />
        <div className="field">
          <label htmlFor={`${row.key}-unit`}>
            {m["recipes.ingredient_unit"]()}
          </label>
          <select
            id={`${row.key}-unit`}
            value={row.unit ?? ""}
            style={{ maxWidth: "100%", minWidth: 0 }}
            onChange={(event) => {
              const unit = unitSchema.safeParse(event.target.value);
              update({ unit: unit.success ? unit.data : null });
            }}
          >
            <option value="">{m["recipes.ingredient_no_unit"]()}</option>
            {UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unitLabel(unit)}
              </option>
            ))}
          </select>
        </div>
        <Field
          id={`${row.key}-name`}
          label={m["recipes.ingredient_name"]()}
          value={row.name}
          style={{ maxWidth: "100%", minWidth: 0 }}
          required
          maxLength={500}
          onChange={(event) =>
            update({ name: event.target.value, ingredientId: null })
          }
        />
      </div>
      <Field
        id={`${row.key}-note`}
        label={m["recipes.ingredient_note"]()}
        placeholder={m["recipes.ingredient_note_placeholder"]()}
        value={row.note}
        style={{ maxWidth: "100%", minWidth: 0 }}
        maxLength={500}
        onChange={(event) => update({ note: event.target.value })}
      />
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={row.optional}
          onChange={(event) =>
            update({ optional: event.target.checked }, false)
          }
        />
        {m["recipes.ingredient_optional"]()}
      </label>
      {row.confidence < 0.7 && (
        <p className="muted">{m["recipes.ingredient_check"]()}</p>
      )}
      {!row.ingredientId &&
        row.name.trim() &&
        row.name.trim().length <= 100 && (
          <CreateIngredient
            key={row.name}
            name={row.name}
            onCreated={(ingredient) =>
              update({
                name: ingredientName(ingredient),
                ingredientId: ingredient.id,
                confidence: 1,
              })
            }
          />
        )}
      {row.ingredientId && (
        <p className="muted">{m["ingredients.linked"]({ name: row.name })}</p>
      )}
      <RowControls
        item={item}
        index={index}
        count={count}
        onMove={onMove}
        onRemove={onRemove}
      />
    </div>
  );
}
