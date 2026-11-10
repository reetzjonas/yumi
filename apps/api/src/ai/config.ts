import { z } from "zod";

export const aiFeatures = [
  "recipe-import",
  "ingredient-parse",
  "ingredient-create",
  "meal-plan",
] as const;
export type AiFeature = (typeof aiFeatures)[number];
export type AiProvider = "openrouter" | "openai" | "anthropic" | "ollama";

const flag = z.enum(["true", "false"]).transform((value) => value === "true");
const optionalText = z
  .string()
  .trim()
  .transform((value) => value || undefined)
  .optional();
const envSchema = z.object({
  AI_ENABLED: flag.default(false),
  AI_PROVIDER: z
    .enum(["openrouter", "openai", "anthropic", "ollama"])
    .default("openrouter"),
  AI_MODEL: optionalText,
  AI_BASE_URL: z.url().optional(),
  AI_RECIPE_IMPORT_ENABLED: flag.default(true),
  AI_RECIPE_IMPORT_MODEL: optionalText,
  AI_INGREDIENT_PARSE_ENABLED: flag.default(true),
  AI_INGREDIENT_PARSE_MODEL: optionalText,
  AI_INGREDIENT_CREATE_ENABLED: flag.default(true),
  AI_INGREDIENT_CREATE_MODEL: optionalText,
  AI_MEAL_PLAN_ENABLED: flag.default(true),
  AI_MEAL_PLAN_MODEL: optionalText,
  AI_TIMEOUT_MS: z.coerce.number().int().min(1).max(300_000).default(30_000),
  AI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  OPENROUTER_API_KEY: optionalText,
  OPENAI_API_KEY: optionalText,
  ANTHROPIC_API_KEY: optionalText,
  OLLAMA_BASE_URL: z.url().default("http://localhost:11434/v1"),
});

export type AiConfig = {
  readonly enabled: boolean;
  readonly provider: AiProvider;
  readonly apiKey: string | undefined;
  readonly baseURL: string | undefined;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly features: Readonly<
    Record<
      AiFeature,
      { readonly enabled: boolean; readonly model: string | undefined }
    >
  >;
};

export class AiConfigurationError extends Error {
  override readonly name = "AiConfigurationError";

  constructor(readonly fields: readonly string[]) {
    super(`Invalid AI environment settings: ${fields.join(", ")}`);
  }
}

export function readAiConfig(
  source: Readonly<Record<string, string | undefined>> = process.env,
): AiConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new AiConfigurationError(
      parsed.error.issues.map((issue) => issue.path.join(".")),
    );
  }
  const env = parsed.data;
  const keys = {
    openrouter: env.OPENROUTER_API_KEY,
    openai: env.OPENAI_API_KEY,
    anthropic: env.ANTHROPIC_API_KEY,
    ollama: undefined,
  } as const;
  return {
    enabled: env.AI_ENABLED,
    provider: env.AI_PROVIDER,
    apiKey: keys[env.AI_PROVIDER],
    baseURL:
      env.AI_BASE_URL ??
      (env.AI_PROVIDER === "ollama" ? env.OLLAMA_BASE_URL : undefined),
    timeoutMs: env.AI_TIMEOUT_MS,
    maxRetries: env.AI_MAX_RETRIES,
    features: {
      "recipe-import": {
        enabled: env.AI_RECIPE_IMPORT_ENABLED,
        model: env.AI_RECIPE_IMPORT_MODEL ?? env.AI_MODEL,
      },
      "ingredient-parse": {
        enabled: env.AI_INGREDIENT_PARSE_ENABLED,
        model: env.AI_INGREDIENT_PARSE_MODEL ?? env.AI_MODEL,
      },
      "ingredient-create": {
        enabled: env.AI_INGREDIENT_CREATE_ENABLED,
        model: env.AI_INGREDIENT_CREATE_MODEL ?? env.AI_MODEL,
      },
      "meal-plan": {
        enabled: env.AI_MEAL_PLAN_ENABLED,
        model: env.AI_MEAL_PLAN_MODEL ?? env.AI_MODEL,
      },
    },
  };
}
