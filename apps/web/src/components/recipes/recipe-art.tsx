import { Pictogram } from "@/components/ui/pictogram";
import { recipeImageUrl } from "@/lib/recipes";
import { cn } from "@/lib/utils";

/** Stable tint per recipe so a tile keeps its color everywhere. */
function tint(id: string) {
  let sum = 0;
  for (const char of id) sum += char.charCodeAt(0);
  return sum % 4;
}

/**
 * The picture of a recipe: its photo, or its main pictogram on a tinted
 * surface when there is none. The caller sizes the box with `className`.
 */
export function RecipeArt({
  recipe,
  variant = "thumb",
  pictogramSize = 56,
  alt = "",
  className,
}: {
  recipe: { id: string; imageKey: string | null; icon?: string | null };
  variant?: "thumb" | "full";
  pictogramSize?: number;
  alt?: string;
  className?: string;
}) {
  return recipe.imageKey ? (
    <img
      className={cn("recipe-art", className)}
      src={recipeImageUrl(recipe.id, recipe.imageKey, variant)}
      alt={alt}
      loading="lazy"
    />
  ) : (
    <span
      className={cn("recipe-art is-illustration", className)}
      data-tint={tint(recipe.id)}
    >
      <Pictogram icon={recipe.icon} fallback="🍽️" size={pictogramSize} />
    </span>
  );
}
