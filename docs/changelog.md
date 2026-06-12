# Changelog

## M3 — Data entry (2026-06-12)

Spec §12 M3 acceptance passes: offline e2e #2 is green (two clients edit the
same cell offline; the first sync wins, the second resolves the conflict in
both directions), and the 50-value offline entry runs jank-free under 4×
CPU throttling.

- Expression engine (spec §4.6) in `@dodo/shared/expr`: recursive-descent
  parser + evaluator (arithmetic, `#{code}` / `#{code.OPTION_CODE}` refs,
  if/isNull/min/max/abs/round), no eval, property-based tests (fast-check).
  Pulled forward from M4 because validation rules need it.
- Validation rules end to end: metadata entity (+ migration, change-log
  trigger, bundle, sync collection, Dexie mirror), Configure builder with
  live parse errors, and a shared rule evaluator: `#{DE}` sums across
  combos, `#{DE.OPTION_CODE}` narrows by category option. Rules run during
  entry (offline) with the exact same code the server will use.
- Entry grid (spec §8.3): one row per data element with COC columns,
  full keyboard model (Tab/Enter advance, arrows move, Esc reverts,
  Ctrl+S opens completion), cell states (● saved-local, ochre/red
  underlines for warnings/errors, ▲ conflict, ◦ comment), right-click
  cell comments, completeness rail.
- Mark complete: runs all rules, summary dialog (filled/required,
  errors block, overridden warnings require a note), `submission.complete`
  push op with server-side period/assignment validation; submissions
  replicate to all scoped devices.
- Conflict resolver (spec §8.4): side-by-side mine vs server with actor and
  time — keep mine / take server / edit, re-pushed against the server's
  row id and version (conflicts now report `serverId`; the losing local row
  is dropped so every cell keeps exactly one row).

## M2 — Sync engine (2026-06-12)

Spec §12 M2 acceptance passes: offline e2e #1 (50 values entered offline
across 2 datasets, reload offline, auto-sync delivers each exactly once) and
#3 (outbox replay through dropped responses, no duplicates) are green.

- Auth (spec §9): argon2id verification, Lucia-style hashed session tokens in
  an httpOnly cookie, 15-minute HS256 JWTs carrying permissions + org-unit
  scope; `/api/auth` login/refresh/logout/me; per-route permission checks on
  all metadata routes; first-boot `admin` superuser (DODO_ADMIN_PASSWORD).
- Data tables (spec §4.2): `data_value` (client UUIDv7 ids, unique cell key,
  versioned), `data_value_audit`, `submission`; `sync_change_log` fed by
  triggers on every synced table — soft deletes become tombstones.
- `/api/sync/pull`: cursor over the global change log, ≤1000 changes/page,
  org-unit-subtree + dataset scoping, tombstones for deletes and out-of-scope
  rows. `/api/sync/push`: ≤200 ops/batch, one transaction per op, opId
  journal makes replays return their original result, base-version conflict
  detection (server value never overwritten), value-type validation with the
  shared validator, batch hash journaling, device registry powering
  `/api/sync/status`.
- Client: per-user Dexie database (spec §5.2) mirroring all synced
  collections; outbox write path (optimistic local write + queued op, ops
  coalesce per cell); sync triggers per §5.4 (start, online event, 90 s
  focus interval, manual, retry after failure); login screen; offline auth
  cache keeps the app usable without a live token; storage persist request +
  estimate panel.
- Sync Center (spec §8.4): outbox with per-item state and human messages,
  dismissable rejected ops, conflict list with keep-mine/take-server (full
  side-by-side resolver lands with the M3 grid), device storage panel.
- Minimal offline entry form (ADR 002) writing through Dexie + outbox; the
  §8.3 keyboard grid replaces it in M3.

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
