import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  type AiConfig,
  AiConfigurationError,
  type AiFeature,
  type AiUnavailableReason,
  aiFeatures,
  createAi,
  readAiConfig,
} from ".";
import { aiServer } from "./test-server";

describe("AI availability", () => {
  test("starts without AI settings or keys and reports an explicit fallback", async () => {
    const client = createAi(readAiConfig({}), () => {});

    const result = await client.generateStructured(
      "recipe-import",
      z.object({ name: z.string() }),
      "a recipe",
    );

    expect(result).toEqual({ status: "unavailable", reason: "disabled" });
  });

  const cases: readonly {
    readonly name: string;
    readonly change: (config: AiConfig) => AiConfig;
    readonly reason: AiUnavailableReason;
    readonly feature: AiFeature;
  }[] = [
    {
      name: "globally disabled",
      change: (config) => ({ ...config, enabled: false }),
      reason: "disabled",
      feature: "recipe-import",
    },
    {
      name: "feature disabled",
      change: (config) => ({
        ...config,
        features: {
          ...config.features,
          "ingredient-parse": { enabled: false, model: "test-model" },
        },
      }),
      reason: "feature-disabled",
      feature: "ingredient-parse",
    },
    {
      name: "missing provider key",
      change: (config) => ({
        ...config,
        provider: "openrouter",
        apiKey: undefined,
      }),
      reason: "missing-api-key",
      feature: "ingredient-create",
    },
    {
      name: "missing model",
      change: (config) => ({
        ...config,
        features: {
          ...config.features,
          "recipe-import": { enabled: true, model: undefined },
        },
      }),
      reason: "missing-model",
      feature: "recipe-import",
    },
  ];

  test.each(cases)("makes no HTTP call when $name", async (entry) => {
    const server = aiServer();
    const client = createAi(entry.change(server.config), (event) =>
      server.events.push(event),
    );

    const result = await client.generateStructured(
      entry.feature,
      z.object({ name: z.string() }),
      "private-prompt",
    );

    expect(result).toEqual({ status: "unavailable", reason: entry.reason });
    expect(client.capability(entry.feature)).toEqual({
      available: false,
      reason: entry.reason,
    });
    expect(server.requests()).toBe(0);
    expect(server.events).toMatchObject([
      { status: "unavailable", unavailableReason: entry.reason },
    ]);
  });

  test("uses feature models before the shared model", async () => {
    const server = aiServer();
    const client = createAi(
      readAiConfig({
        AI_ENABLED: "true",
        AI_PROVIDER: "ollama",
        OLLAMA_BASE_URL: server.config.baseURL,
        AI_MODEL: "shared-model",
        AI_RECIPE_IMPORT_MODEL: "vision-model",
        AI_INGREDIENT_PARSE_MODEL: "batch-model",
      }),
      (event) => server.events.push(event),
    );

    const results = await Promise.all(
      aiFeatures.map((feature) =>
        client.generateStructured(
          feature,
          z.object({ name: z.string() }),
          "food",
        ),
      ),
    );

    expect(results).toEqual(
      ["vision-model", "batch-model", "shared-model"].map((name) => ({
        status: "success",
        value: { name },
        usage: { inputTokens: 8, outputTokens: 3, totalTokens: 11 },
      })),
    );
  });

  test.each([
    { AI_ENABLED: "yes" },
    { AI_PROVIDER: "unknown" },
    { AI_TIMEOUT_MS: "0" },
    { AI_MAX_RETRIES: "6" },
    { AI_BASE_URL: "invalid-url" },
  ])("rejects invalid environment settings without copying values", (env) => {
    expect(() => readAiConfig(env)).toThrow(AiConfigurationError);
  });

  test("reads provider keys, flags and operational limits from server environment", () => {
    const config = readAiConfig({
      AI_ENABLED: "true",
      AI_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "selected-key",
      OPENROUTER_API_KEY: "other-key",
      AI_INGREDIENT_CREATE_ENABLED: "false",
      AI_TIMEOUT_MS: "1250",
      AI_MAX_RETRIES: "1",
    });

    expect(config).toMatchObject({
      enabled: true,
      provider: "anthropic",
      apiKey: "selected-key",
      timeoutMs: 1250,
      maxRetries: 1,
      features: { "ingredient-create": { enabled: false } },
    });
    expect(readAiConfig({}).provider).toBe("openrouter");
  });
});
