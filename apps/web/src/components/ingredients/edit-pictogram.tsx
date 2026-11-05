import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ingredientInputSchema } from "@yumi/shared";
import { useRef } from "react";
import { FormError } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { Pictogram } from "@/components/ui/pictogram";
import { PictogramPicker } from "@/components/ui/pictogram-picker";
import { api } from "@/lib/api";
import { ensureOk, errorMessage } from "@/lib/api-error";
import { useMe } from "@/lib/session";
import { m } from "@/paraglide/messages";

export function EditPictogram({
  ingredientId,
  fallback,
}: {
  readonly ingredientId: string;
  readonly fallback?: string | null;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const householdId = useMe()?.activeHouseholdId;
  const queryClient = useQueryClient();
  const queryKey = ["ingredient", householdId, ingredientId];
  const ingredient = useQuery({
    queryKey,
    queryFn: async () =>
      (
        await ensureOk(
          await api.ingredients[":id{[0-9a-f-]{36}}"].$get({
            param: { id: ingredientId },
          }),
        )
      ).json(),
  });
  const save = useMutation({
    mutationFn: async (icon: string | null) =>
      (
        await ensureOk(
          await api.ingredients[":id{[0-9a-f-]{36}}"].$put({
            param: { id: ingredientId },
            json: ingredientInputSchema.parse({ ...ingredient.data, icon }),
          }),
        )
      ).json(),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKey, saved);
      void queryClient.invalidateQueries({
        queryKey: ["shopping", householdId],
      });
      if (details.current) details.current.open = false;
    },
  });
  const entry = ingredient.data;
  if (!entry || entry.householdId !== householdId)
    return <Pictogram icon={entry?.icon} fallback={fallback} />;
  return (
    <>
      <Pictogram icon={entry.icon} fallback={fallback} />
      <details ref={details} className="pictogram-editor">
        <summary>{m["pictogram.edit"]()}</summary>
        <fieldset disabled={save.isPending}>
          <PictogramPicker
            key={`${entry.id}-${entry.icon}`}
            defaultValue={entry.icon}
            fallback={fallback}
          />
        </fieldset>
        <FormError message={save.isError ? errorMessage(save.error) : null} />
        <Button
          type="button"
          disabled={save.isPending}
          onClick={() => {
            const icon =
              details.current?.querySelector<HTMLInputElement>(
                'input[name="icon"]',
              )?.value;
            save.mutate(icon || null);
          }}
        >
          {m["pictogram.save"]()}
        </Button>
      </details>
    </>
  );
}
