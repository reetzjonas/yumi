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
    <section
      className="recipe-image-field"
      aria-labelledby="recipe-image-title"
    >
      <h2 id="recipe-image-title" className="field-label">
        {m["recipes.image"]()}
      </h2>
      {source ? (
        <img
          className="recipe-image-preview"
          src={source}
          alt={m["recipes.image_preview"]()}
        />
      ) : (
        <div className="recipe-image-preview is-empty" />
      )}
      <div className="recipe-image-actions">
        <label className="button button-outline file-button">
          <input
            className="sr-only"
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
          {source ? m["recipes.image_replace"]() : m["recipes.image_choose"]()}
        </label>
        {source && (
          <Button
            type="button"
            variant="ghost"
            className="button-danger-text"
            onClick={() => {
              onError(null);
              onChange({ file: null, remove: true });
            }}
          >
            {m["recipes.image_remove"]()}
          </Button>
        )}
      </div>
      <p id="recipe-image-hint" className="meta">
        {m["recipes.image_hint"]()}
      </p>
    </section>
  );
}
