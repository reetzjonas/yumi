import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarPlus } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api-error";
import { addQueueEntry, queueKey } from "@/lib/queue";
import { useMe } from "@/lib/session";
import { m } from "@/paraglide/messages";

export function AddRecipeToQueue({
  recipeId,
  servings: defaultServings,
}: {
  recipeId: string;
  servings: number;
}) {
  const id = useId();
  const householdId = useMe()?.activeHouseholdId;
  const queryClient = useQueryClient();
  const [servings, setServings] = useState(String(defaultServings));
  const [plannedFor, setPlannedFor] = useState("");
  const add = useMutation({
    mutationFn: addQueueEntry,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queueKey(householdId) });
      toast.success(m["queue.added"]());
    },
  });

  return (
    <div className="queue-add">
      <p className="section-description">{m["queue.add_hint"]()}</p>
      <form
        className="queue-entry-form"
        onSubmit={(event) => {
          event.preventDefault();
          add.mutate({
            recipeId,
            servings: Number(servings),
            plannedFor: plannedFor || null,
          });
        }}
      >
        <Field
          id={`${id}-servings`}
          label={m["recipes.servings"]()}
          type="number"
          min={1}
          max={100}
          step={1}
          required
          value={servings}
          disabled={add.isPending}
          onChange={(event) => setServings(event.target.value)}
        />
        <Field
          id={`${id}-date`}
          label={m["queue.planned_for"]()}
          type="date"
          value={plannedFor}
          disabled={add.isPending}
          onChange={(event) => setPlannedFor(event.target.value)}
        />
        <Button disabled={!householdId || add.isPending}>
          <CalendarPlus size={18} aria-hidden="true" />
          {add.isPending ? m["queue.adding"]() : m["queue.add"]()}
        </Button>
      </form>
      {add.isError && (
        <p className="form-error" role="alert">
          {errorMessage(add.error)}
        </p>
      )}
      {add.isSuccess && (
        <p role="status">
          {m["queue.added"]()}{" "}
          <Link className="text-link" to="/plan">
            {m["queue.open"]()}
          </Link>
        </p>
      )}
    </div>
  );
}
