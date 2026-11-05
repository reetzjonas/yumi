import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { ApiError, ensureOk, errorMessage } from "@/lib/api-error";
import { m } from "@/paraglide/messages";

export function CreateShareLink({
  recipeId,
  onCreated,
}: {
  readonly recipeId: string;
  readonly onCreated: () => Promise<void>;
}) {
  const expiryId = useId();
  const [expiry, setExpiry] = useState("");
  const create = useMutation({
    networkMode: "always",
    mutationFn: async () => {
      const date = expiry ? new Date(expiry) : null;
      if (
        date &&
        (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now())
      )
        throw new ApiError("invalid_expiry");
      return (
        await ensureOk(
          await api.recipes[":id"].shares.$post({
            param: { id: recipeId },
            json: { expiresAt: date?.toISOString() ?? null },
          }),
        )
      ).json();
    },
    onSuccess: async () => {
      setExpiry("");
      await onCreated();
    },
  });
  return (
    <form
      className="sharing-create"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate();
      }}
    >
      <div className="field">
        <label htmlFor={expiryId}>{m["sharing.expiry"]()}</label>
        <input
          id={expiryId}
          type="datetime-local"
          value={expiry}
          disabled={create.isPending}
          aria-describedby={`${expiryId}-hint`}
          onChange={(event) => {
            setExpiry(event.target.value);
            create.reset();
          }}
        />
        <p className="meta" id={`${expiryId}-hint`}>
          {m["sharing.expiry_hint"]()}
        </p>
      </div>
      <Button
        type="submit"
        disabled={create.isPending}
        aria-busy={create.isPending}
      >
        {m["sharing.create"]()}
      </Button>
      <p className="sharing-status meta" role="status">
        {create.isPending ? m["sharing.creating"]() : ""}
      </p>
      {create.isError && (
        <p className="form-error" role="alert">
          {create.error instanceof ApiError &&
          create.error.code === "invalid_expiry"
            ? m["sharing.invalid_expiry"]()
            : errorMessage(create.error)}
        </p>
      )}
    </form>
  );
}
