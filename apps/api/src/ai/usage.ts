import {
  APICallError,
  type LanguageModelUsage,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  RetryError,
} from "ai";
import type { AiFeature, AiProvider } from "./config";

export type AiUsage = {
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly totalTokens: number | null;
};

export type AiFailure = {
  readonly reason: "timeout" | "invalid-output" | "provider-error";
  readonly statusCode: number | null;
  readonly retryable: boolean;
  readonly retriesExhausted: boolean;
};

export type AiUsageEvent = {
  readonly event: "ai.generate";
  readonly callId: string;
  readonly feature: AiFeature;
  readonly provider: AiProvider;
  readonly model: string | null;
  readonly durationMs: number;
  readonly status: "success" | "unavailable" | "error";
  readonly usage: AiUsage;
  readonly failure?: AiFailure;
  readonly unavailableReason?: AiUnavailableReason;
};

export type AiUnavailableReason =
  | "disabled"
  | "feature-disabled"
  | "missing-api-key"
  | "missing-model";

export type AiUsageLogger = (event: AiUsageEvent) => void;

export function tokenUsage(usage?: LanguageModelUsage): AiUsage {
  return {
    inputTokens: usage?.inputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
    totalTokens: usage?.totalTokens ?? null,
  };
}

export function generationFailure(
  error: unknown,
  timedOut: boolean,
): AiFailure {
  const cause = RetryError.isInstance(error) ? error.lastError : error;
  return {
    reason: timedOut
      ? "timeout"
      : NoObjectGeneratedError.isInstance(error) ||
          NoOutputGeneratedError.isInstance(error)
        ? "invalid-output"
        : "provider-error",
    statusCode: APICallError.isInstance(cause)
      ? (cause.statusCode ?? null)
      : null,
    retryable:
      timedOut || (APICallError.isInstance(cause) && cause.isRetryable),
    retriesExhausted:
      RetryError.isInstance(error) && error.reason === "maxRetriesExceeded",
  };
}

export const logAiUsage: AiUsageLogger = (event) => {
  const line = JSON.stringify(event);
  if (event.status === "error") console.warn(line);
  else console.info(line);
};
