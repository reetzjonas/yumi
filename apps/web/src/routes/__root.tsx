import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  Outlet,
  redirect,
  useRouterState,
} from "@tanstack/react-router";
import { MoreAccountEntries } from "@/components/account-menu";
import { AppShell } from "@/components/app-shell";
import { TimerProvider } from "@/components/cooking/timer-provider";
import { PwaProvider } from "@/components/pwa-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { meQuery, useMe } from "@/lib/session";
import { useShoppingSync } from "@/lib/shopping-sync";

/** Reachable without a session. */
const PUBLIC_PATHS = ["/login", "/signup"];
/** Need a session, but no active household. */
const HOUSEHOLDLESS_PATHS = ["/onboarding", "/invite/"];
const BARE_PATHS = [...PUBLIC_PATHS, ...HOUSEHOLDLESS_PATHS, "/cook/"];

const matches = (pathname: string, prefixes: string[]) =>
  prefixes.some((p) => pathname.startsWith(p));

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    beforeLoad: async ({ context, location }) => {
      const me = await context.queryClient.ensureQueryData(meQuery);
      const isPublic = matches(location.pathname, PUBLIC_PATHS);
      if (!me && !isPublic) {
        throw redirect({ to: "/login", search: { redirect: location.href } });
      }
      if (me && isPublic) throw redirect({ to: "/" });
      if (
        me &&
        !me.activeHouseholdId &&
        !matches(location.pathname, [...PUBLIC_PATHS, ...HOUSEHOLDLESS_PATHS])
      ) {
        throw redirect({
          to: "/onboarding",
          search: { redirect: location.href },
        });
      }
    },
    component: Root,
  },
);

function Root() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const me = useMe();
  useShoppingSync();
  return (
    <ThemeProvider>
      <TimerProvider householdId={me?.activeHouseholdId}>
        <PwaProvider>
          {matches(pathname, BARE_PATHS) || !me ? (
            <Outlet />
          ) : (
            <AppShell
              moreSlot={<MoreAccountEntries me={me} />}
              householdName={
                me.households.find((h) => h.id === me.activeHouseholdId)?.name
              }
            >
              <Outlet />
            </AppShell>
          )}
        </PwaProvider>
      </TimerProvider>
    </ThemeProvider>
  );
}
