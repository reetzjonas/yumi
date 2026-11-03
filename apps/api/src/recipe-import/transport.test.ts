import { describe, expect, test } from "bun:test";
import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import { RecipeExtractionError, RecipeImportError } from "./errors";
import { downloadRecipeImage, importRecipe } from "./index";
import {
  fetchResource,
  isPublicAddress,
  type RecipeHttpTransport,
  type ResolvedAddress,
  type TransportResponse,
  validateImportUrl,
} from "./transport";

const PUBLIC = { address: "93.184.216.34", family: 4 };
const options = { maxBytes: 64, accept: "text/html" };
const html =
  '<script type="application/ld+json">{"@type":"Recipe","name":"Soup","image":"/cover.png","recipeIngredient":["200 g flour"]}</script>';
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBmkAAAAASUVORK5CYII=",
  "base64",
);

function response(
  body: string | Uint8Array = "",
  status = 200,
  headers: Record<string, string> = {},
): TransportResponse {
  return { status, headers: new Headers(headers), body: Readable.from([body]) };
}

function fakeTransport(
  handler: (
    url: URL,
    address: ResolvedAddress,
    signal: AbortSignal,
  ) => TransportResponse | Promise<TransportResponse>,
  resolve: RecipeHttpTransport["resolve"] = async () => [PUBLIC],
): RecipeHttpTransport {
  return {
    resolve,
    request: async (url, address, signal) => handler(url, address, signal),
  };
}

async function errorCode(promise: Promise<unknown>, expected: string) {
  const error = await promise.then(
    () => null,
    (error: unknown) => error,
  );
  expect(error).toBeInstanceOf(RecipeImportError);
  expect(error).toMatchObject({ code: expected });
}

describe("public address policy", () => {
  test.each([
    "0.0.0.0",
    "0.1.2.3",
    "10.0.0.1",
    "100.64.0.1",
    "100.127.255.255",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.0.0.9",
    "192.0.2.1",
    "192.88.99.1",
    "192.168.1.1",
    "198.18.0.1",
    "198.19.255.255",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "fc00::1",
    "fd12::1",
    "fe80::1",
    "fe80::1%eth0",
    "ff02::1",
    "64:ff9b::7f00:1",
    "64:ff9b:1::1",
    "100::1",
    "2001::1",
    "2001:2::1",
    "2001:10::1",
    "2001:db8::1",
    "2002:7f00:1::",
    "3fff::1",
    "invalid",
  ])("blocks %s", (address) => expect(isPublicAddress(address)).toBe(false));

  test.each([
    "1.1.1.1",
    "8.8.8.8",
    "93.184.216.34",
    "100.128.0.1",
    "172.32.0.1",
    "2001:4860:4860::8888",
    "2606:4700:4700::1111",
    "2a00:1450::1",
  ])("allows %s", (address) => expect(isPublicAddress(address)).toBe(true));

  test.each([
    "file:///etc/passwd",
    "ftp://example.com/file",
    "http://user:pass@example.com",
    "http://example.com:8080",
    "http://127.1",
    "http://2130706433",
    "http://0x7f000001",
    "http://[::ffff:127.0.0.1]",
    "http://[::1]",
    "not a URL",
  ])("blocks unsafe URL %s", (url) =>
    expect(() => validateImportUrl(url)).toThrow(),
  );
});

describe("bounded transport", () => {
  test("pins the checked address at the request boundary", async () => {
    let resolutions = 0;
    let requests = 0;
    const transport = fakeTransport(
      (url, address) => {
        requests++;
        expect(url.hostname).toBe("recipes.example");
        expect(address).toEqual(PUBLIC);
        return response("ok");
      },
      async () =>
        ++resolutions === 1 ? [PUBLIC] : [{ address: "127.0.0.1", family: 4 }],
    );
    const result = await fetchResource(
      "https://recipes.example",
      options,
      transport,
    );
    expect(Buffer.from(result.bytes).toString()).toBe("ok");
    expect(resolutions).toBe(1);
    expect(requests).toBe(1);
  });

  test("rejects a DNS response containing both public and private addresses", async () => {
    let requested = false;
    const transport = fakeTransport(
      () => {
        requested = true;
        return response();
      },
      async () => [PUBLIC, { address: "::1", family: 6 }],
    );
    await errorCode(
      fetchResource("https://recipes.example", options, transport),
      "blocked_url",
    );
    expect(requested).toBe(false);
  });

  test("rejects empty DNS and inconsistent address families", async () => {
    for (const addresses of [[], [{ address: "127.0.0.1", family: 6 }]]) {
      await errorCode(
        fetchResource(
          "https://recipes.example",
          options,
          fakeTransport(
            () => response(),
            async () => addresses,
          ),
        ),
        "blocked_url",
      );
    }
  });

  test("blocks redirect to metadata IP without requesting it", async () => {
    let requests = 0;
    const transport = fakeTransport(() => {
      requests++;
      return response("", 302, {
        location: "http://169.254.169.254/latest/meta-data",
      });
    });
    await errorCode(
      fetchResource("https://recipes.example", options, transport),
      "blocked_url",
    );
    expect(requests).toBe(1);
  });

  test("resolves every redirect, catching rebinding on the same hostname", async () => {
    let resolutions = 0;
    let requests = 0;
    const transport = fakeTransport(
      () => {
        requests++;
        return response("", 302, { location: "/other" });
      },
      async () =>
        ++resolutions === 1 ? [PUBLIC] : [{ address: "10.0.0.1", family: 4 }],
    );
    await errorCode(
      fetchResource("https://recipes.example", options, transport),
      "blocked_url",
    );
    expect(resolutions).toBe(2);
    expect(requests).toBe(1);
  });

  test("follows bounded public relative redirects and reports final source URL", async () => {
    const transport = fakeTransport((url) =>
      url.pathname === "/"
        ? response("", 301, { location: "/recipe#top" })
        : response("done"),
    );
    const result = await fetchResource(
      "https://recipes.example",
      options,
      transport,
    );
    expect(result.sourceUrl).toBe("https://recipes.example/recipe");
    await errorCode(
      fetchResource(
        "https://recipes.example",
        options,
        fakeTransport(() => response("", 302, { location: "/" })),
      ),
      "redirect_limit",
    );
  });

  test("caps declared, chunked and decoded compressed response sizes", async () => {
    await errorCode(
      fetchResource(
        "https://recipes.example",
        options,
        fakeTransport(() => response("", 200, { "content-length": "65" })),
      ),
      "response_too_large",
    );
    await errorCode(
      fetchResource(
        "https://recipes.example",
        options,
        fakeTransport(() => ({
          status: 200,
          headers: new Headers(),
          body: Readable.from(["a".repeat(40), "b".repeat(40)]),
        })),
      ),
      "response_too_large",
    );
    await errorCode(
      fetchResource(
        "https://recipes.example",
        options,
        fakeTransport(() =>
          response(gzipSync("a".repeat(2000)), 200, {
            "content-encoding": "gzip",
          }),
        ),
      ),
      "response_too_large",
    );
  });

  test("decodes a compressed body within the cap", async () => {
    const result = await fetchResource(
      "https://recipes.example",
      options,
      fakeTransport(() =>
        response(gzipSync("hello"), 200, { "content-encoding": "gzip" }),
      ),
    );
    expect(Buffer.from(result.bytes).toString()).toBe("hello");
  });

  test("times out DNS, request and a stalled body", async () => {
    await errorCode(
      fetchResource(
        "https://recipes.example",
        { ...options, timeoutMs: 10 },
        fakeTransport(
          () => response(),
          () => new Promise(() => {}),
        ),
      ),
      "timeout",
    );
    await errorCode(
      fetchResource(
        "https://recipes.example",
        { ...options, timeoutMs: 10 },
        fakeTransport(() => new Promise(() => {})),
      ),
      "timeout",
    );
    await errorCode(
      fetchResource(
        "https://recipes.example",
        { ...options, timeoutMs: 10 },
        fakeTransport(() => ({
          status: 200,
          headers: new Headers(),
          body: new Readable({ read() {} }),
        })),
      ),
      "timeout",
    );
  });

  test("rejects HTTP failures and unsupported compression", async () => {
    await errorCode(
      fetchResource(
        "https://recipes.example",
        options,
        fakeTransport(() => response("no", 403)),
      ),
      "fetch_failed",
    );
    await errorCode(
      fetchResource(
        "https://recipes.example",
        options,
        fakeTransport(() =>
          response("", 200, { "content-encoding": "unknown" }),
        ),
      ),
      "unsupported_content",
    );
  });
});

describe("import pipeline and images", () => {
  test("retains fetched readable text and source for AI fallback without a second request", async () => {
    let requests = 0;
    const transport = fakeTransport(() => {
      requests++;
      return response(
        "<nav>Menu</nav><h1>Soup</h1><p>Boil vegetables.</p><script>tracking()</script>",
        200,
        { "content-type": "text/html" },
      );
    });
    const error = await importRecipe("https://recipes.example", transport).then(
      () => null,
      (error: unknown) => error,
    );
    expect(error).toBeInstanceOf(RecipeExtractionError);
    expect((error as RecipeExtractionError).code).toBe("no_recipe");
    expect((error as RecipeExtractionError).sourceUrl).toBe(
      "https://recipes.example/",
    );
    expect((error as RecipeExtractionError).readableText).toBe(
      "Soup Boil vegetables.",
    );
    expect(requests).toBe(1);
  });

  test("returns a draft and image bytes, using final URL for relative images", async () => {
    const requested: string[] = [];
    const transport = fakeTransport((url) => {
      requested.push(url.href);
      if (url.pathname === "/")
        return response("", 302, { location: "/recipes/soup" });
      if (url.pathname === "/cover.png")
        return response(png, 200, { "content-type": "image/png" });
      return response(html, 200, {
        "content-type": "text/html; charset=utf-8",
      });
    });
    const result = await importRecipe("https://recipes.example", transport);
    expect(result.sourceUrl).toBe("https://recipes.example/recipes/soup");
    expect(result.draft.sourceUrl).toBe(result.sourceUrl);
    expect(result.image?.mimeType).toBe("image/png");
    expect(result.image?.bytes).toEqual(png);
    expect(result.warnings).toEqual([]);
    expect(requested).toEqual([
      "https://recipes.example/",
      "https://recipes.example/recipes/soup",
      "https://recipes.example/cover.png",
    ]);
  });

  test("keeps the draft and reports a blocked image URL", async () => {
    const badImage = html.replace("/cover.png", "http://127.0.0.1/image.png");
    const result = await importRecipe(
      "https://recipes.example",
      fakeTransport(() =>
        response(badImage, 200, { "content-type": "text/html" }),
      ),
    );
    expect(result.draft.title).toBe("Soup");
    expect(result.image).toBeNull();
    expect(result.warnings).toEqual(["image_blocked_url"]);
  });

  test("applies DNS and redirect guards to images", async () => {
    await errorCode(
      downloadRecipeImage(
        "https://images.example/x.png",
        fakeTransport(() =>
          response("", 302, { location: "http://[::1]/private" }),
        ),
      ),
      "blocked_url",
    );
    await errorCode(
      downloadRecipeImage(
        "https://images.example/x.png",
        fakeTransport(
          () => response(png),
          async () => [{ address: "192.168.0.1", family: 4 }],
        ),
      ),
      "blocked_url",
    );
  });

  test("rejects SVG, spoofed content types and oversized images", async () => {
    await errorCode(
      downloadRecipeImage(
        "https://images.example/x",
        fakeTransport(() =>
          response("<svg/>", 200, { "content-type": "image/svg+xml" }),
        ),
      ),
      "unsupported_content",
    );
    await errorCode(
      downloadRecipeImage(
        "https://images.example/x",
        fakeTransport(() =>
          response("<html>no</html>", 200, { "content-type": "image/png" }),
        ),
      ),
      "unsupported_content",
    );
    await errorCode(
      downloadRecipeImage(
        "https://images.example/x",
        fakeTransport(() =>
          response(png, 200, { "content-type": "image/jpeg" }),
        ),
      ),
      "unsupported_content",
    );
    await errorCode(
      downloadRecipeImage(
        "https://images.example/x",
        fakeTransport(() =>
          response("", 200, { "content-length": String(10 * 1024 * 1024 + 1) }),
        ),
      ),
      "response_too_large",
    );
  });

  test("rejects non HTML recipe responses", async () => {
    await errorCode(
      importRecipe(
        "https://recipes.example",
        fakeTransport(() =>
          response("{}", 200, { "content-type": "application/json" }),
        ),
      ),
      "unsupported_content",
    );
  });
});
