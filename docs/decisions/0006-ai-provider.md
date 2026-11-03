# 0006: AI via OpenRouter by default, provider-agnostic

- Status: Accepted (alpha)
- Date: 2026-11-03

## Context

Owner has ChatGPT and Claude subscriptions and an OpenRouter account. Consumer chat subscriptions do not include API access, so they cannot back app features.

## Decision

One server-side AI module on the Vercel AI SDK with Zod structured output. Default provider OpenRouter (one key, any model); direct OpenAI/Anthropic and local Ollama are config options. Every AI feature has a non-AI fallback.

## Consequences

Model per feature can be tuned (cheap model for ingredient parsing, vision model for photos). Costs are visible in OpenRouter.
