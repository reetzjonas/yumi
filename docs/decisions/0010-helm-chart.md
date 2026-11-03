# 0010: Generic Helm chart for deployment

- Status: Accepted (alpha)
- Date: 2026-11-03
- Supersedes the deployment-manifest part of [0007](0007-self-host-k8s.md)

## Context

The first kustomize setup encoded the owner's cluster (Vault ExternalSecrets in the base,
`local-path` storage, Traefik in `kube-system`, a specific Gateway, Keel, the owner's domain).
yumi is a public, self-hostable project; others should be able to install it without editing
manifests, and the owner's cluster details do not belong in the repository.

## Decision

Ship a Helm chart in `deploy/helm/yumi`. Everything cluster-specific is a value: storage class,
Ingress or Gateway API route, existing or chart-generated secrets, bundled or external
PostgreSQL, network policies, annotations, and `extraObjects` for arbitrary resources such as
ExternalSecrets. The owner's values live outside the repository (git-ignored `deploy/local/`).
CI lints and renders the chart.

## Consequences

One install command for self-hosters; cluster conventions move into values files. The chart
must stay backwards compatible within reason once others use it. Image and migration strategy
from 0007 are unchanged.
