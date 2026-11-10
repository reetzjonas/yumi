import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { BookOpen, CircleUser, ShoppingBasket, Sun } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { StageSlotContext } from "@/components/page";
import { ConnectionStatus } from "@/components/pwa-provider";
import { Toaster } from "@/components/ui/sonner";
import { m } from "@/paraglide/messages";

/** Each section is a color world; the world tints the stage and the navigation. */
const destinations = [
  { to: "/plan", world: "heute", label: m.nav_today, icon: Sun },
  { to: "/recipes", world: "rezepte", label: m.nav_recipes, icon: BookOpen },
  { to: "/list", world: "liste", label: m.nav_list, icon: ShoppingBasket },
  { to: "/more", world: "mehr", label: m.nav_more, icon: CircleUser },
] as const;

/** Recipe detail: a full-screen read with its own action dock instead of the tabs. */
const IMMERSIVE = /^\/recipes\/[^/]+\/?$/;

export function AppShell({ children }: { children: ReactNode }) {
  useDesktopShortcuts();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [stageSlot, setStageSlot] = useState<HTMLDivElement | null>(null);
  const world =
    destinations.find((item) => pathname.startsWith(item.to))?.world ?? "heute";
  const immersive =
    IMMERSIVE.test(pathname) &&
    !["/recipes/new", "/recipes/import"].includes(pathname);
  return (
    <StageSlotContext value={stageSlot}>
      <div
        className="app-shell"
        data-world={world}
        data-immersive={immersive || undefined}
      >
        <a className="skip-link" href="#main">
          {m.skip_content()}
        </a>
        <nav className="app-navigation" aria-label={m.nav_main()}>
          <Link to="/plan" className="brand">
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
              <Icon aria-hidden="true" size={22} strokeWidth={2} />
              <span className="nav-label">{label()}</span>
            </Link>
          ))}
        </nav>
        <main id="main" tabIndex={-1} className="app-main">
          <div ref={setStageSlot} className="stage-slot" />
          <div className="page-content">
            <ConnectionStatus />
            {children}
          </div>
        </main>
        <Toaster />
      </div>
    </StageSlotContext>
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
