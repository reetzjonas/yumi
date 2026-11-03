import { useSyncExternalStore } from "react";
import { pendingRecords } from "@/lib/outbox";
import { useMe } from "@/lib/session";
import { useOutboxRevision } from "@/lib/shopping-sync";
import { m } from "@/paraglide/messages";

function subscribeOnline(update: () => void) {
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  return () => {
    window.removeEventListener("online", update);
    window.removeEventListener("offline", update);
  };
}

export function ShoppingSyncStatus({ listId }: { listId: string }) {
  const householdId = useMe()?.activeHouseholdId;
  useOutboxRevision();
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine);
  const count = pendingRecords(householdId ?? "", listId).length;
  if (online && count === 0) return null;
  return (
    <p className="shopping-sync-status" role="status">
      {!online && <span>{m["shopping.offline"]()}</span>}
      {count > 0 && (
        <span>
          {count === 1
            ? m["shopping.pending_one"]()
            : m["shopping.pending"]({ count })}
        </span>
      )}
    </p>
  );
}
