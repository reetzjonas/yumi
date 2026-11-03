# Deployment

## Prerequisites

- k3s with `local-path` storage, Gateway API and the existing
  `homelab/traefik-gateway` `websecure` listener, plus External Secrets serving `external-secrets.io/v1`.
- ClusterSecretStore `vault`, configured for the `secret` KV mount, with read access to
  `yumi-env` and `yumi-postgres`. No Vault data or Kubernetes secrets are committed here.
- GHCR image pull access from every eligible node. Make `ghcr.io/reetzjonas/yumi` public,
  or provision a pull secret in namespace `yumi` and reference it in the Deployment before applying.
- Confirm `yumi.reetz.me` and set internal DNS to the LAN/VPN gateway, as for rpg's internal
  access. The gateway currently advertises tailnet addresses `100.64.0.1` and `100.64.0.5`;
  public wildcard DNS pointing to the VPS does not provide this internal route.
- Keel in `keel-system` with access to GHCR. The home Deployment follows the existing
  `force`, `poll`, `@every 1h`, `matchTag: "true"` convention for automatic updates.
- Arrange PostgreSQL backups separately.

## Internal access and browser origin

The app Service is ClusterIP, as in rpg. The HTTPRoute attaches only to
`homelab/traefik-gateway` for LAN/VPN access. It deliberately omits rpg's second,
public `mail/traefik-mail-gateway` parent. No Ingress or certificate resources are created.
The existing gateway handles TLS with its existing wildcard certificate.

`deploy/k8s/overlays/home/config.yaml` sets `BETTER_AUTH_URL=https://yumi.reetz.me`.
Change it together with the HTTPRoute hostname if a different internal origin is chosen.
For temporary local access, use `kubectl -n yumi port-forward service/yumi 3000:80`
and configure `BETTER_AUTH_URL=http://localhost:3000` for that mode.

Open point before PWA rollout: confirm internal DNS and trusted HTTPS on every client.
A service worker requires a secure context (HTTPS or localhost); HTTP on a LAN IP or
tailnet IP does not qualify. Reusing the existing gateway certificate is the current route.
If a different access method is desired, options include Tailscale HTTPS / `tailscale serve`,
or an internal TLS certificate trusted by all clients. These alternatives are not implemented.

## Vault contract

The ExternalSecrets extract all fields at these keys into same-named Kubernetes Secrets:

- `secret/yumi-env`: `DATABASE_URL` and `BETTER_AUTH_SECRET` for the app environment;
  migrations read only `DATABASE_URL`.
- `secret/yumi-postgres`: `POSTGRES_PASSWORD` for PostgreSQL initialization.

Use `postgres://yumi:<URL-encoded-password>@yumi-postgres.yumi.svc.cluster.local:5432/yumi`
for `DATABASE_URL`. The password must match `POSTGRES_PASSWORD`. Use a random auth secret
of at least 32 characters. Future AI fields such as `OPENROUTER_API_KEY` belong in
`secret/yumi-env`; they are optional until the corresponding provider is implemented.

The operator supplies these values through the existing Vault workflow. Refresh is hourly.
Restart the Deployment after a secret changes; changing the Postgres initialization password
does not rotate a role in an existing database.

## Build and rollout

CI runs frozen install, lint, typecheck, tests, web build and Docker build on PRs and `main`.
Its PostgreSQL 18 service provides `TEST_DATABASE_ADMIN_URL` on localhost:55433 so integration
tests can create, migrate and drop isolated databases.
Only `main` publishes image tags (full commit SHA and `latest`) using `GITHUB_TOKEN`.
The Docker image contains production dependencies, the API sources, DB migration runner and
web assets. It runs as UID/GID 1000 on port 3000, with `APP_VERSION` set to the build's SHA.

The home overlay tracks `latest`; Keel detects GHCR digest changes hourly and recreates the
Deployment. Both app and migration containers use `imagePullPolicy: Always`.
For a pinned release, set `images[0].newTag` in the home kustomization to a published full SHA
and remove the `keel.yaml` patch. Kustomize updates app and migration containers together.

```sh
kubectl kustomize deploy/k8s/overlays/home
kubectl apply --dry-run=client -k deploy/k8s/overlays/home
```

After the owner's explicit approval, deploy the reviewed overlay:

```sh
kubectl apply -k deploy/k8s/overlays/home
kubectl -n yumi wait --for=condition=Ready externalsecret/yumi-env externalsecret/yumi-postgres --timeout=120s
kubectl -n yumi rollout status statefulset/yumi-postgres
kubectl -n yumi rollout status deployment/yumi
kubectl -n yumi logs deployment/yumi -c migrate
curl --fail https://yumi.reetz.me/api/health
```

The init container retries through Kubernetes restarts until PostgreSQL is available and the
migration succeeds. A migration error prevents the server from starting; inspect its logs.
`Recreate` and one replica serialize migration runs. Startup, readiness and liveness probes
use `/api/health`; currently that endpoint confirms the process responds, not DB connectivity.

For rollback, pin the previous image SHA, remove the Keel patch and deploy the overlay.
Data and migrations are not rolled back by an image change. Keep backups outside the node
hosting the local-path PVC.

## Image strategy

rpg builds locally and imports images into k3s on `pop-os`, with `imagePullPolicy: Never`.
yumi pulls GHCR images as requested by the owner, CI issue #2 and ADR 0007. This avoids
a node pin and local import step. Keel rolls out changes to `latest`; immutable SHA tags identify
a reproducible version for manual deployment and rollback.
