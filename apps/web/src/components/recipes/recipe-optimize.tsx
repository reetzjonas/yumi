import { useMutation, useQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { Sparkles } from "lucide-react";
import { useId, useState } from "react";
import { FormError } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/api-error";
import { m } from "@/paraglide/messages";

export type OptimizedDraft = InferResponseType<
  (typeof api.recipes)[":id"]["optimize"]["$post"],
  200
>["draft"];

export function useRecipeOptimizeAvailable(
  householdId: string | null | undefined,
) {
  const capabilities = useQuery({
    queryKey: ["recipe-import-capabilities", householdId],
    enabled: Boolean(householdId),
    queryFn: async () =>
      (await ensureOk(await api.recipes.import.capabilities.$get())).json(),
  });
  return capabilities.data?.optimize ?? false;
}

export function RecipeOptimize({
  recipeId,
  householdId,
  suggested,
  onDraft,
  onDiscard,
}: {
  recipeId: string;
  householdId: string;
  suggested: boolean;
  onDraft: (draft: OptimizedDraft) => void;
  onDiscard: () => void;
}) {
  const id = useId();
  const available = useRecipeOptimizeAvailable(householdId);
  const [texts, setTexts] = useState(false);
  const optimize = useMutation({
    mutationFn: async () =>
      (
        await ensureOk(
          await api.recipes[":id"].optimize.$post({
            param: { id: recipeId },
            json: { texts },
          }),
        )
      ).json(),
    onSuccess: (result) => onDraft(result.draft),
  });
  if (!available) return null;
  return (
    <section
      className="import-card import-review"
      aria-labelledby={`${id}-title`}
      aria-busy={optimize.isPending}
    >
      <div className="import-card-head">
        <span className="import-card-icon">
          <Sparkles aria-hidden="true" size={20} />
        </span>
        <div>
          <h2 id={`${id}-title`} className="import-card-title">
            {m["recipes.optimize"]()}
          </h2>
          <p className="import-card-text" role="status">
            {suggested
              ? m["recipes.optimize_review"]()
              : m["recipes.optimize_hint"]()}
          </p>
        </div>
      </div>
      <label className="queue-checkbox">
        <input
          type="checkbox"
          checked={texts}
          disabled={optimize.isPending}
          onChange={(event) => setTexts(event.target.checked)}
        />
        {m["recipes.optimize_texts"]()}
      </label>
      <div className="recipe-actions">
        <Button
          type="button"
          variant="outline"
          disabled={optimize.isPending}
          onClick={() => optimize.mutate()}
        >
          {optimize.isPending
            ? m["recipes.optimizing"]()
            : suggested
              ? m["recipes.optimize_again"]()
              : m["recipes.optimize_submit"]()}
        </Button>
        {suggested && (
          <Button
            type="button"
            variant="ghost"
            disabled={optimize.isPending}
            onClick={() => {
              optimize.reset();
              onDiscard();
            }}
          >
            {m["recipes.optimize_discard"]()}
          </Button>
        )}
      </div>
      <FormError
        message={optimize.isError ? errorMessage(optimize.error) : null}
      />
    </section>
  );
}
