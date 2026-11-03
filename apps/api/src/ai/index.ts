import {
  AISDKError,
  generateText,
  type ModelMessage,
  NoObjectGeneratedError,
  Output,
} from "ai";
import type { z } from "zod";
import { type AiConfig, type AiFeature, readAiConfig } from "./config";
import { resolveModel } from "./provider";
import {
  type AiFailure,
  type AiUnavailableReason,
  type AiUsage,
  type AiUsageLogger,
  generationFailure,
  logAiUsage,
  tokenUsage,
} from "./usage";

export type { AiConfig, AiFeature, AiProvider } from "./config";
export { AiConfigurationError, aiFeatures, readAiConfig } from "./config";
export type {
  AiFailure,
  AiUnavailableReason,
  AiUsage,
  AiUsageEvent,
  AiUsageLogger,
} from "./usage";

export type AiCapability =
  | { readonly available: true; readonly model: string }
  | { readonly available: false; readonly reason: AiUnavailableReason };

export type AiResult<T> =
  | { readonly status: "success"; readonly value: T; readonly usage: AiUsage }
  | { readonly status: "unavailable"; readonly reason: AiUnavailableReason }
  | { readonly status: "error"; readonly failure: AiFailure };

export function createAi(
  config: AiConfig = readAiConfig(),
  logUsage: AiUsageLogger = logAiUsage,
) {
  function capability(feature: AiFeature): AiCapability {
    if (!config.enabled) return { available: false, reason: "disabled" };
    const settings = config.features[feature];
    if (!settings.enabled)
      return { available: false, reason: "feature-disabled" };
    if (config.provider !== "ollama" && !config.apiKey)
      return { available: false, reason: "missing-api-key" };
    if (!settings.model) return { available: false, reason: "missing-model" };
    return { available: true, model: settings.model };
  }

  async function generateStructured<T>(
    feature: AiFeature,
    schema: z.ZodType<T>,
    prompt: string | readonly ModelMessage[],
  ): Promise<AiResult<T>> {
    const started = performance.now();
    const callId = crypto.randomUUID();
    const available = capability(feature);
    const baseEvent = {
      event: "ai.generate",
      callId,
      feature,
      provider: config.provider,
      model: config.features[feature].model ?? null,
    } as const;
    if (!available.available) {
      logUsage({
        ...baseEvent,
        durationMs: performance.now() - started,
        status: "unavailable",
        usage: tokenUsage(),
        unavailableReason: available.reason,
      });
      return { status: "unavailable", reason: available.reason };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    let usage = tokenUsage();
    try {
      const generated = await generateText({
        model: resolveModel(config, available.model),
        output: Output.object({ schema }),
        prompt: typeof prompt === "string" ? prompt : [...prompt],
        maxRetries: config.maxRetries,
        abortSignal: controller.signal,
        experimental_include: { requestBody: false, responseBody: false },
      });
      usage = tokenUsage(generated.totalUsage);
      const value = generated.output;
      logUsage({
        ...baseEvent,
        durationMs: performance.now() - started,
        status: "success",
        usage,
      });
      return { status: "success", value, usage };
    } catch (error) {
      const failure = generationFailure(error, controller.signal.aborted);
      logUsage({
        ...baseEvent,
        durationMs: performance.now() - started,
        status: "error",
        usage: NoObjectGeneratedError.isInstance(error)
          ? tokenUsage(error.usage)
          : usage,
        failure,
      });
      if (
        error instanceof Error &&
        (AISDKError.isInstance(error) || controller.signal.aborted)
      ) {
        return { status: "error", failure };
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  return { capability, generateStructured } as const;
}

export const ai = createAi();
