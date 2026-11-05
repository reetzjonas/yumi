import type { VitePWAOptions } from "vite-plugin-pwa";
import { API_CACHE_NAME } from "./src/lib/pwa-cache.ts";

export const pwaOptions = {
  registerType: "prompt",
  injectRegister: false,
  includeAssets: ["icon.svg", "icons/*.png"],
  manifest: {
    id: "/",
    name: "yumi",
    short_name: "yumi",
    description: "Recipes, meal planning, and shopping for your household.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    theme_color: "#fcfaf5",
    background_color: "#fcfaf5",
    share_target: {
      action: "/recipes/import",
      method: "GET",
      enctype: "application/x-www-form-urlencoded",
      params: { url: "url", text: "text", title: "title" },
    },
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  },
  workbox: {
    globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
    cleanupOutdatedCaches: true,
    navigateFallback: "index.html",
    navigateFallbackDenylist: [/^\/api(?:\/|$)/],
    runtimeCaching: [
      {
        urlPattern: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
          sameOrigin &&
          url.pathname.startsWith("/api/") &&
          url.pathname !== "/api/shopping/stream" &&
          !/^\/api\/household-transfer(?:\/|$)/.test(url.pathname) &&
          !/^\/api\/recipe-shares(?:\/|$)/.test(url.pathname) &&
          !/^\/api\/recipes\/[^/]+\/shares(?:\/|$)/.test(url.pathname) &&
          !/^\/api\/auth(?:\/|$)/.test(url.pathname),
        method: "GET",
        handler: "NetworkFirst",
        options: {
          cacheName: API_CACHE_NAME,
          networkTimeoutSeconds: 3,
          cacheableResponse: { statuses: [200] },
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 86400,
            purgeOnQuotaError: true,
          },
        },
      },
    ],
  },
} satisfies Partial<VitePWAOptions>;
