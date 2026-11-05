import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId } from "react";
import { Field, FormError } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api-error";
import { addQueueEntry, type QueueEntryInput, queueKey } from "@/lib/queue";
import { useMe } from "@/lib/session";
import { m } from "@/paraglide/messages";

export function AddFreeMeal({ onAdded }: { onAdded: () => void }) {
  const id = useId();
  const householdId = useMe()?.activeHouseholdId;
  const queryClient = useQueryClient();
  const add = useMutation({
    mutationFn: (input: QueueEntryInput) => addQueueEntry(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queueKey(householdId) });
      onAdded();
    },
  });
  return (
    <form
      className="recipe-form"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        add.mutate({
          title: String(data.get("title") ?? "").trim(),
          note: String(data.get("note") ?? "").trim() || null,
          plannedFor: String(data.get("plannedFor") ?? "") || null,
          servings: 1,
        });
      }}
    >
      <fieldset className="shopping-item-fields" disabled={add.isPending}>
        <Field
          id={`${id}-title`}
          name="title"
          label={m["queue.meal_title"]()}
          required
          maxLength={200}
        />
        <div className="field">
          <label htmlFor={`${id}-note`}>{m["queue.meal_note"]()}</label>
          <textarea id={`${id}-note`} name="note" rows={3} maxLength={2000} />
        </div>
        <Field
          id={`${id}-date`}
          name="plannedFor"
          type="date"
          label={m["queue.planned_for"]()}
        />
        <Button disabled={add.isPending}>{m["queue.add"]()}</Button>
      </fieldset>
      <FormError message={add.isError ? errorMessage(add.error) : null} />
    </form>
  );
}
