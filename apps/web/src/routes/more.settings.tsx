import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { useSignOut } from "@/components/account-menu";
import { BackLink, PageHeader } from "@/components/page";
import { PushSettings } from "@/components/push-settings";
import { type Theme, useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { ensureOk } from "@/lib/api-error";
import { type Locale, useLocale } from "@/lib/i18n";
import { useMe } from "@/lib/session";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/more/settings")({ component: Settings });

function ChoiceChips<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; lang?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="settings-group">
      <legend className="section-label">{label}</legend>
      <div className="chip-row">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className="chip"
            lang={option.lang}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Settings() {
  const { theme, setTheme } = useTheme();
  const { locale, setLocale } = useLocale();
  const me = useMe();
  const signOut = useSignOut();
  const capabilities = useQuery({
    queryKey: ["recipe-import-capabilities", me?.activeHouseholdId],
    queryFn: async () =>
      (await ensureOk(await api.recipes.import.capabilities.$get())).json(),
  });
  return (
    <div className="settings-page">
      <PageHeader
        title={m.settings_title()}
        back={<BackLink to="/more" label={m.nav_more()} />}
      />
      <ChoiceChips<Locale>
        label={m.settings_language()}
        value={locale}
        onChange={setLocale}
        options={[
          { value: "de", label: "Deutsch", lang: "de" },
          { value: "en", label: "English", lang: "en" },
        ]}
      />
      <ChoiceChips<Theme>
        label={m.settings_theme()}
        value={theme}
        onChange={setTheme}
        options={[
          { value: "system", label: m["settings.theme_system_short"]() },
          { value: "light", label: m.settings_theme_light() },
          { value: "dark", label: m.settings_theme_dark() },
        ]}
      />
      <p className="meta">{m.settings_saved()}</p>
      {capabilities.data && (
        <section className="settings-group">
          <h2 className="section-label">{m["settings.ai_title"]()}</h2>
          <div className="import-card">
            <h3 className="import-card-title">
              {capabilities.data.photos
                ? m["settings.ai_on"]()
                : m["settings.ai_off"]()}
            </h3>
            <p className="import-card-text">
              {capabilities.data.photos
                ? m["settings.ai_on_text"]()
                : m["settings.ai_off_text"]()}
            </p>
          </div>
        </section>
      )}
      <PushSettings />
      <div className="settings-actions">
        <Button asChild variant="outline" className="w-full">
          <Link to="/more/about">{m["about.title"]()}</Link>
        </Button>
        {me && (
          <p className="meta">
            {m["auth.signed_in_as"]({ email: me.user.email })}
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          className="w-full button-danger-text"
          onClick={() => void signOut()}
        >
          <LogOut aria-hidden="true" size={18} />
          {m["auth.sign_out"]()}
        </Button>
      </div>
    </div>
  );
}
