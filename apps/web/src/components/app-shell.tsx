import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  CookingPot,
  Ellipsis,
  ListChecks,
  ShoppingBasket,
} from "lucide-react";
import { createContext, type ReactNode, useContext } from "react";
import { Toaster } from "@/components/ui/sonner";

const destinations = [
  { to: "/recipes", label: "Recipes", icon: BookOpen },
  { to: "/plan", label: "Plan", icon: ListChecks },
  { to: "/list", label: "List", icon: ShoppingBasket },
  { to: "/more", label: "More", icon: Ellipsis },
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
  return (
    <MoreSlotContext value={moreSlot}>
      <div className="app-shell">
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <header className="brand-row">
          <Link to="/recipes" className="brand" aria-label="yumi">
            <CookingPot aria-hidden="true" strokeWidth={1.8} />
            <span>yumi</span>
          </Link>
        </header>
        <nav className="app-navigation" aria-label="Main navigation">
          {destinations.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="nav-link"
              activeProps={{ className: "is-active", "aria-current": "page" }}
            >
              <Icon aria-hidden="true" size={22} strokeWidth={1.8} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        {accountSlot && <div className="account-slot">{accountSlot}</div>}
        <main id="main" tabIndex={-1} className="app-main">
          <div className="page-content">{children}</div>
        </main>
        <Toaster />
      </div>
    </MoreSlotContext>
  );
}

export function MoreSlot() {
  const children = useContext(MoreSlotContext);
  return children ? <div className="more-slot">{children}</div> : null;
}
