# 0004: Better Auth, households as organizations

- Status: Accepted (alpha)
- Date: 2026-11-03

## Context

Multiple users, multiple households per user, invites, roles.

## Decision

Better Auth (email/password first, OAuth later) with its organization plugin modelling households. All household-owned data carries `household_id`; the API scopes every query to the active household.

## Consequences

Less custom auth code. Cross-household sharing (share links, copy recipe) is built on top.
