# 0003: PostgreSQL with Drizzle ORM

- Status: Accepted (alpha)
- Date: 2026-11-03

## Context

The domain is relational (households, recipes, ingredients, lists) with some flexible fields. Fuzzy ingredient search is needed.

## Decision

PostgreSQL with Drizzle ORM and drizzle-kit migrations; `pg_trgm` for fuzzy search; JSONB for flexible fields.

## Consequences

Runs well on the home cluster; Drizzle keeps schema in TypeScript and shares types with the API.
