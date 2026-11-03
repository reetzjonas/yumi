import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  type RecipeDetail,
  recipeImageUrl,
} from "@/lib/recipes";
import { m } from "@/paraglide/messages";

export type ImageSelection = { file: File | null; remove: boolean };

export function ImageEditor({
  recipe,
  value,
  onChange,
  onError,
}: {
  recipe?: RecipeDetail;
  value: ImageSelection;
  onChange: (value: ImageSelection) => void;
  onError: (message: string | null) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!value.file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(value.file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value.file]);
  const source =
    preview ??
    (!value.remove && recipe?.imageKey
      ? recipeImageUrl(recipe.id, recipe.imageKey, "full")
      : null);
  return (
    <section className="recipe-form" aria-labelledby="recipe-image-title">
      <h2 id="recipe-image-title">{m["recipes.image"]()}</h2>
      {source && (
        <img
          className="recipe-image"
          src={source}
          alt={m["recipes.image_preview"]()}
        />
      )}
      <div className="field">
        <label htmlFor="recipe-image">
          {source ? m["recipes.image_replace"]() : m["recipes.image_choose"]()}
        </label>
        <input
          id="recipe-image"
          type="file"
          accept={IMAGE_TYPES}
          aria-describedby="recipe-image-hint"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            if (file.size > MAX_IMAGE_BYTES) {
              onError(m["errors.image_too_large"]());
              return;
            }
            if (!IMAGE_TYPES.split(",").includes(file.type)) {
              onError(m["errors.invalid_image"]());
              return;
            }
            onError(null);
            onChange({ file, remove: false });
          }}
        />
        <p id="recipe-image-hint" className="muted">
          {m["recipes.image_hint"]()}
        </p>
      </div>
      {source && (
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            onError(null);
            onChange({ file: null, remove: true });
          }}
        >
          {m["recipes.image_remove"]()}
        </Button>
      )}
    </section>
  );
}
