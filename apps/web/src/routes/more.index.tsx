import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Settings } from "lucide-react";
import { MoreSlot } from "@/components/app-shell";
import { PageHeader } from "@/components/page";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/more/")({ component: More });

function More() {
  return (
    <>
      <PageHeader title={m.nav_more()} />
      <div className="settings-list">
        <Link to="/more/settings" className="settings-link">
          <Settings aria-hidden="true" size={22} />
          <span>{m.settings_title()}</span>
          <ChevronRight aria-hidden="true" size={20} />
        </Link>
      </div>
      <MoreSlot />
    </>
  );
}
