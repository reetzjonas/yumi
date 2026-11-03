# 0009: Biome and lefthook for formatting, linting, git hooks

- Status: Accepted (alpha)
- Date: 2026-11-03

## Context

Consistent formatting and linting from the first commit, enforced locally before commit.

## Decision

Biome as formatter and linter (TS, JS, JSON, CSS). lefthook runs Biome on staged files at pre-commit; typecheck and tests join the hooks once code exists. CI runs the same checks.

## Consequences

One fast tool instead of ESLint + Prettier. Biome does not format Markdown/YAML; acceptable for now.
