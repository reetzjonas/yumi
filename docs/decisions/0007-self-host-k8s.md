# 0007: Self-hosting on the home Kubernetes (k3s) cluster

- Status: Accepted (alpha)
- Date: 2026-11-03

## Context

The owner runs a local k3s cluster.

## Decision

Ship container images to GHCR via GitHub Actions; deploy with kustomize (base + overlay). PostgreSQL via CloudNativePG if available, else StatefulSet + pg_dump CronJob. Secrets via Kubernetes secrets.

## Consequences

No managed services. Backups are our responsibility (tracked as an issue).
