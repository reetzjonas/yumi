import { createFileRoute } from "@tanstack/react-router";
import { RecipeLibrary } from "@/components/recipes/recipe-library";

export const Route = createFileRoute("/recipes")({ component: Recipes });

function Recipes() {
  return <RecipeLibrary />;
}
