# 0001: TypeScript monorepo with Bun workspaces

- Status: Accepted (alpha)
- Date: 2026-11-03

## Context

One language for web, API, and shared logic (unit conversion, ingredient parser, Zod schemas) avoids duplicated types and logic.

## Decision

Use TypeScript everywhere in a single repo with Bun workspaces (`apps/*`, `packages/*`). Bun is package manager, runtime for the API, and test runner.

## Consequences

Shared code is imported directly. Bun runtime quirks are possible; switching the API to Node is cheap because Hono runs on both.
