import { describe, expect, test } from "bun:test";
import { PICTOGRAMS, pictogramFile } from "@yumi/shared";
import { pwaOptions } from "../../pwa.config";

describe("PWA configuration", () => {
  test("every supported pictogram is shipped and matched by the precache globs", async () => {
    for (const { emoji } of PICTOGRAMS) {
      const path = `pictograms/${pictogramFile(emoji)}`;
      expect(
        pwaOptions.workbox.globPatterns.some((pattern) =>
          new Bun.Glob(pattern).match(path),
        ),
      ).toBe(true);
      expect(
        await Bun.file(
          new URL(`../../public/${path}`, import.meta.url),
        ).exists(),
      ).toBe(true);
    }
  });

  test("manifest supports standalone installation with distinct maskable icons", () => {
    expect(pwaOptions.manifest.name).toBe("yumi");
    expect(pwaOptions.manifest.display).toBe("standalone");
    expect(pwaOptions.manifest.orientation).toBe("any");
    expect(pwaOptions.manifest.icons.map((icon) => icon.sizes)).toContain(
      "192x192",
    );
    expect(pwaOptions.manifest.icons.map((icon) => icon.sizes)).toContain(
      "512x512",
    );
    expect(
      pwaOptions.manifest.icons.some((icon) => icon.purpose === "maskable"),
    ).toBe(true);
  });

  test("only same-origin non-auth API GET reads are runtime cached", () => {
    const rule = pwaOptions.workbox.runtimeCaching[0];
    if (!rule) throw new Error("API runtime caching rule is missing");
    const matches = (path: string, sameOrigin = true) =>
      rule.urlPattern({
        url: new URL(path, "https://yumi.example"),
        sameOrigin,
      });
    expect(rule.method).toBe("GET");
    expect(rule.handler).toBe("NetworkFirst");
    expect(rule.options.cacheableResponse.statuses).toEqual([200]);
    for (const path of ["/api/recipes", "/api/queue", "/api/households"])
      expect(matches(path)).toBe(true);
    for (const path of [
      "/api/auth",
      "/api/auth/session",
      "/api/auth/sign-out",
      "/api/shopping/stream",
      "/api/household-transfer/export",
      "/api/recipe-shares/token",
      "/api/recipe-shares/token/image/full",
      "/api/recipes/recipe-id/shares",
      "/recipes",
      "/apiary",
    ])
      expect(matches(path)).toBe(false);
    expect(matches("/api/recipes", false)).toBe(false);
  });

  test("SPA navigation fallback never handles API paths", () => {
    const denylist = pwaOptions.workbox.navigateFallbackDenylist;
    for (const path of ["/api", "/api/recipes", "/api/auth/session"]) {
      expect(denylist.some((pattern) => pattern.test(path))).toBe(true);
    }
    expect(denylist.some((pattern) => pattern.test("/recipes"))).toBe(false);
    expect(pwaOptions.registerType).toBe("prompt");
  });
});
