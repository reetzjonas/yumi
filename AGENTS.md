# AGENTS.md

Guidance for coding agents (and humans) working on yumi. Keep this file short; it is read every session.

## Ground rules

- **Alpha phase**: every decision is provisional. Any ADR, concept, or issue may be challenged and replaced when there is a good reason. When you overturn a decision, mark the old ADR `Superseded by NNNN` instead of deleting it.
- **English everywhere** in code, DB, API, commits, issues, and docs. The app UI ships German and English (i18n).
- UI messages live in `apps/web/messages/{de,en}.json`; every UI string needs both de and en.
- **Work is tracked in GitHub issues** (`reetzjonas/yumi`), grouped by milestones and `area:*` labels. Do not keep TODO lists in docs; link issues instead.
- Communicate with the owner in German.

## Setup and checks

- `bun install` also installs the git hooks (lefthook). Pre-commit runs Biome (format + lint) on staged files and the typecheck.
- `bun run db:up` starts local PostgreSQL (docker compose, port 55433); copy `.env.example` to `.env`.
- `bun run dev` starts API (port 3000) and web (Vite, port 5173, proxies `/api`).
- API integration tests need the local PostgreSQL (`bun run db:up`); each test file creates and drops its own `yumi_test_*` database (`apps/api/src/test/setup-db.ts`).
- Schema change: edit `packages/db/src/schema`, then `bun run db:generate` and `bun run db:migrate`. Never edit a migration that is on `main`.
- API scoping: household data routes use `requireAuth` + `requireHousehold` (`apps/api/src/context.ts`) and filter every query by `c.get("householdId")`.
- `bun run check` = lint + typecheck + tests. `bun run format` fixes formatting. Never bypass hooks with `--no-verify`.
- Layout: `apps/web` (React PWA), `apps/api` (Hono, exports `AppType` for the typed client), `packages/shared` (Zod schemas, pure logic), `packages/db` (Drizzle schema, migrations).

## Workflow

- One GitHub issue per unit of work. In the main checkout commit directly on `main` with `Closes #n` and push.
- Deploying to the cluster requires the owner's explicit go-ahead.

## Where things live

Read only what the task needs; do not load all docs up front.

| Need                               | File                                                             |
| ---------------------------------- | ---------------------------------------------------------------- |
| What the product is, feature scope | `docs/product.md`                                                |
| System overview, stack, deployment | `docs/architecture.md`                                           |
| Data model sketch                  | `docs/data-model.md`                                             |
| Why a choice was made              | `docs/decisions/NNNN-*.md` (index in `docs/decisions/README.md`) |
| Deep dive on a tricky mechanism    | `docs/concepts/*.md`                                             |
| Open work, priorities              | GitHub milestones and issues                                     |

## Notes hygiene

- New decision -> new ADR (copy `docs/decisions/template.md`), add it to the index.
- New mechanism worth explaining -> `docs/concepts/<topic>.md`, one topic per file, under ~150 lines.
- Session notes, scratch findings: put them in the relevant issue as a comment, not in the repo.
- Delete or rewrite docs that are no longer true. Stale docs are worse than none.
