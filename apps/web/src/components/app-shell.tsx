import { Link, useNavigate } from "@tanstack/react-router";
import { BookOpen, ListChecks, ListOrdered, Menu, Users } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { TitleSlotContext } from "@/components/page";
import { ConnectionStatus } from "@/components/pwa-provider";
import { Toaster } from "@/components/ui/sonner";
import { m } from "@/paraglide/messages";

const destinations = [
  { to: "/recipes", label: m.nav_recipes, icon: BookOpen },
  { to: "/plan", label: m.nav_plan, icon: ListOrdered },
  { to: "/list", label: m.nav_list, icon: ListChecks },
  { to: "/more", label: m.nav_more, icon: Menu },
] as const;

const MoreSlotContext = createContext<ReactNode>(null);

export function AppShell({
  children,
  moreSlot,
  householdName,
}: {
  children: ReactNode;
  moreSlot?: ReactNode;
  householdName?: string;
}) {
  useDesktopShortcuts();
  const [titleSlot, setTitleSlot] = useState<HTMLDivElement | null>(null);
  return (
    <MoreSlotContext value={moreSlot}>
      <TitleSlotContext value={titleSlot}>
        <div className="app-shell">
          <a className="skip-link" href="#main">
            {m.skip_content()}
          </a>
          <header className="top-bar">
            <div ref={setTitleSlot} className="top-title-slot" />
            {householdName && (
              <Link to="/more/household" className="household-chip">
                <Users aria-hidden="true" size={18} />
                <span>{householdName}</span>
              </Link>
            )}
          </header>
          <nav className="app-navigation" aria-label={m.nav_main()}>
            <Link to="/recipes" className="brand">
              yumi
            </Link>
            {destinations.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="nav-link"
                activeProps={{
                  className: "is-active",
                  "aria-current": "page",
                }}
              >
                <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
                <span>{label()}</span>
              </Link>
            ))}
          </nav>
          <main id="main" tabIndex={-1} className="app-main">
            <div className="page-content">
              <ConnectionStatus />
              {children}
            </div>
          </main>
          <Toaster />
        </div>
      </TitleSlotContext>
    </MoreSlotContext>
  );
}

function useDesktopShortcuts() {
  const navigate = useNavigate();
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1200px)");
    function onKeyDown(event: KeyboardEvent) {
      if (
        !desktop.matches ||
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        (event.target instanceof HTMLElement &&
          event.target.closest("input, textarea, select, [contenteditable]"))
      )
        return;
      if (event.key === "/") {
        const search = document.querySelector<HTMLInputElement>(
          '.app-main input[type="search"]',
        );
        if (search) {
          event.preventDefault();
          search.focus();
        }
      } else if (event.key === "n") {
        event.preventDefault();
        void navigate({ to: "/recipes/new" });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);
}

export function MoreSlot() {
  const children = useContext(MoreSlotContext);
  return children ? <div className="more-slot">{children}</div> : null;
}
