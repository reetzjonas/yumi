import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  nutritionValuesSchema,
  pictogramKeySchema,
  unitSchema,
} from "@yumi/shared";
import type { InferRequestType, InferResponseType } from "hono/client";
import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FormError } from "@/components/auth-layout";
import { IngredientDraftFields } from "@/components/ingredients/draft-fields";
import { NUTRIENTS } from "@/components/recipes/recipe-nutrition";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/api-error";
import { useMe } from "@/lib/session";
import { m } from "@/paraglide/messages";

export type IngredientDraft = InferResponseType<
  typeof api.ingredients.suggest.$post,
  200
>["draft"];
export type CreatedIngredient = InferResponseType<
  typeof api.ingredients.$post,
  201
>;

export function CreateIngredient({
  name,
  disabled,
  onCreated,
}: {
  name: string;
  disabled?: boolean;
  onCreated: (ingredient: CreatedIngredient) => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const householdId = useMe()?.activeHouseholdId;
  const queryClient = useQueryClient();
  const [proposal, setProposal] = useState<IngredientDraft | null>(null);
  const [revision, setRevision] = useState(0);
  const [nutritionIncomplete, setNutritionIncomplete] = useState(false);
  const categories = useQuery({
    queryKey: ["ingredient-categories", householdId],
    enabled: !!householdId,
    queryFn: async () =>
      (await ensureOk(await api.ingredients.categories.$get())).json(),
  });
  const suggest = useMutation({
    mutationFn: async () =>
      (
        await ensureOk(
          await api.ingredients.suggest.$post({ json: { name: name.trim() } }),
        )
      ).json(),
    onSuccess: (result) => {
      setProposal(result.draft);
      setRevision((current) => current + 1);
    },
  });
  const save = useMutation({
    mutationFn: async (
      json: InferRequestType<typeof api.ingredients.$post>["json"],
    ) => (await ensureOk(await api.ingredients.$post({ json }))).json(),
    onSuccess: (ingredient) => {
      void queryClient.invalidateQueries({
        queryKey: ["shopping", householdId, "catalog"],
      });
      onCreated(ingredient);
      dialog.current?.close();
    },
  });
  const pending = suggest.isPending || save.isPending;
  const draft: IngredientDraft = proposal ?? {
    nameDe: name.trim(),
    nameEn: name.trim(),
    synonyms: [],
    categoryId: null,
    defaultUnit: null,
    densityGPerMl: null,
    pieceWeightG: null,
    nutritionPer100g: null,
    packSizes: [],
    icon: null,
  };
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        disabled={disabled || !name.trim()}
        onClick={() => dialog.current?.showModal()}
      >
        {m["ingredients.create"]()}
      </Button>
      {createPortal(
        <div onSubmit={(event) => event.stopPropagation()}>
          <Sheet
            ref={dialog}
            title={m["ingredients.create_title"]()}
            meta={name}
          >
            <form
              className="recipe-form ingredient-create-form"
              aria-busy={pending}
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                const text = (key: string) =>
                  String(data.get(key) ?? "").trim();
                const number = (key: string) =>
                  text(key) ? Number(text(key).replace(",", ".")) : null;
                const quantities = data.getAll("packQuantity");
                const nutrition = NUTRIENTS.map(
                  ([key]) => [key, number(`nutrition.${key}`)] as const,
                );
                const filled = nutrition.filter(([, value]) => value !== null);
                const complete = filled.length === NUTRIENTS.length;
                setNutritionIncomplete(filled.length > 0 && !complete);
                if (filled.length > 0 && !complete) return;
                save.mutate({
                  nameDe: text("nameDe"),
                  nameEn: text("nameEn"),
                  synonyms: text("synonyms")
                    .split(/[,;\n]/)
                    .map((value) => value.trim())
                    .filter(Boolean),
                  categoryId: text("categoryId") || null,
                  defaultUnit: text("defaultUnit")
                    ? unitSchema.parse(text("defaultUnit"))
                    : null,
                  densityGPerMl: number("densityGPerMl"),
                  pieceWeightG: number("pieceWeightG"),
                  nutritionPer100g: complete
                    ? nutritionValuesSchema.parse(Object.fromEntries(nutrition))
                    : null,
                  packSizes: data.getAll("packUnit").map((unit, index) => ({
                    quantity: Number(
                      String(quantities[index]).replace(",", "."),
                    ),
                    unit: unitSchema.parse(unit),
                  })),
                  icon: text("icon")
                    ? pictogramKeySchema.parse(text("icon"))
                    : null,
                });
              }}
            >
              <p className="muted">{m["ingredients.review_hint"]()}</p>
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => suggest.mutate()}
              >
                {m["ingredients.suggest"]()}
              </Button>
              {suggest.isPending && (
                <p role="status">{m["ingredients.suggesting"]()}</p>
              )}
              {suggest.data && !suggest.isPending && (
                <p role="status" className="muted">
                  {suggest.data.method === "ai"
                    ? m["ingredients.ai_draft"]()
                    : m["ingredients.manual_draft"]()}
                </p>
              )}
              <FormError
                message={suggest.isError ? errorMessage(suggest.error) : null}
              />
              <FormError
                message={
                  categories.isError ? errorMessage(categories.error) : null
                }
              />
              <fieldset disabled={pending} className="ingredient-draft-fields">
                <IngredientDraftFields
                  key={`${name}-${revision}`}
                  id={id}
                  draft={draft}
                  categories={categories.data ?? []}
                />
              </fieldset>
              <FormError
                message={
                  nutritionIncomplete
                    ? m["ingredients.nutrition_incomplete"]()
                    : null
                }
              />
              <FormError
                message={save.isError ? errorMessage(save.error) : null}
              />
              <div className="form-actions">
                <Button disabled={pending}>{m["ingredients.confirm"]()}</Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={save.isPending}
                  onClick={() => dialog.current?.close()}
                >
                  {m["ingredients.cancel"]()}
                </Button>
              </div>
              {save.isPending && (
                <p role="status">{m["ingredients.saving"]()}</p>
              )}
            </form>
          </Sheet>
        </div>,
        document.body,
      )}
    </>
  );
}
