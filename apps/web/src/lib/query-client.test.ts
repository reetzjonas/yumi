import { afterEach, expect, test } from "bun:test";
import { ensureOk } from "./api-error";
import { queryClient } from "./query-client";

afterEach(() => queryClient.clear());

test.each([400, 401, 403, 404, 409, 422, 429])(
  "HTTP %i query failures are returned without retrying",
  async (status) => {
    let attempts = 0;
    const result = queryClient.fetchQuery({
      queryKey: ["http-error", status],
      retryDelay: 0,
      queryFn: () => {
        attempts++;
        return ensureOk(Response.json({ error: "not_found" }, { status }));
      },
    });

    await expect(result).rejects.toMatchObject({
      code: "not_found",
      status,
    });
    expect(attempts).toBe(1);
  },
);

test.each([500, 503, "network"] as const)(
  "%s query failures retain three retries",
  async (failure) => {
    let attempts = 0;
    const result = queryClient.fetchQuery({
      queryKey: ["transient-error", failure],
      retryDelay: 0,
      queryFn: async () => {
        attempts++;
        if (failure === "network") throw new TypeError("Failed to fetch");
        return ensureOk(
          Response.json({ error: "internal_error" }, { status: failure }),
        );
      },
    });

    await expect(result).rejects.toBeInstanceOf(Error);
    expect(attempts).toBe(4);
  },
);
