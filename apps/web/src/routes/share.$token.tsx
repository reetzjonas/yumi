import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { BookPlus } from "lucide-react";
import { ConnectionStatus } from "@/components/pwa-provider";
import { SharedRecipeContent } from "@/components/recipes/shared-recipe-content";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { ApiError, ensureOk, errorMessage } from "@/lib/api-error";
import { servingsSearch } from "@/lib/recipes";
import { useMe } from "@/lib/session";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/share/$token")({
  validateSearch: servingsSearch,
  component: SharedRecipe,
});

function SharedRecipe() {
  const { token } = Route.useParams();
  const { servings } = Route.useSearch();
  const me = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const redirect = `/share/${token}${servings ? `?servings=${servings}` : ""}`;
  const query = useQuery({
    queryKey: ["shared-recipe", token],
    networkMode: "always",
    queryFn: async () =>
      (
        await ensureOk(
          await api["recipe-shares"][":token"].$get({ param: { token } }),
        )
      ).json(),
    retry: false,
    gcTime: 0,
  });
  const copy = useMutation({
    networkMode: "always",
    mutationFn: async () =>
      (
        await ensureOk(
          await api["recipe-shares"][":token"].copy.$post({
            param: { token },
          }),
        )
      ).json(),
    onSuccess: async ({ id }) => {
      await queryClient.invalidateQueries({ queryKey: ["recipes"] });
      await navigate({ to: "/recipes/$id", params: { id } });
    },
  });
  const recipe = query.data;
  const currentServings = servings ?? recipe?.servings ?? 1;
  const unavailable =
    query.error instanceof ApiError &&
    (query.error.code === "not_found" || query.error.code === "invalid_input");
  return (
    <div className="shared-page">
      <header className="shared-header">
        <Link
          className="shared-brand"
          to={me?.activeHouseholdId ? "/recipes" : "/login"}
        >
          yumi
        </Link>
        <span className="meta">{m["sharing.shared_recipe"]()}</span>
      </header>
      <main className="shared-content">
        <ConnectionStatus />
        {query.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : query.isError ? (
          <div className="shared-error">
            <h1>{m["sharing.unavailable_title"]()}</h1>
            <p role="alert">
              {unavailable
                ? m["sharing.unavailable"]()
                : errorMessage(query.error)}
            </p>
            {!unavailable && (
              <Button variant="outline" onClick={() => void query.refetch()}>
                {m["sharing.retry"]()}
              </Button>
            )}
          </div>
        ) : recipe ? (
          <SharedRecipeContent
            recipe={recipe}
            token={token}
            servings={currentServings}
            onServingsChange={(next) =>
              void navigate({
                to: "/share/$token",
                params: { token },
                search: { servings: next },
                replace: true,
              })
            }
          >
            <div className="shared-save">
              {!me ? (
                <Button asChild>
                  <Link to="/login" search={{ redirect }}>
                    <BookPlus size={20} aria-hidden="true" />
                    {m["sharing.save"]()}
                  </Link>
                </Button>
              ) : !me.activeHouseholdId ? (
                <Button asChild>
                  <Link to="/onboarding" search={{ redirect }}>
                    <BookPlus size={20} aria-hidden="true" />
                    {m["sharing.save"]()}
                  </Link>
                </Button>
              ) : (
                <Button
                  disabled={copy.isPending}
                  aria-busy={copy.isPending}
                  onClick={() => copy.mutate()}
                >
                  <BookPlus size={20} aria-hidden="true" />
                  {m["sharing.save"]()}
                </Button>
              )}
              <p className="meta">
                {copy.isPending
                  ? m["sharing.saving"]()
                  : m["sharing.save_hint"]()}
              </p>
              {copy.isError && (
                <p className="form-error" role="alert">
                  {errorMessage(copy.error)}
                </p>
              )}
            </div>
          </SharedRecipeContent>
        ) : null}
      </main>
    </div>
  );
}
