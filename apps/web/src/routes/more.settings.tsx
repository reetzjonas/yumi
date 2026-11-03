import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page";
import { type Theme, useTheme } from "@/components/theme-provider";

export const Route = createFileRoute("/more/settings")({ component: Settings });

function Settings() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="settings-page">
      <PageHeader title="Settings">
        <Link to="/more" className="back-link">
          <ArrowLeft aria-hidden="true" size={18} />
          More
        </Link>
      </PageHeader>
      <div className="preference-row">
        <label htmlFor="theme">Appearance</label>
        <select
          id="theme"
          value={theme}
          onChange={(event) => setTheme(event.target.value as Theme)}
        >
          <option value="system">Use device setting</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>
      <p className="settings-note">
        Changes are saved on this device automatically.
      </p>
    </div>
  );
}
