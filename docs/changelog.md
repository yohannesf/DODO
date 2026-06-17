# Changelog

## v0.2.0 — Multi-framework, media & exports (2026-06-17)

The v0.2.0 feature set (planning/DODO-SPEC-v0.2.0.md), in three phases — every
change additive or a structured migration; sync/offline architecture unchanged.

**Phase 1 — additive:**

- Nested disaggregation: `category_option.parent_id`; the entry grid renders the
  option tree when depth > 1.
- Programs expanded to project containers (status, currency, fiscal year,
  start/end dates, metadata) with custom field definitions + values.
- Media & evidence: `evidence_requirement` + `media_file`; `/api/files` and
  `/api/media-files` (built from scratch); offline photo/audio/file/GPS capture
  queued in an uploads outbox and pushed two-step (file upload → metadata row).
- Configurable RAG: `rag_config` (synced) + server-only `rag_log`; a
  most-specific-wins scope lookup chain; `/api/analytics/rag[/recalculate]`.
- API keys: `Authorization: Bearer dodo_…` with per-key endpoint scope and an
  in-memory sliding-window rate limit; `/api/admin/api-keys`.
- Selective shapefile import into org units; `/api/admin/shapefile-imports`.

**Phase 2 — multi-framework:**

- Configurable frameworks: multiple per program, custom level names, one
  indicator mapped into several frameworks, per-mapping disaggregation filters,
  and per-framework targets (`target.framework_mapping_id`).
- One-time `rf_node → framework` migration (`pnpm migrate:rf`); the v0.1
  results-framework tables are renamed `_deprecated_*` (dropped in v0.3.0).
- Framework builder page; the results-framework view gains a framework selector
  and indicator RAG dots.

**Phase 3 — export templates:**

- Donor-template fill-in and generated Excel/CSV/JSON exports via `exceljs`;
  in-process export jobs; `node-cron` scheduled exports; `/api/export/*`; the
  Export Templates configure page.

New runtime dependencies (all permissive): `@fastify/multipart`, `shapefile`,
`exceljs`, `node-cron`.

Visual redesign — "Field Instrument" (look and feel only; data model, sync,
routing, and business logic unchanged):

- New cool blueprint-gray palette with a full dark theme, Archivo + IBM Plex
  Mono type scale, and a single source-of-truth token file. Legacy token
  aliases keep older screens reskinning without churn.
- A core `Panel` frame (header strip + body + optional footer toolbar) wraps
  every chart, map, table, KPI, and form section; toolbar actions reveal on
  hover/focus and are keyboard reachable.
- Persistent context bar with the signature `Sync Gauge` — live connectivity
  plus outstanding offline work, with the one purposeful animation (a sync
  pulse, disabled under `prefers-reduced-motion`).
- Shared ECharts theme reads live CSS vars (adapts to light/dark) and pins
  legends outside the plot; MapLibre style derives a geometry-only backdrop
  with an indicator vs-target color ramp and a deliberate no-basemap state.
- Compact table density is the default on data screens, with a per-device
  toggle. New `/dev/styleguide` route renders every primitive, the Panel, and
  the Sync Gauge in all states across both themes.
- Quality floor: AA contrast, visible keyboard focus rings, reduced-motion
  respected, and the app shell collapses to a mobile-friendly layout.

UX overhaul round 1 (research: DevResults, DHIS2 entry app, ActivityInfo)
plus the period entry-window gap found in review:

- Entry cells render as visible bordered inputs with hover/focus states and
  whole-cell validation colors; disaggregated rows get automatic totals;
  the dataset/org unit/period selector is a distinct toolbar.
- Dashboard map widget fixed: it now colours every geo org unit by its own
  value (the seeded widget had no `ouIds`, so every site rendered grey), and
  `fitBounds` padding scales to the canvas so a small grid-cell map no longer
  collapses every point into one blob. MapView re-fits when its container
  first lays out (until the user pans/zooms).
- Org units are now chosen through a searchable tree popover
  (`OrgUnitSelect`, on Radix Popover) instead of a flat indented `<select>`
  that was unusable for a 40-unit hierarchy — wired into Enter Data, Users
  (scope), Framework (targets), and the indicator test-evaluate.
- Period entry windows (spec §7.3, previously missing): a shared
  `periodOpenStatus` rule — frequency match, `openFuturePeriods`,
  `expiryDays` — drives a bounded period stepper in the entry UI (future
  periods cannot be selected) and is re-enforced on sync push (future,
  expired, wrong-frequency, and dataset-less values are rejected).
- Explore: scrollable single-row chart legend (no more plot overlap),
  pivot rows grouped by indicator, thousand separators; same legend fix in
  dashboard chart widgets; KPI values get separators too.
- Analytics period containment: a coarse relative period (e.g. "this year")
  now aggregates the finer stored data it contains instead of string-matching
  it, so "this year" over monthly data works. Stock/flow semantics are kept
  per real period (a stock still takes the latest month, not the year as one
  bucket).
- Maps now render an administrative-boundary choropleth: regions carry
  polygon geometry (a buffered convex hull over their sites in the demo
  seed) coloured by aggregate-vs-target, with facility points on top — no
  external basemap required. MapView is created once and updated via
  `setData` (previously it was recreated on every data change, which raced
  MapLibre's async load and blanked the canvas); added a `ResizeObserver` so
  the canvas tracks its container.
- Demo seed now creates a ready-made "WASH overview" dashboard (3 KPIs,
  trend line, coverage map, monthly bars, % female pivot) and seeds targets
  for the headline indicators so the map shows a real green/amber/red spread.

## M7 — Polish & release — v0.1.0 (2026-06-12)

First tagged release. All seven milestones complete with their spec §12
acceptance criteria green: PWA installable + fully offline app shell,
metadata configurable end-to-end in the UI, custom sync protocol with
idempotent replay and human conflict resolution, keyboard-first entry grid
with offline validation, analytics with flow/stock semantics, offline
dashboards and maps, and approval workflow with exports.

- Demo seed (spec §11): `pnpm --filter @dodo/server seed` builds the WASH
  programme — 41 org units over 3 levels with geometry, Sex × Age
  disaggregation, 2 datasets, 12 indicators, and ~7,800 values across 18
  months of deterministic sample data, pushed through the real sync path.
- i18n foundation (spec §8.8): typesafe `t()` keys with an en catalogue and
  fallback structure for fr/am/ar, locale applied from the user profile,
  document direction flips for RTL locales. The shell, navigation, login,
  and sync chip are migrated; remaining screens migrate incrementally and
  new strings go through `t()`.
- Accessibility: `prefers-reduced-motion` disables all transitions and
  animations; focus rings, labels, and table semantics audited.
- Docs: administrator guide, field guide, CONTRIBUTING, CODE_OF_CONDUCT
  (Contributor Covenant 2.1), README with real screenshots generated from
  the seeded instance.
- Ops polish: compose passes `JWT_SECRET` and `DODO_ADMIN_PASSWORD`
  through; map/chart code split keeps the main bundle within the precache
  budget.

Known limitations tracked for v0.2: event-level data, DHIS2 ADX export,
full i18n catalogue coverage, dashboard PDF export, OPFS storage adapter.

## M6 — Workflow & ops (2026-06-12)

Spec §12 M6 acceptance passes: the two-level approval chain e2e is green
(approve and reject paths through the Review & Approve UI), and the org unit
CSV export round-trips through the importer with zero changes.

- Approvals (spec §3): `approval` table, per-dataset `approval_levels`
  chain — each level recorded with actor and comment; rejection ends the
  chain; approvers act within their org-unit scope; approved submissions
  cannot be re-completed. `/api/approvals` queue + act + history.
- Review & Approve page: scope-filtered queue with chain progress
  (◌ level n/m), approve/reject dialogs (reason required to reject),
  per-submission approval history.
- Server-side validation hardening (spec §7.3): submission completion
  re-runs validation rules — failing error-severity rules reject the op
  with the rule names.
- Webhooks (spec §7.1): admin-configured endpoints with event selection
  (submission.completed/approved/rejected), HMAC-SHA256 `x-dodo-signature`,
  fire-and-forget with last-delivery status; config UI under
  Configure → Operations.
- Operations page: device fleet (last seen / last push, lag flags — spec
  §6.3), data value audit trail, webhook management.
- Exports: `/api/export/org-units.csv` (exact import columns → round-trips),
  `/api/export/data-values.csv` and `.xlsx` (SheetJS, dependency-free,
  Apache-2.0).
- Rate limiting (spec §9): global per-IP limit + tight login limit, both
  env-configurable; upstream 4xx statuses (429 etc.) pass through the error
  handler.

## M5 — Dashboards & maps (2026-06-12)

Spec §12 M5 acceptance passes: a dashboard renders offline with a
“data as of” stamp, and the map renders offline in the scoped bbox
(`admin-zz4-dashboard` e2e).

- Period logic completed in `@dodo/shared`: `periodContaining`,
  `offsetPeriod`, and relative-period resolution (this/last month, last
  3/6/12 months, quarters, years) — used by every widget query.
- Dashboards (spec §8.6): dashboard + dashboard_item tables, CRUD, sync
  collection + Dexie mirror, bundle export/import; 12-column grid with
  pointer drag-to-move and resize; five widgets — KPI (value vs target with
  achievement colour + text sparkline), bar/line chart (ECharts), pivot
  table, rich text, map; global org-unit/period filters cascade into
  widgets.
- Offline dashboards: every widget query’s last result is cached in Dexie;
  offline (or when the server is unreachable) widgets render the cached data
  with a “data as of <ts>” stamp.
- Maps (spec §8.7): MapLibre GL with org-unit boundaries and points straight
  from the local Dexie geometry (fully offline data layers), choropleth /
  graduated points coloured by achievement vs target thresholds
  (≥100% green, 70–99% ochre, <70% red, cobalt without a target), hover
  values, scoped-bbox auto-fit, legend; optional self-hosted PMTiles
  basemap with a download-once offline cache and ODbL attribution
  (ADR 001). Heavy map/chart code is split into separate precached chunks.
- Analytics: the aggregate row is now always labelled TOTAL when requested,
  also for single-period queries.

## M4 — Indicators & analytics (2026-06-12)

Spec §12 M4 acceptance passes: computed indicator values match
hand-calculated fixtures (`analytics.int.test.ts`) — flows sum, stocks take
the latest period (`last`), subtree aggregation, percent indicators with
option-narrowed numerators, mixed flow/stock formulas.

- Indicators, results frameworks (Goal→Outcome→Output→Activity nodes with
  linked indicators), and targets/baselines: tables + migrations + change-log
  triggers, CRUD with expression validation, bundle export/import, sync
  collections and Dexie mirrors.
- `/api/analytics?dx=…;ou=…;pe=…&ouMode=subtree&peTotal=1` (spec §4.5):
  on-the-fly aggregation — across org units by the element's
  aggregation_op, across periods sum-for-flows / last-for-stocks; indicator
  formulas computed after operand aggregation (factor + type multiplier,
  rounded to configured decimals); org-unit scope enforced for non-admins.
- Indicator builder (spec §8.5): `#{code}` / `#{code.OPTION}` autocomplete,
  live parse errors, test evaluation of the draft formula against real data
  for a sample org unit + period.
- Explore (spec §8.2): dx × ou × pe query builder, pivot table with TOTAL
  column, ECharts bar/line charts.
- Framework page: tree editor with kind-aware child creation, indicator
  linking, inline baseline/target entry per org unit and period.
- Sync protocol fix: a replayed op now returns its original outcome —
  a conflict masked behind a lost response is surfaced on retry instead of
  being reported as a plain duplicate (covered by integration test).

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
