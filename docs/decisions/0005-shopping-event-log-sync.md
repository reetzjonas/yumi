# 0005: Shopping list sync via event log, SSE, offline outbox

- Status: Accepted (alpha)
- Date: 2026-11-03

## Context

Shopping happens in stores with bad reception; several household members may shop at once. Full local-first frameworks (Zero, PowerSync, ElectricSQL) add significant complexity.

## Decision

Only the shopping list is offline-writable at first. Clients write events with client-generated IDs to an IndexedDB outbox, replay them when online; the server applies them idempotently and broadcasts via SSE. Other data is cached read-only offline.

## Consequences

Simple and debuggable. The event log doubles as input for learned store order. Revisit a sync framework if offline editing of recipes/queue becomes important.
