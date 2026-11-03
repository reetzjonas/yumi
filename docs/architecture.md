# Architecture

Alpha snapshot. Rationale for each choice is in [decisions/](decisions/README.md).

## Overview

```
 PWA (React, Vite)  ── HTTP (Hono RPC) ──>  API (Hono on Bun)  ──>  PostgreSQL
   │  IndexedDB (Dexie): offline cache +         │  Better Auth (sessions, households)
   │  outbox of shopping events                  │  SSE: realtime list updates
   └─ Service worker (Workbox)                   └─ AI gateway (OpenRouter / direct / Ollama)
```

## Repository layout (planned)

```
apps/web        React PWA
apps/api        Hono API server
packages/shared Zod schemas, types, unit conversion, ingredient line parser
packages/db     Drizzle schema and migrations
deploy/helm    Helm chart (generic, cluster specifics in values)
docs/           this documentation
```

Bun workspaces; one TypeScript toolchain across all packages.

## Stack

| Concern  | Choice                                                       |
| -------- | ------------------------------------------------------------ |
| Language | TypeScript everywhere                                        |
| Frontend | React, Vite, TanStack Router + Query, Tailwind, shadcn/ui    |
| PWA      | vite-plugin-pwa (Workbox), Dexie (IndexedDB)                 |
| API      | Hono on Bun, Zod validation, Hono RPC client                 |
| DB       | PostgreSQL, Drizzle ORM, pg_trgm for fuzzy ingredient search |
| Auth     | Better Auth with organization plugin (= households)          |
| Realtime | Server-Sent Events per household                             |
| i18n     | Paraglide JS (de, en)                                        |
| AI       | Vercel AI SDK, provider configurable; default OpenRouter     |
| Deploy   | Container image on GHCR, generic Helm chart                  |

## Offline and sync

Only the shopping list is offline-writable in the first iterations. Changes are recorded as events
(`item_added`, `item_checked`, `item_unchecked`, `item_removed`, ...) in an IndexedDB outbox and
replayed to the API when online. The server applies them idempotently (client-generated event IDs)
and broadcasts the new state via SSE. The same event log feeds the learned store order
([concepts/shopping-order.md](concepts/shopping-order.md)).

Recipes and the meal queue are cached for offline reading; editing them offline is out of scope for now.

## AI

All AI calls go through one server-side module with structured output (Zod schemas). Uses:
recipe extraction, ingredient line fallback parsing, ingredient creation (category, translation, units),
photo-to-recipe. Provider, model, and API key are server config; every feature degrades gracefully when
AI is disabled.

## Deployment

- GitHub Actions checks PRs and pushes to `main`. A multi-stage Docker build packages web assets
  and API together; production static serving and SPA fallback live in `apps/api/src/index.ts`.
  `main` builds publish `ghcr.io/reetzjonas/yumi` with the commit SHA and `latest`.
- `deploy/helm/yumi` deploys one app replica (`Recreate`), an init container running the Drizzle
  migrations, and optionally a bundled PostgreSQL 18 StatefulSet. Containers run as non-root with
  read-only root filesystems. Exposure, storage, secrets and network policies are values.
- Details, values and the HTTPS requirement for the PWA: [deployment.md](deployment.md).
