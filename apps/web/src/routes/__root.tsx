import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PwaProvider } from "@/components/pwa-provider";
import { ThemeProvider } from "@/components/theme-provider";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    component: () => (
      <ThemeProvider>
        <PwaProvider>
          <AppShell>
            <Outlet />
          </AppShell>
        </PwaProvider>
      </ThemeProvider>
    ),
  },
);
