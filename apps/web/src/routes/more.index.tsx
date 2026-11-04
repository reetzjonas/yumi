import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Archive,
  ChevronRight,
  type LucideIcon,
  Repeat,
  Settings,
  Store,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/page";
import { InstallHint } from "@/components/pwa-provider";
import { useAppVersion } from "@/lib/app-info";
import { useMe } from "@/lib/session";
import { useStores } from "@/lib/stores";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/more/")({ component: More });

function MoreRow({
  to,
  icon: Icon,
  title,
  detail,
}: {
  to:
    | "/more/household"
    | "/more/stores"
    | "/more/pantry"
    | "/more/recurring"
    | "/more/settings";
  icon: LucideIcon;
  title: string;
  detail: string;
}) {
  return (
    <li>
      <Link to={to} className="more-row">
        <Icon aria-hidden="true" size={22} strokeWidth={1.8} />
        <span className="more-row-main">
          <span className="more-row-title">{title}</span>
          <span className="meta">{detail}</span>
        </span>
        <ChevronRight aria-hidden="true" size={20} />
      </Link>
    </li>
  );
}

function More() {
  const me = useMe();
  const stores = useStores();
  const version = useAppVersion();
  const household = me?.households.find((h) => h.id === me.activeHouseholdId);
  return (
    <>
      <PageHeader title={m.nav_more()} />
      <ul className="card-list">
        <MoreRow
          to="/more/household"
          icon={Users}
          title={m["household.title"]()}
          detail={household?.name ?? ""}
        />
        <MoreRow
          to="/more/stores"
          icon={Store}
          title={m["stores.title"]()}
          detail={m["more.stores_detail"]({ count: stores.data?.length ?? 0 })}
        />
        <MoreRow
          to="/more/pantry"
          icon={Archive}
          title={m["pantry.title"]()}
          detail={m["more.pantry_detail"]()}
        />
        <MoreRow
          to="/more/recurring"
          icon={Repeat}
          title={m["recurring.title"]()}
          detail={m["more.recurring_detail"]()}
        />
        <MoreRow
          to="/more/settings"
          icon={Settings}
          title={m.settings_title()}
          detail={m["more.settings_detail"]()}
        />
      </ul>
      <InstallHint />
      <p className="more-footer meta">
        {m["more.footer"]({ version: version ?? "…" })} ·{" "}
        <Link to="/more/about" className="text-link">
          {m["about.title"]()}
        </Link>
      </p>
    </>
  );
}
