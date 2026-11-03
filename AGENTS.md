# AGENTS.md

Guidance for coding agents (and humans) working on yumi. Keep this file short; it is read every session.

## Ground rules

- **Alpha phase**: every decision is provisional. Any ADR, concept, or issue may be challenged and replaced when there is a good reason. When you overturn a decision, mark the old ADR `Superseded by NNNN` instead of deleting it.
- **English everywhere** in code, DB, API, commits, issues, and docs. The app UI ships German and English (i18n).
- **Work is tracked in GitHub issues** (`reetzjonas/yumi`), grouped by milestones and `area:*` labels. Do not keep TODO lists in docs; link issues instead.
- Communicate with the owner in German.

## Setup and checks

- `bun install` also installs the git hooks (lefthook). Pre-commit runs Biome (format + lint) on staged files.
- `bun run lint` checks everything, `bun run format` fixes. Never bypass hooks with `--no-verify`.

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
