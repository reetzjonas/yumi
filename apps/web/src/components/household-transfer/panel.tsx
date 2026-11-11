import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  HOUSEHOLD_TRANSFER_MAX_BYTES,
  HOUSEHOLD_TRANSFER_VERSION,
  type HouseholdTransfer,
  householdTransferSchema,
} from "@yumi/shared";
import { Download, Upload } from "lucide-react";
import { useId, useRef } from "react";
import { TransferCounts } from "@/components/household-transfer/counts";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { ApiError, ensureOk, errorMessage } from "@/lib/api-error";
import { m } from "@/paraglide/messages";

export function HouseholdTransferPanel({
  householdName,
}: {
  readonly householdName: string;
}) {
  const queryClient = useQueryClient();
  const fileId = useId();
  const input = useRef<HTMLInputElement>(null);
  const review = useMutation({
    networkMode: "always",
    mutationFn: async (file: File) => {
      if (file.size > HOUSEHOLD_TRANSFER_MAX_BYTES)
        throw new ApiError("household_transfer_too_large");
      const value: unknown = JSON.parse(await file.text());
      return householdTransferSchema.parse(value);
    },
  });
  const download = useMutation({
    networkMode: "always",
    mutationFn: async () => {
      const response = await ensureOk(
        await api["household-transfer"].export.$get(),
      );
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      try {
        anchor.href = url;
        anchor.download = `yumi-household-v${HOUSEHOLD_TRANSFER_VERSION}.json`;
        document.body.append(anchor);
        anchor.click();
      } finally {
        anchor.remove();
        URL.revokeObjectURL(url);
      }
    },
  });
  const restore = useMutation({
    networkMode: "always",
    mutationFn: async (archive: HouseholdTransfer) =>
      (
        await ensureOk(
          await api["household-transfer"].import.$post({ json: archive }),
        )
      ).json(),
    onSuccess: async () => {
      review.reset();
      if (input.current) input.current.value = "";
      await queryClient.invalidateQueries();
    },
  });
  const archive = review.data;
  const oversized = (error: unknown) =>
    error instanceof ApiError && error.code === "household_transfer_too_large";
  return (
    <>
      <p className="meta">{m["transfer.household"]({ name: householdName })}</p>
      <section className="section">
        <h2 className="section-label">{m["transfer.export_title"]()}</h2>
        <p className="section-description">{m["transfer.export_hint"]()}</p>
        <Button
          variant="outline"
          disabled={download.isPending}
          aria-busy={download.isPending}
          onClick={() => download.mutate()}
        >
          <Download size={18} aria-hidden="true" />
          {m["transfer.download"]()}
        </Button>
        <p className="meta" role="status">
          {download.isPending
            ? m["transfer.exporting"]()
            : download.isSuccess
              ? m["transfer.downloaded"]()
              : ""}
        </p>
        {download.isError && (
          <p className="form-error" role="alert">
            {oversized(download.error)
              ? m["transfer.too_large"]()
              : errorMessage(download.error)}
          </p>
        )}
      </section>
      <section className="section">
        <h2 className="section-label">{m["transfer.import_title"]()}</h2>
        <p className="section-description">{m["transfer.import_hint"]()}</p>
        <div className="field w-full min-w-0">
          <label htmlFor={fileId}>{m["transfer.file"]()}</label>
          <input
            ref={input}
            id={fileId}
            className="w-full min-w-0"
            type="file"
            accept=".json,application/json"
            disabled={review.isPending || restore.isPending}
            aria-describedby={`${fileId}-hint`}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              review.reset();
              restore.reset();
              if (file) review.mutate(file);
            }}
          />
          <p className="meta" id={`${fileId}-hint`}>
            {m["transfer.file_hint"]({
              version: HOUSEHOLD_TRANSFER_VERSION,
              megabytes: HOUSEHOLD_TRANSFER_MAX_BYTES / 1024 / 1024,
            })}
          </p>
        </div>
        {review.isError && (
          <p className="form-error" role="alert">
            {oversized(review.error)
              ? m["transfer.too_large"]()
              : m["transfer.invalid_file"]()}
          </p>
        )}
        {archive && (
          <div className="grid w-full min-w-0 gap-3">
            <h3>{m["transfer.preview"]()}</h3>
            <p className="meta break-all">{review.variables?.name}</p>
            <TransferCounts
              counts={{
                recipes: archive.recipes.length,
                ingredients: archive.ingredients.filter(
                  (item) => item.kind === "custom",
                ).length,
                lists: archive.lists.length,
                items: archive.items.length,
                queue: archive.queue.length,
                stores: archive.stores.length,
                pantry: archive.pantry.length,
                recurring: archive.recurring.length,
                leftovers: archive.leftovers.length,
                cookLogs: archive.cookLogs.length,
              }}
            />
          </div>
        )}
        <Button
          disabled={!archive || review.isPending || restore.isPending}
          aria-busy={restore.isPending}
          onClick={() => {
            if (archive) restore.mutate(archive);
          }}
        >
          <Upload size={18} aria-hidden="true" />
          {m["transfer.import"]()}
        </Button>
        <p className="meta" role="status">
          {review.isPending
            ? m["transfer.reading"]()
            : restore.isPending
              ? m["transfer.importing"]()
              : ""}
        </p>
        {restore.isError && (
          <p className="form-error" role="alert">
            {oversized(restore.error)
              ? m["transfer.too_large"]()
              : errorMessage(restore.error)}
          </p>
        )}
        {restore.data && (
          <div className="grid w-full gap-3">
            <p role="status">{m["transfer.success"]()}</p>
            <TransferCounts counts={restore.data.imported} />
          </div>
        )}
      </section>
    </>
  );
}
