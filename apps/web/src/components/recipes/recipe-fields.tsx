import { Field } from "@/components/auth-layout";
import type { RecipeDetail } from "@/lib/recipes";
import { m } from "@/paraglide/messages";

export function RecipeFields({
  recipe,
}: {
  recipe?: Pick<
    RecipeDetail,
    | "title"
    | "description"
    | "servings"
    | "prepMinutes"
    | "cookMinutes"
    | "sourceUrl"
    | "tags"
  >;
}) {
  return (
    <>
      <Field
        id="title"
        label={m["recipes.title"]()}
        placeholder={m["recipes.title_placeholder"]()}
        defaultValue={recipe?.title ?? ""}
        required
        maxLength={200}
      />
      <div className="field">
        <label htmlFor="description">{m["recipes.description"]()}</label>
        <textarea
          id="description"
          name="description"
          defaultValue={recipe?.description ?? ""}
          maxLength={5000}
          rows={3}
        />
      </div>
      <div className="recipe-fields">
        <Field
          id="servings"
          label={m["recipes.servings"]()}
          type="number"
          min={1}
          max={100}
          step={1}
          required
          defaultValue={recipe?.servings ?? 2}
        />
        <Field
          id="prepMinutes"
          label={m["recipes.prep_short"]()}
          type="number"
          min={0}
          max={10000}
          step={1}
          defaultValue={recipe?.prepMinutes ?? ""}
        />
        <Field
          id="cookMinutes"
          label={m["recipes.cook_short"]()}
          type="number"
          min={0}
          max={10000}
          step={1}
          defaultValue={recipe?.cookMinutes ?? ""}
        />
      </div>
      <Field
        id="tags"
        label={m["recipes.tags"]()}
        defaultValue={recipe?.tags.join(", ") ?? ""}
      />
      <Field
        id="sourceUrl"
        label={m["recipes.source_url"]()}
        type="url"
        pattern="https?://.*"
        maxLength={2000}
        defaultValue={recipe?.sourceUrl ?? ""}
      />
    </>
  );
}
