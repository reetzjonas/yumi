import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerPwa } from "@/lib/pwa";
import { queryClient } from "@/lib/query-client";
import { m } from "@/paraglide/messages";
import { getLocale, getTextDirection } from "@/paraglide/runtime";
import { routeTree } from "./routeTree.gen";
import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "@fontsource-variable/instrument-sans/index.css";
import "./styles.css";
import "./shell.css";
import "./list.css";
import "./cooking.css";
import "./pictogram.css";

document.documentElement.lang = getLocale();
document.documentElement.dir = getTextDirection();
registerPwa();
document
  .querySelector('meta[name="description"]')
  ?.setAttribute("content", m.app_description());

if (
  import.meta.env.DEV &&
  import.meta.env.VITE_DISABLE_REACT_DEVTOOLS !== "1"
) {
  void import("react-grab");
  void import("react-scan");
}

const router = createRouter({ routeTree, context: { queryClient } });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
