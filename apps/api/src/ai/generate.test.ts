import { describe, expect, spyOn, test } from "bun:test";
import { z } from "zod";
import { type AiProvider, createAi } from ".";
import { aiServer, completion } from "./test-server";

const schema = z.object({ name: z.string() });

describe("structured AI generation", () => {
  const providers: readonly AiProvider[] = [
    "openrouter",
    "openai",
    "anthropic",
    "ollama",
  ];

  test.each(providers)(
    "validates structured output with the real %s SDK",
    async (provider) => {
      const server = aiServer(provider);

      const result = await server.client.generateStructured(
        "recipe-import",
        schema,
        "private-prompt",
      );

      expect(result).toEqual({
        status: "success",
        value: {
          name: provider === "anthropic" ? "claude-sonnet-4-5" : "test-model",
        },
        usage: { inputTokens: 8, outputTokens: 3, totalTokens: 11 },
      });
      expect(server.events).toMatchObject([
        {
          event: "ai.generate",
          feature: "recipe-import",
          provider,
          status: "success",
          usage: { inputTokens: 8, outputTokens: 3, totalTokens: 11 },
        },
      ]);
    },
  );

  test.each(["not JSON", '{"name":123}'])(
    "rejects invalid model output %s and retains usage",
    async (text) => {
      const server = aiServer("ollama", ({ model }) =>
        completion("ollama", model, text),
      );

      const result = await server.client.generateStructured(
        "ingredient-parse",
        schema,
        "private-prompt",
      );

      expect(result).toMatchObject({
        status: "error",
        failure: { reason: "invalid-output", retryable: false },
      });
      expect(server.events).toMatchObject([
        {
          status: "error",
          usage: { inputTokens: 8, outputTokens: 3, totalTokens: 11 },
          failure: { reason: "invalid-output" },
        },
      ]);
    },
  );

  test("retries a transient provider error before returning structured output", async () => {
    const server = aiServer("openai", ({ attempt, model }) =>
      attempt === 1
        ? Response.json(
            { error: { message: "busy", type: "server_error" } },
            { status: 503 },
          )
        : completion("openai", model),
    );
    const client = createAi({ ...server.config, maxRetries: 1 }, (event) =>
      server.events.push(event),
    );

    const result = await client.generateStructured(
      "ingredient-create",
      schema,
      "food",
    );

    expect(result).toMatchObject({
      status: "success",
      value: { name: "test-model" },
    });
    expect(server.requests()).toBe(2);
    expect(server.events).toHaveLength(1);
  });

  test.each([
    { status: 429, retries: 1, requests: 2, retryable: true, exhausted: true },
    {
      status: 401,
      retries: 2,
      requests: 1,
      retryable: false,
      exhausted: false,
    },
    { status: 503, retries: 0, requests: 1, retryable: true, exhausted: false },
  ])("bounds retries and redacts provider failure $status", async (entry) => {
    const server = aiServer("openrouter", () =>
      Response.json(
        {
          error: {
            message: "private-prompt private-test-key",
            code: entry.status,
          },
        },
        { status: entry.status },
      ),
    );
    const client = createAi(
      { ...server.config, maxRetries: entry.retries },
      (event) => server.events.push(event),
    );

    const result = await client.generateStructured(
      "recipe-import",
      schema,
      "private-prompt",
    );

    expect(result).toEqual({
      status: "error",
      failure: {
        reason: "provider-error",
        statusCode: entry.status,
        retryable: entry.retryable,
        retriesExhausted: entry.exhausted,
      },
    });
    expect(server.requests()).toBe(entry.requests);
    expect(server.events).toMatchObject([
      { status: "error", failure: { statusCode: entry.status } },
    ]);
    expect(JSON.stringify([result, server.events])).not.toMatch(
      /private-prompt|private-test-key/,
    );
  });

  test("aborts an unfinished provider response within the total call budget", async () => {
    const server = aiServer(
      "ollama",
      () =>
        new Response(new ReadableStream(), {
          headers: { "content-type": "application/json" },
        }),
    );
    const client = createAi(
      { ...server.config, timeoutMs: 50, maxRetries: 2 },
      (event) => server.events.push(event),
    );

    const result = await client.generateStructured(
      "ingredient-parse",
      schema,
      "food",
    );

    expect(result).toMatchObject({
      status: "error",
      failure: { reason: "timeout", retryable: true },
    });
    expect(server.requests()).toBe(1);
    expect(server.events).toMatchObject([
      { status: "error", failure: { reason: "timeout" } },
    ]);
  });

  test("writes a sanitized structured JSON event through the default logger", async () => {
    const server = aiServer();
    const log = spyOn(console, "info").mockImplementation(() => {});
    try {
      const client = createAi(server.config);

      await client.generateStructured(
        "ingredient-create",
        schema,
        "private-prompt",
      );

      expect(log).toHaveBeenCalledTimes(1);
      const event = z.string().parse(log.mock.calls[0]?.[0]);
      expect(JSON.parse(event)).toMatchObject({
        event: "ai.generate",
        status: "success",
        feature: "ingredient-create",
        callId: expect.any(String),
        durationMs: expect.any(Number),
        usage: { totalTokens: 11 },
      });
      expect(event).not.toMatch(/private-prompt|private-test-key/);
    } finally {
      log.mockRestore();
    }
  });
});
