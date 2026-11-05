import type { HouseholdImportResult } from "@yumi/shared";
import { formatNumber } from "@/lib/i18n";
import { m } from "@/paraglide/messages";

export function TransferCounts({
  counts,
}: {
  readonly counts: HouseholdImportResult["imported"];
}) {
  const labels = [
    ["recipes", m["transfer.recipes"]],
    ["ingredients", m["transfer.ingredients"]],
    ["lists", m["transfer.lists"]],
    ["items", m["transfer.items"]],
    ["queue", m["transfer.queue"]],
    ["stores", m["transfer.stores"]],
    ["pantry", m["transfer.pantry"]],
    ["recurring", m["transfer.recurring"]],
    ["leftovers", m["transfer.leftovers"]],
    ["cookLogs", m["transfer.cook_logs"]],
  ] as const;
  return (
    <dl className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2">
      {labels.map(([key, label]) => (
        <div key={key} className="contents">
          <dt>{label()}</dt>
          <dd className="text-right font-semibold tabular-nums">
            {formatNumber(counts[key])}
          </dd>
        </div>
      ))}
    </dl>
  );
}
