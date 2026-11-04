import { UNITS } from "@yumi/shared";
import type { InferResponseType } from "hono/client";
import { useState } from "react";
import { Field } from "@/components/auth-layout";
import type { IngredientDraft } from "@/components/ingredients/create-ingredient";
import { Button } from "@/components/ui/button";
import type { api } from "@/lib/api";
import { ingredientName, unitLabel } from "@/lib/recipes";
import { m } from "@/paraglide/messages";

export function IngredientDraftFields({
  id,
  draft,
  categories,
}: {
  id: string;
  draft: IngredientDraft;
  categories: InferResponseType<typeof api.ingredients.categories.$get, 200>;
}) {
  const [packs, setPacks] = useState(
    draft.packSizes.map((pack) => ({ ...pack, key: crypto.randomUUID() })),
  );
  return (
    <>
      <div className="ingredient-name-fields">
        <Field
          id={`${id}-name-de`}
          name="nameDe"
          label={m["ingredients.name_de"]()}
          defaultValue={draft.nameDe}
          required
          maxLength={100}
        />
        <Field
          id={`${id}-name-en`}
          name="nameEn"
          label={m["ingredients.name_en"]()}
          defaultValue={draft.nameEn}
          required
          maxLength={100}
        />
      </div>
      <Field
        id={`${id}-synonyms`}
        name="synonyms"
        label={m["ingredients.synonyms"]()}
        defaultValue={draft.synonyms.join(", ")}
        aria-describedby={`${id}-synonyms-hint`}
      />
      <p id={`${id}-synonyms-hint`} className="muted">
        {m["ingredients.synonyms_hint"]()}
      </p>
      <div className="field">
        <label htmlFor={`${id}-category`}>{m["ingredients.category"]()}</label>
        <select
          id={`${id}-category`}
          name="categoryId"
          defaultValue={draft.categoryId ?? ""}
        >
          <option value="">{m["ingredients.no_category"]()}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {ingredientName(category)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${id}-unit`}>{m["ingredients.default_unit"]()}</label>
        <select
          id={`${id}-unit`}
          name="defaultUnit"
          defaultValue={draft.defaultUnit ?? ""}
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
        id={`${id}-icon`}
        name="icon"
        label={m["ingredients.icon"]()}
        defaultValue={draft.icon ?? ""}
        maxLength={16}
      />
      <div className="ingredient-pack-sizes">
        <h3>{m["ingredients.pack_sizes"]()}</h3>
        {packs.map((pack, index) => (
          <div key={pack.key} className="ingredient-pack-row">
            <Field
              id={`${id}-pack-${pack.key}`}
              name="packQuantity"
              label={m["ingredients.pack_quantity"]({ number: index + 1 })}
              type="number"
              min="0.001"
              step="any"
              max="1000000"
              defaultValue={pack.quantity}
              required
            />
            <div className="field">
              <label htmlFor={`${id}-pack-unit-${pack.key}`}>
                {m["ingredients.pack_unit"]({ number: index + 1 })}
              </label>
              <select
                id={`${id}-pack-unit-${pack.key}`}
                name="packUnit"
                defaultValue={pack.unit}
              >
                {UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unitLabel(unit)}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                setPacks((current) =>
                  current.filter((value) => value.key !== pack.key),
                )
              }
            >
              {m["ingredients.pack_remove"]({ number: index + 1 })}
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          disabled={packs.length >= 20}
          onClick={() =>
            setPacks((current) => [
              ...current,
              {
                key: crypto.randomUUID(),
                quantity: 1,
                unit: draft.defaultUnit ?? "g",
              },
            ])
          }
        >
          {m["ingredients.pack_add"]()}
        </Button>
      </div>
      <details>
        <summary>{m["ingredients.conversions"]()}</summary>
        <div className="ingredient-conversion-fields">
          <Field
            id={`${id}-density`}
            name="densityGPerMl"
            label={m["ingredients.density"]()}
            type="number"
            min="0.001"
            max="25"
            step="any"
            defaultValue={draft.densityGPerMl ?? ""}
          />
          <Field
            id={`${id}-piece-weight`}
            name="pieceWeightG"
            label={m["ingredients.piece_weight"]()}
            type="number"
            min="0.001"
            max="100000"
            step="any"
            defaultValue={draft.pieceWeightG ?? ""}
          />
        </div>
      </details>
    </>
  );
}
