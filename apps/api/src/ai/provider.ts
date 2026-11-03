import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import type { AiConfig } from "./config";

export function resolveModel(config: AiConfig, model: string): LanguageModel {
  switch (config.provider) {
    case "openrouter":
      return createOpenRouter({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        compatibility: "strict",
      }).chat(model, { usage: { include: true } });
    case "openai":
      return createOpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
      }).chat(model);
    case "anthropic":
      return createAnthropic({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
      })(model);
    case "ollama":
      return createOpenAI({
        name: "ollama",
        apiKey: "ollama",
        baseURL: config.baseURL,
      }).chat(model);
    default: {
      const exhaustive: never = config.provider;
      return exhaustive;
    }
  }
}
