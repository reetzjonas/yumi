# Deployment

yumi ships as one container image (API + built web app) and a Helm chart in
`deploy/helm/yumi`. The chart makes no assumptions about the cluster: storage class,
exposure (Ingress or Gateway API), secrets source and network policies are all values.

## Quick start

```sh
helm upgrade --install yumi deploy/helm/yumi -n yumi --create-namespace \
  --set baseUrl=https://yumi.example.com \
  --set ingress.enabled=true --set ingress.className=nginx \
  --set 'ingress.hosts[0].host=yumi.example.com' \
  --set 'ingress.hosts[0].paths[0].path=/' --set 'ingress.hosts[0].paths[0].pathType=Prefix'
```

This runs the app plus a bundled PostgreSQL 18 StatefulSet on the default StorageClass and
generates `BETTER_AUTH_SECRET` and the database password into Secret `<release>-yumi`
(`yumi` for release name `yumi`). The Secret is kept across upgrades and on uninstall.
All options are documented in [values.yaml](../deploy/helm/yumi/values.yaml).

## Key values

| Value                                 | Purpose                                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `baseUrl`                             | Required. Browser origin; must match how users open the app (auth cookies, CSRF).                |
| `image.tag`                           | Image tag; prefer a full commit SHA from GHCR. `latest` tracks `main`.                           |
| `secrets.existingSecret`              | Bring your own Secret with `DATABASE_URL` and `BETTER_AUTH_SECRET` (e.g. from External Secrets). |
| `postgresql.enabled`                  | Bundled PostgreSQL. Set `false` and `database.url` for an external server.                       |
| `postgresql.auth.existingSecret`      | Secret with `POSTGRES_PASSWORD`; required together with `secrets.existingSecret`.                |
| `postgresql.persistence.storageClass` | Empty = cluster default.                                                                         |
| `ingress.*` / `httpRoute.*`           | Optional exposure via Ingress or Gateway API.                                                    |
| `networkPolicy.enabled`               | Restrict traffic; list your ingress controller under `ingressFrom`.                              |
| `extraEnv`, `extraEnvFrom`            | Additional configuration, e.g. AI provider keys.                                                 |
| `deploymentAnnotations`               | E.g. image updater annotations (Keel, Argo CD Image Updater).                                    |
| `extraObjects`                        | Any extra manifests, e.g. `ExternalSecret` resources.                                            |

With your own Secret and the bundled database, `DATABASE_URL` must point at
`<release>-yumi-postgresql` (`yumi-postgresql` for release `yumi`), e.g.
`postgres://yumi:<url-encoded-password>@yumi-postgresql:5432/yumi`.

## Optional AI

AI settings are server environment variables (ADR [0006](decisions/0006-ai-provider.md)).
The application requires neither an AI account nor an API key. AI is off by default;
its callers must keep their manual or deterministic workflow when the module reports
`unavailable` or `error`. There are no browser settings containing provider credentials.
Use `extraEnv` for configuration and `extraEnvFrom` with a Kubernetes Secret for keys.

| Variable                       | Default                     | Purpose                                                                                                                |
| ------------------------------ | --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `AI_ENABLED`                   | `false`                     | Enable AI calls; flags accept exactly `true` or `false`.                                                               |
| `AI_PROVIDER`                  | `openrouter`                | `openrouter`, `openai`, `anthropic`, or `ollama`.                                                                      |
| `AI_MODEL`                     | unset                       | Shared model identifier; no paid model is selected automatically.                                                      |
| `OPENROUTER_API_KEY`           | unset                       | Required for OpenRouter.                                                                                               |
| `OPENAI_API_KEY`               | unset                       | Required for direct OpenAI.                                                                                            |
| `ANTHROPIC_API_KEY`            | unset                       | Required for direct Anthropic.                                                                                         |
| `OLLAMA_BASE_URL`              | `http://localhost:11434/v1` | OpenAI-compatible Ollama endpoint, including `/v1`; no key required.                                                   |
| `AI_BASE_URL`                  | provider default            | Optional endpoint override for the selected provider, including its API path. Takes precedence over `OLLAMA_BASE_URL`. |
| `AI_TIMEOUT_MS`                | `30000`                     | Total call budget including retries (1 to 300000 ms).                                                                  |
| `AI_MAX_RETRIES`               | `2`                         | SDK retries for transient failures (0 to 5); authentication and validation errors are not retried.                     |
| `AI_RECIPE_IMPORT_ENABLED`     | `true`                      | Enable `recipe-import` when AI is globally enabled.                                                                    |
| `AI_INGREDIENT_PARSE_ENABLED`  | `true`                      | Enable `ingredient-parse` when AI is globally enabled.                                                                 |
| `AI_INGREDIENT_CREATE_ENABLED` | `true`                      | Enable `ingredient-create` when AI is globally enabled.                                                                |
| `AI_MEAL_PLAN_ENABLED`         | `true`                      | Enable `meal-plan` (week suggestion) when AI is globally enabled.                                                      |
| `AI_RECIPE_IMPORT_MODEL`       | `AI_MODEL`                  | Model override for recipe extraction; select a vision-capable model for photos.                                        |
| `AI_INGREDIENT_PARSE_MODEL`    | `AI_MODEL`                  | Model override for batched ingredient parsing.                                                                         |
| `AI_INGREDIENT_CREATE_MODEL`   | `AI_MODEL`                  | Model override for ingredient proposals.                                                                               |
| `AI_MEAL_PLAN_MODEL`           | `AI_MODEL`                  | Model override for the week suggestion.                                                                                |

Set `AI_ENABLED=true`, a model, and the selected provider's key to enable a hosted
provider. For local inference set `AI_PROVIDER=ollama`, choose an installed model
in `AI_MODEL`, and point `OLLAMA_BASE_URL` at the reachable Ollama service. In a
container, `localhost` refers to that container. Models must support structured JSON
output; availability checks confirm local configuration, not remote model support.
Missing keys or models produce an explicit unavailable result without a network call.
Invalid configuration raises `AiConfigurationError`, listing field names only.
Settings are read when the server module loads; restart after changing them.

Server callers import `ai` from `apps/api/src/ai` and use
`ai.capability(feature)` or `ai.generateStructured(feature, zodSchema, prompt)`.
Features are `recipe-import`, `ingredient-parse`, and `ingredient-create`.
Prompts can be text or SDK model messages, including image parts. Results discriminate
on `status`: `success` carries `value` and token `usage`, `unavailable` carries a
reason, and `error` carries safe failure metadata. Unexpected programming errors are
logged and rethrown. `createAi(readAiConfig(env), usageLogger)` creates an independent
instance with a custom structured event sink.

Each generation writes one JSON usage event with call ID, feature, provider, model,
duration, status and token counts when known. Failed calls retain HTTP status,
retryability, retry exhaustion and timeout/invalid-output classification, including
token usage for rejected structured output when the provider supplied it. Counts
are `null` when unknown; retries are governed by the SDK within the total budget.
Prompts, model output, keys, endpoint URLs and raw provider error bodies are excluded.
OpenRouter also receives usage accounting requests, so costs remain visible in its
dashboard; no local cost estimate is invented.

## Cluster-specific configuration

Keep values for a concrete cluster outside this repository (your infra repo, or the
git-ignored `deploy/local/` directory). Example: `helm upgrade --install yumi deploy/helm/yumi
-n yumi -f deploy/local/home.values.yaml`.

## HTTPS is required for the PWA

Service workers (installation, offline shopping list) only run in a secure context: HTTPS or
`localhost`. Serve yumi via HTTPS even for LAN/VPN-only setups, e.g. a wildcard certificate on
your gateway, Tailscale HTTPS (`tailscale serve`), or an internal CA trusted by all clients.

## Operations

- Migrations and the global ingredient catalog seed (idempotent upsert) run in the app's init
  container on every start. One replica with `Recreate`
  prevents concurrent migration runs; upgrades have a short downtime.
- `/api/health` serves the startup, readiness and liveness probes (process only, no DB check yet).
- Rollback: deploy the previous image tag. Migrations are not rolled back.
- Scheduled off-cluster PostgreSQL backups are opt-in via `backup.enabled`.
  See [Backups and restore](backups.md) for S3 credentials, retention, network
  access, monitoring and the tested restore procedure.

## Build

CI runs install, lint, typecheck, tests (with a PostgreSQL service), web build, `helm lint`
and a Docker build on PRs and `main`. Only `main` publishes `ghcr.io/reetzjonas/yumi` with
the full commit SHA and `latest`. The image runs as UID/GID 1000 on port 3000.
