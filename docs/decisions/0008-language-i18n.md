# 0008: English for code and docs, German and English UI

- Status: Accepted (alpha)
- Date: 2026-11-03

## Context

Owner wants everything in English, but the app must be usable in German.

## Decision

Code, DB, API, docs, issues, commits in English. UI strings via Paraglide JS in `de` and `en`. Catalog data (ingredients, categories) stores both names. User content (recipes) is not translated.

## Consequences

Every UI string needs both locales from the start.
