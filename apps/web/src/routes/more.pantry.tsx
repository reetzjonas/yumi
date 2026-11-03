import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Archive, ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, PageHeader } from "@/components/page";
import { CatalogPicker } from "@/components/shopping/catalog-picker";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/api-error";
import { ingredientName } from "@/lib/recipes";
import { useMe } from "@/lib/session";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/more/pantry")({ component: Pantry });

function Pantry() {
  const householdId = useMe()?.activeHouseholdId;
  const queryClient = useQueryClient();
  const staples = useQuery({
    queryKey: ["pantry", householdId],
    enabled: !!householdId,
    queryFn: async () => (await ensureOk(await api.pantry.$get())).json(),
  });
  const change = useMutation({
    mutationFn: async ({
      ingredientId,
      add,
    }: {
      ingredientId: string;
      add: boolean;
    }) =>
      ensureOk(
        add
          ? await api.pantry[":ingredientId"].$put({ param: { ingredientId } })
          : await api.pantry[":ingredientId"].$delete({
              param: { ingredientId },
            }),
      ),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ["pantry", householdId] }),
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <div className="settings-page">
      <PageHeader title={m["pantry.title"]()}>
        <Link to="/more" className="back-link">
          <ArrowLeft aria-hidden="true" size={18} />
          {m.nav_more()}
        </Link>
      </PageHeader>
      <section className="section">
        <h2>{m["pantry.add"]()}</h2>
        <p className="section-description">{m["pantry.description"]()}</p>
        <CatalogPicker
          onSelect={(ingredient) =>
            change.mutate({ ingredientId: ingredient.id, add: true })
          }
        />
      </section>
      {staples.isError ? (
        <p className="form-error" role="alert">
          {errorMessage(staples.error)}
        </p>
      ) : !staples.data ? (
        <Skeleton className="h-32 w-full" />
      ) : !staples.data.length ? (
        <EmptyState
          icon={Archive}
          title={m["pantry.empty"]()}
          description={m["pantry.empty_hint"]()}
        />
      ) : (
        <section className="section">
          <h2>{m["pantry.title"]()}</h2>
          <ul className="row-list store-list">
            {staples.data
              .map((staple) => ({ ...staple, name: ingredientName(staple) }))
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((staple) => (
                <li key={staple.ingredientId} className="row">
                  <span aria-hidden="true">{staple.icon ?? "🛒"}</span>
                  <span className="row-main row-title">{staple.name}</span>
                  <Button
                    variant="ghost"
                    aria-label={m["pantry.remove"]({ name: staple.name })}
                    disabled={change.isPending}
                    onClick={() =>
                      change.mutate({
                        ingredientId: staple.ingredientId,
                        add: false,
                      })
                    }
                  >
                    <Trash2 aria-hidden="true" size={18} />
                  </Button>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}
