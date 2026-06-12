# Changelog

## M1 — Metadata core (2026-06-12)

Spec §12 M1 acceptance passes: the full WASH demo configuration is creatable
via the UI only (verified by the `admin-wash-config` e2e suite against a real
server + PostGIS).

- Metadata schema (spec §4.1) in Drizzle: programs (ADR 001), org unit
  levels/units (ltree paths, PostGIS geometry), categories/options/combos
  with materialised category option combos, option sets, data elements,
  datasets (elements, sections, org-unit assignment), users/roles/scopes.
  Soft delete + per-write version bumps everywhere; codes mandatory-unique
  among live rows. Default roles and the reserved `default` combo are seeded.
- `/api/metadata/*` CRUD for every entity (route → zod → service → Drizzle),
  plus org-unit CSV import (dry-run report, transactional apply), GeoJSON
  geometry import matched by code, and metadata bundle export/import
  (id-stable upsert, COC re-materialisation).
- COC generation lives in `@dodo/shared` — the disaggregation builder
  previews exactly what the server materialises. UUIDv7 implementation
  shared client/server (future sync idempotency keys).
- Configure UI: overview with bundle export/import, programs, org-unit tree
  editor with level names + imports, disaggregation builder with live combo
  preview, data elements, option sets, dataset designer (sections, required
  flags, subtree org-unit assignment), users & roles.
- Org-unit subtree reparenting rewrites ltree paths/levels; cycles blocked.
- Server integration tests run against real Postgres via testcontainers
  (idempotent bundle round-trip, COC id stability, CSV dry-run rollback…).
- Passwords hashed with argon2id (@node-rs/argon2). Route-level permission
  enforcement lands with auth/sync in M2 (ADR 001).

## M0 — Skeleton (2026-06-11)

Foundation in place; spec §12 M0 acceptance criteria pass.

- pnpm + Turborepo monorepo: `packages/shared`, `packages/server`,
  `packages/web`, `e2e/`.
- `@dodo/shared`: zod set up as the cross-tier schema source
  (`healthResponseSchema`, period string schema); `periods.ts` stub
  (parse/format/validate for daily–yearly encodings) with exhaustive tests.
- `@dodo/server`: Fastify 5 with `/api/health` (route → zod → service),
  Drizzle migration runner (initial migration enables postgis + ltree),
  serves the built SPA with an SPA fallback.
- `@dodo/web`: Vite + React 19 PWA — installable (manifest + icons),
  app shell precached by Workbox so it loads fully offline; TanStack
  Router skeleton with the §8.2 nav (Enter Data, Review & Approve,
  Dashboards, Maps, Explore, Framework, Configure); update-prompt SW flow.
- Design language codified in `docs/design-language.md`; tokens (paper/ink/
  cobalt, IBM Plex, 2–4 px radii) in a locked Tailwind v4 theme; base
  primitives Button, Input, Table, Dialog built on Radix.
- `docker-compose.yml`: dodo-server (API + SPA), postgis, caddy; migrations
  run on boot. The official postgis image is amd64-only, so the db service
  pins `platform: linux/amd64` (override with `POSTGIS_IMAGE`/`POSTGIS_PLATFORM`
  on ARM).
- CI (GitHub Actions): lint, typecheck, vitest, license check, Playwright
  offline e2e, Lighthouse PWA budget.
- e2e: signature offline test — first load installs the SW, app shell
  renders offline after a cold reload, nav works offline.

Flagged deviations:

- License policy: `Unlicense` (isbot ← @tanstack/react-router) and
  `BlueOak-1.0.0` (glob@11 family ← @fastify/static, workbox-build) are
  transitive deps of the spec-mandated stack. Both are permissive and
  OSI-approved; allowed as documented exceptions in
  `scripts/check-licenses.mjs`.
- Lighthouse removed the PWA category in v12; the PWA check pins
  lighthouse@11 (`scripts/lighthouse-pwa.mjs`).
- IBM Plex is OFL-1.1; bundled as a build asset via `@fontsource/*`
  dev dependencies, not a runtime dependency.
