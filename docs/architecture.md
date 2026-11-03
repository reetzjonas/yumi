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
deploy/         Kubernetes manifests (kustomize)
docs/           this documentation
```

Bun workspaces; one TypeScript toolchain across all packages.

## Stack

| Concern  | Choice                                                                 |
| -------- | ---------------------------------------------------------------------- |
| Language | TypeScript everywhere                                                  |
| Frontend | React, Vite, TanStack Router + Query, Tailwind, shadcn/ui              |
| PWA      | vite-plugin-pwa (Workbox), Dexie (IndexedDB)                           |
| API      | Hono on Bun, Zod validation, Hono RPC client                           |
| DB       | PostgreSQL, Drizzle ORM, pg_trgm for fuzzy ingredient search           |
| Auth     | Better Auth with organization plugin (= households)                    |
| Realtime | Server-Sent Events per household                                       |
| i18n     | Paraglide JS (de, en)                                                  |
| AI       | Vercel AI SDK, provider configurable; default OpenRouter               |
| Deploy   | Container images on GHCR, kustomize manifests for the home k3s cluster |

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

- GitHub Actions checks PRs and pushes to `main` with Bun 1.4.2. A multi-stage Docker build
  packages the web assets and API together; production static serving and SPA fallback live in
  `apps/api/src/index.ts`. Successful `main` builds publish `ghcr.io/reetzjonas/yumi` with the
  full commit SHA and `latest` tags.
- `deploy/k8s/base` and `overlays/home` define namespace `yumi`, a single app replica,
  PostgreSQL 18 on a 10 GiB `local-path` PVC, Vault External Secrets and default-deny networking.
  CloudNativePG is not installed. App, migration and DB containers run without root,
  capabilities or a writable root filesystem; Postgres has writable data, socket and temp volumes.
- The app's init container runs `bun packages/db/src/migrate.ts` from the same image before the
  server starts. `Recreate` prevents overlapping migration runners during upgrades and causes
  brief downtime. Keep one replica. Images include generated `packages/db/migrations`.
- The home overlay exposes the ClusterIP service through an HTTPRoute on the existing
  `homelab/traefik-gateway` LAN/VPN listener, like rpg's internal path. It has no Ingress,
  new certificate resources or public VPS gateway attachment. `yumi.reetz.me` is inferred
  from rpg's domain; internal DNS must point it at the LAN/VPN gateway.
- `BETTER_AUTH_URL` comes from `yumi-config`. Keel polls the GHCR `latest` tag hourly and
  automatically recreates the app on image changes, matching existing cluster annotations.
  SHA tags remain available for pinned releases with Keel removed.
- PostgreSQL backups are not automated by these manifests. A PVC is node-local storage,
  not a backup. See [deployment.md](deployment.md) for prerequisites, secrets and rollout.
