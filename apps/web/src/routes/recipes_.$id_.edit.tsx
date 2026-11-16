import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { FormError } from "@/components/auth-layout";
import { BackLink, PageHeader } from "@/components/page";
import { RecipeEditor } from "@/components/recipes/recipe-editor";
import {
  type OptimizedDraft,
  RecipeOptimize,
} from "@/components/recipes/recipe-optimize";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/api-error";
import { useMe } from "@/lib/session";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/recipes_/$id_/edit")({
  component: EditRecipe,
});

function EditRecipe() {
  const { id } = Route.useParams();
  const me = useMe();
  const householdId = me?.activeHouseholdId ?? "";
  const recipe = useQuery({
    queryKey: ["recipes", householdId, "detail", id],
    queryFn: async () =>
      (await ensureOk(await api.recipes[":id"].$get({ param: { id } }))).json(),
    enabled: Boolean(householdId),
  });
  const [suggestion, setSuggestion] = useState<{
    key: string;
    draft: OptimizedDraft;
  } | null>(null);
  return (
    <>
      <PageHeader
        title={m["recipes.edit_title"]()}
        back={
          <BackLink
            to="/recipes/$id"
            params={{ id }}
            label={m["recipes.detail_title"]()}
          />
        }
      />
      {recipe.isPending && <Skeleton className="recipe-image" />}
      {recipe.isError && <FormError message={errorMessage(recipe.error)} />}
      {recipe.data && (
        <>
          <RecipeOptimize
            recipeId={id}
            householdId={householdId}
            suggested={suggestion !== null}
            onDraft={(draft) =>
              setSuggestion({ key: crypto.randomUUID(), draft })
            }
            onDiscard={() => setSuggestion(null)}
          />
          <RecipeEditor
            key={`${householdId}:${id}:${suggestion?.key ?? "saved"}`}
            recipe={recipe.data}
            draft={suggestion?.draft}
            householdId={householdId}
          />
        </>
      )}
      {!recipe.data && (
        <Button variant="ghost" asChild>
          <Link to="/recipes">{m["recipes.cancel"]()}</Link>
        </Button>
      )}
    </>
  );
}
