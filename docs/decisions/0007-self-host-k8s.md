# 0007: Self-hosting on the home Kubernetes (k3s) cluster

- Status: Accepted (alpha)
- Date: 2026-11-03

## Context

The owner runs a local k3s cluster.

## Decision

Ship one Bun image containing the API and built web assets to `ghcr.io/reetzjonas/yumi`
via GitHub Actions. Deploy with kustomize (base + home overlay), following `latest` with Keel's
existing hourly polling convention. SHA tags support pinned releases when Keel is removed.
Unlike rpg's local image imports, GHCR allows any eligible cluster node to pull
the image and keeps rollbacks available independently of a node's image cache.

CloudNativePG is not installed: use PostgreSQL 18 in a StatefulSet on `local-path` storage.
External Secrets imports app and database credentials from ClusterSecretStore `vault`.
Run Drizzle migrations in the app's init container, with one replica and `Recreate` updates.
Expose the ClusterIP service only through the existing LAN/VPN Gateway API listener,
`homelab/traefik-gateway`, matching rpg's internal route. Do not create an Ingress,
new TLS infrastructure or a public VPS gateway attachment. Configure `BETTER_AUTH_URL`
to match the internal browser origin.

## Consequences

No managed services. Releases have brief downtime while migrations run. Local-path data is
bound to its node; backups and restore testing remain our responsibility and are not automated
by this deployment. See [deployment usage](../deployment.md) for the exact Vault contract.
