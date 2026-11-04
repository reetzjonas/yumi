import { createFileRoute } from "@tanstack/react-router";
import { BackLink, PageHeader } from "@/components/page";
import { type Theme, useTheme } from "@/components/theme-provider";
import { type Locale, useLocale } from "@/lib/i18n";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/more/settings")({ component: Settings });

function Settings() {
  const { theme, setTheme } = useTheme();
  const { locale, setLocale } = useLocale();
  return (
    <div className="settings-page">
      <PageHeader
        title={m.settings_title()}
        back={<BackLink to="/more" label={m.nav_more()} />}
      />
      <div className="preference-row">
        <label htmlFor="language">{m.settings_language()}</label>
        <select
          id="language"
          value={locale}
          onChange={(event) => setLocale(event.target.value as Locale)}
        >
          <option value="de" lang="de">
            Deutsch
          </option>
          <option value="en" lang="en">
            English
          </option>
        </select>
      </div>
      <div className="preference-row">
        <label htmlFor="theme">{m.settings_theme()}</label>
        <select
          id="theme"
          value={theme}
          onChange={(event) => setTheme(event.target.value as Theme)}
        >
          <option value="system">{m.settings_theme_system()}</option>
          <option value="light">{m.settings_theme_light()}</option>
          <option value="dark">{m.settings_theme_dark()}</option>
        </select>
      </div>
      <p className="settings-note">{m.settings_saved()}</p>
    </div>
  );
}
