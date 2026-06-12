# Contributing to DODO

Thanks for helping. DODO is MIT-licensed; contributions are accepted under
the same license.

## Ground rules

- **Local-first is the product.** The UI never awaits the network for reads
  or writes; Dexie is the session source of truth and sync is asynchronous
  replication. The offline e2e suite must stay green — it is the product's
  reason to exist.
- Cross-tier types, period logic, the expression engine, and validation live
  in `packages/shared` and are imported by both server and client. Never
  duplicate them.
- Every runtime dependency must be MIT/Apache-2.0/BSD/ISC (CI enforces it).
- No pre-styled component libraries. Components are built on Radix
  primitives with the tokens in `docs/design-language.md`.
- Tests accompany every feature in the same PR.

## Getting started

```sh
pnpm install
docker compose up -d db        # postgres+postgis on localhost:5433
pnpm --filter @dodo/server seed
pnpm dev                       # server :3000 + web :5173
```

Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test` (unit + integration via
testcontainers), `pnpm e2e` (Playwright, includes the offline scenarios),
`pnpm license-check`.

## Commits

Imperative, lower-case subject, ≤ 50 chars, no trailing period; body only
when the why is non-obvious (wrap at 72). No Conventional-Commits prefixes,
no emojis, no attribution trailers. One logical change per commit.

```
add category combo materialisation
fix outbox replay duplicating values
```

Branches are named per milestone/feature (`m3/entry-grid`); PRs are
squash-merged to `master`.
