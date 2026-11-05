import { createFileRoute } from "@tanstack/react-router";
import { HouseholdTransferPanel } from "@/components/household-transfer/panel";
import { BackLink, PageHeader } from "@/components/page";
import { useMe } from "@/lib/session";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/more/data")({ component: DataTransfer });

function DataTransfer() {
  const me = useMe();
  const household = me?.households.find(
    (item) => item.id === me.activeHouseholdId,
  );
  return (
    <div className="settings-page">
      <PageHeader
        title={m["transfer.title"]()}
        back={<BackLink to="/more" label={m.nav_more()} />}
      />
      {household && (
        <HouseholdTransferPanel
          key={household.id}
          householdName={household.name}
        />
      )}
    </div>
  );
}
