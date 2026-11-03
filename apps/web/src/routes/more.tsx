import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { Archive, Settings, Store, Users } from "lucide-react";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/more")({ component: MoreLayout });

const sections = [
  { to: "/more/settings", label: m.settings_title, icon: Settings },
  { to: "/more/household", label: m["household.title"], icon: Users },
  { to: "/more/stores", label: m["stores.title"], icon: Store },
  { to: "/more/pantry", label: m["pantry.title"], icon: Archive },
] as const;

function MoreLayout() {
  return (
    <div className="split more-split">
      <nav className="more-nav" aria-label={m.nav_more()}>
        {sections.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="nav-link"
            activeProps={{ className: "is-active", "aria-current": "page" }}
          >
            <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
            <span>{label()}</span>
          </Link>
        ))}
      </nav>
      <div className="more-content">
        <Outlet />
      </div>
    </div>
  );
}
