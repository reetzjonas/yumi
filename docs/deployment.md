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

## Cluster-specific configuration

Keep values for a concrete cluster outside this repository (your infra repo, or the
git-ignored `deploy/local/` directory). Example: `helm upgrade --install yumi deploy/helm/yumi
-n yumi -f deploy/local/home.values.yaml`.

## HTTPS is required for the PWA

Service workers (installation, offline shopping mode) only run in a secure context: HTTPS or
`localhost`. Serve yumi via HTTPS even for LAN/VPN-only setups, e.g. a wildcard certificate on
your gateway, Tailscale HTTPS (`tailscale serve`), or an internal CA trusted by all clients.

## Operations

- Migrations and the global ingredient catalog seed (idempotent upsert) run in the app's init
  container on every start. One replica with `Recreate`
  prevents concurrent migration runs; upgrades have a short downtime.
- `/api/health` serves the startup, readiness and liveness probes (process only, no DB check yet).
- Rollback: deploy the previous image tag. Migrations are not rolled back.
- Backups are not part of the chart: back up the PostgreSQL volume or use `pg_dump` (see #36).

## Build

CI runs install, lint, typecheck, tests (with a PostgreSQL service), web build, `helm lint`
and a Docker build on PRs and `main`. Only `main` publishes `ghcr.io/reetzjonas/yumi` with
the full commit SHA and `latest`. The image runs as UID/GID 1000 on port 3000.
