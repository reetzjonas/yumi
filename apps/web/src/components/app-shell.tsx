import { Link, useNavigate } from "@tanstack/react-router";
import {
  BookOpen,
  CookingPot,
  Ellipsis,
  ListChecks,
  Plus,
  ShoppingBasket,
} from "lucide-react";
import { createContext, type ReactNode, useContext, useEffect } from "react";
import { ConnectionStatus } from "@/components/pwa-provider";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { m } from "@/paraglide/messages";

const destinations = [
  { to: "/recipes", label: m.nav_recipes, icon: BookOpen },
  { to: "/plan", label: m.nav_plan, icon: ListChecks },
  { to: "/list", label: m.nav_list, icon: ShoppingBasket },
  { to: "/more", label: m.nav_more, icon: Ellipsis },
] as const;

const MoreSlotContext = createContext<ReactNode>(null);

export function AppShell({
  children,
  accountSlot,
  moreSlot,
}: {
  children: ReactNode;
  accountSlot?: ReactNode;
  moreSlot?: ReactNode;
}) {
  useDesktopShortcuts();
  return (
    <MoreSlotContext value={moreSlot}>
      <div className="app-shell">
        <a className="skip-link" href="#main">
          {m.skip_content()}
        </a>
        <header className="brand-row">
          <Link to="/recipes" className="brand" aria-label="yumi">
            <CookingPot aria-hidden="true" strokeWidth={1.8} />
            <span>yumi</span>
          </Link>
        </header>
        <nav className="app-navigation" aria-label={m.nav_main()}>
          {destinations.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="nav-link"
              activeProps={{ className: "is-active", "aria-current": "page" }}
            >
              <Icon aria-hidden="true" size={22} strokeWidth={1.8} />
              <span>{label()}</span>
            </Link>
          ))}
        </nav>
        <div className="shell-action">
          <Button asChild variant="outline">
            <Link to="/recipes/new">
              <Plus aria-hidden="true" size={20} />
              {m["recipes.new"]()}
            </Link>
          </Button>
        </div>
        {accountSlot && <div className="account-slot">{accountSlot}</div>}
        <main id="main" tabIndex={-1} className="app-main">
          <div className="page-content">
            <ConnectionStatus />
            {children}
          </div>
        </main>
        <Toaster />
      </div>
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
