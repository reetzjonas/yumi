import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Field } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { Pictogram } from "@/components/ui/pictogram";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/api-error";
import { ingredientName } from "@/lib/recipes";
import { useMe } from "@/lib/session";
import { type CatalogIngredient, useShoppingCategories } from "@/lib/shopping";
import { m } from "@/paraglide/messages";

export function CatalogPicker({
  onSelect,
}: {
  onSelect: (ingredient: CatalogIngredient) => void;
}) {
  const id = useId();
  const householdId = useMe()?.activeHouseholdId;
  const categories = useShoppingCategories();
  const [search, setSearch] = useState("");
  const q = search.trim();
  const results = useQuery({
    queryKey: ["shopping", householdId, "catalog", q],
    enabled: !!householdId && q.length > 0,
    queryFn: async () =>
      (
        await ensureOk(await api.ingredients.$get({ query: { q, limit: "8" } }))
      ).json(),
  });
  return (
    <details className="shopping-catalog">
      <summary>{m["shopping.catalog_search"]()}</summary>
      <Field
        id={id}
        label={m["shopping.catalog_search"]()}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {q && results.isFetching && (
        <p role="status">{m["shopping.loading"]()}</p>
      )}
      {results.isError && (
        <p className="form-error" role="alert">
          {errorMessage(results.error)}
        </p>
      )}
      {q && results.data?.length === 0 && (
        <p className="muted">{m["shopping.no_catalog_results"]()}</p>
      )}
      {!!results.data?.length && (
        <ul className="row-list">
          {results.data.map((ingredient) => (
            <li key={ingredient.id}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  onSelect(ingredient);
                  setSearch("");
                }}
              >
                <Pictogram
                  icon={ingredient.icon}
                  fallback={
                    categories.data?.find(
                      (category) => category.id === ingredient.categoryId,
                    )?.icon
                  }
                />
                {ingredientName(ingredient)}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
