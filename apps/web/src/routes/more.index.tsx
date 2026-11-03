import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Settings } from "lucide-react";
import { MoreSlot } from "@/components/app-shell";
import { PageHeader } from "@/components/page";

export const Route = createFileRoute("/more/")({ component: More });

function More() {
  return (
    <>
      <PageHeader title="More" />
      <div className="settings-list">
        <Link to="/more/settings" className="settings-link">
          <Settings aria-hidden="true" size={22} />
          <span>Settings</span>
          <ChevronRight aria-hidden="true" size={20} />
        </Link>
      </div>
      <MoreSlot />
    </>
  );
}
