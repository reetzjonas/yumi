# 0002: React + Vite SPA as PWA

- Status: Accepted (alpha)
- Date: 2026-11-03

## Context

The owner has no preference between React and Svelte. The app is mostly behind login, so SSR brings little; a static SPA is simplest to make an offline-capable PWA.

## Decision

React with Vite, TanStack Router + Query, Tailwind, shadcn/ui. PWA via vite-plugin-pwa (Workbox).

## Consequences

Largest ecosystem and component choice. No SEO for public share links unless we add a small server-rendered page for those later.
