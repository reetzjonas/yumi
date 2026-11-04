import { createFileRoute } from "@tanstack/react-router";
import { BackLink, PageHeader } from "@/components/page";
import { RecipeEditor } from "@/components/recipes/recipe-editor";
import { useMe } from "@/lib/session";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/recipes_/new")({
  component: NewRecipe,
});

function NewRecipe() {
  const me = useMe();
  const householdId = me?.activeHouseholdId;
  return (
    <>
      <PageHeader
        title={m["recipes.new"]()}
        back={<BackLink to="/recipes" label={m.nav_recipes()} />}
      />
      {householdId && (
        <RecipeEditor key={householdId} householdId={householdId} />
      )}
    </>
  );
}
