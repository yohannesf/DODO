# DODO — Data Online, Data Offline

**Build Specification v1.0 — for implementation with Claude Code**

Open-source (MIT) offline-first indicator data collection and M&E platform.
Repository: `github.com/yohannesf/DODO`

---

## 1. What DODO Is

DODO is a self-hostable monitoring & evaluation (M&E) platform built for environments
with poor or intermittent connectivity. Field users enter indicator data in their
browser; data is stored locally on the device and synchronized to the server when
connectivity returns. Program managers configure everything — indicators,
disaggregations, organisational units, forms, validation rules, targets, dashboards,
and maps — through the UI, with no code changes.

### 1.1 Positioning vs. existing tools

| Tool | Model | Why DODO is different |
|---|---|---|
| DHIS2 | Generic aggregate + tracker platform, Java monolith, web entry is online-only (offline only via Android app) | DODO is browser-offline-first; no native app required; far lighter to deploy (one container + Postgres) |
| KoboToolbox / ODK | Survey/form-centric, one-off data collection | DODO is indicator-centric: continuous reporting against a results framework, periods, targets, disaggregation |
| ActivityInfo | Closest conceptually (database for ongoing M&E) | Proprietary SaaS. DODO is MIT, self-hostable |
| Excel + email | The actual incumbent in most country offices | DODO replaces it with validation, audit, and dashboards |

The conceptual data model borrows deliberately from DHIS2 (org-unit hierarchy,
category/disaggregation model, datasets, periods, validation rules) because it is
proven across 80+ countries — but reimplemented as a small TypeScript system, not a
fork.

### 1.2 Non-goals (v1)

- No case/individual tracker (no longitudinal patient/beneficiary records). Aggregate
  and event-level indicator data only.
- No native mobile apps. PWA only.
- No multi-tenant SaaS isolation. One instance = one organisation (multiple programs
  inside it).
- No plugin marketplace. Extensibility via API and webhooks only.

---

## 2. Research Summary → Architecture Decisions

### 2.1 Sync engine: custom, not off-the-shelf

The 2024–2026 local-first ecosystem (PowerSync, ElectricSQL, Zero, RxDB, TanStack DB,
Replicache) was evaluated. Conclusions:

- **PowerSync**: best true-offline story, but the self-hosted service is FSL-licensed
  (not OSI) and the architecture assumes its sync service binary. Unsuitable as a hard
  dependency of an MIT project.
- **ElectricSQL**: read-path only; you build the write path anyway. Last-write-wins
  semantics are wrong for accountable M&E data.
- **Zero**: explicitly treats offline as out of scope.
- **RxDB**: core is Apache-2.0 but the production-grade storage adapters (OPFS/SQLite)
  are paid.
- **CRDTs (Yjs/Automerge)**: designed for concurrent text/structure merging. M&E data
  entry has almost no concurrent editing of the same value; CRDT complexity buys
  nothing.

**Decision: implement a small, domain-specific sync protocol** (Section 6). This is
justified because the domain makes it easy:

1. **Metadata** (indicators, org units, forms…) is server-authoritative and read-mostly
   on clients → simple versioned pull.
2. **Data values** are an append-mostly stream of submissions keyed by
   `(dataElement, orgUnit, period, categoryOptionCombo)` → idempotent push with
   client-generated UUIDs; conflicts are rare, detectable, and surfaced to humans
   rather than silently merged.

This keeps the entire stack MIT-compatible, auditable, and ~1,500 lines instead of a
black-box engine.

### 2.2 Client storage: IndexedDB via Dexie

- Target devices include old Android phones and shared cybercafé PCs. IndexedDB is the
  only storage with universal support and large quotas. SQLite-WASM over OPFS requires
  COOP/COEP headers and newer browsers — offered later as an opt-in storage adapter,
  not the default.
- Dexie.js (Apache-2.0) for ergonomics, compound indexes, and multi-tab coordination.
- Call `navigator.storage.persist()` on first data entry and surface the result.
  **iOS constraint**: Safari has no Background Sync API and may evict storage under
  disk pressure; clearing Safari history deletes PWA data. Therefore:
  - Foreground sync is the **primary** mechanism (sync on app open, on regaining
    connectivity via `online` event, on interval while open, and manual button).
  - Background Sync API is a progressive enhancement on Chromium only.
  - Persistent, prominent "N records not yet synced" indicator; warn loudly on iOS
    before users clear data or when storage is not persisted.

### 2.3 Stack

| Layer | Choice | License | Rationale |
|---|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | MIT | shared types between client/server |
| Language | TypeScript end-to-end, strict | — | one type system for the sync protocol |
| Client | React 19 + Vite PWA (SPA) | MIT | offline-first rules out RSC/Next.js server coupling |
| Router/state | TanStack Router + TanStack Query (server state) + Zustand (UI state) | MIT | |
| Local DB | Dexie 4 (IndexedDB) | Apache-2.0 | |
| Service worker | Workbox (precache app shell, runtime cache tiles/fonts) | MIT | |
| Server | Node 22 + Fastify 5 | MIT | light, fast, schema-first |
| API schema | Zod schemas shared in `packages/shared`; OpenAPI generated from them | MIT | client and server validate with the same code |
| DB | PostgreSQL 16 + PostGIS | PostgreSQL/GPL-compat | geometry for org units |
| ORM | Drizzle | Apache-2.0 | SQL-transparent, migrations as code |
| Auth | Lucia-style session pattern implemented in-house + WebAuthn optional; JWT access tokens for sync | — | offline token caching (Section 9) |
| Charts | Apache ECharts | Apache-2.0 | canvas perf on low-end devices |
| Maps | MapLibre GL JS + PMTiles for offline basemaps | BSD | self-hosted tiles, no API keys |
| Formula engine | own parser on a tiny expression grammar (see 4.6) | — | avoid `eval`, deterministic |
| Tests | Vitest + Playwright (incl. offline emulation) | MIT | |
| Deploy | Docker Compose (app + postgres + caddy); single binary-ish | — | NGO-friendly |

**Dependency policy: every runtime dependency must be MIT/Apache-2.0/BSD/ISC.**
Add a CI check (`license-checker`) that fails otherwise.

### 2.4 Repository layout

```
DODO/
├── CLAUDE.md                  # working conventions for Claude Code
├── README.md
├── LICENSE                    # MIT
├── docker-compose.yml
├── docs/
│   ├── architecture.md
│   ├── sync-protocol.md
│   ├── data-model.md
│   └── design-language.md
├── packages/
│   ├── shared/                # zod schemas, types, period logic, formula engine
│   ├── server/                # fastify app, drizzle schema, migrations
│   └── web/                   # vite react pwa
└── e2e/                       # playwright, incl. offline scenarios
```

---

## 3. Core Concepts (Glossary)

These names are used consistently in code, DB, and UI.

| Concept | Meaning |
|---|---|
| **Org Unit** | Node in the organisational/geographic hierarchy (Country → Region → District → Facility/Site). Carries optional PostGIS geometry (point or polygon). |
| **Org Unit Level** | Named depth in the hierarchy ("Region" = level 2). |
| **Data Element** | The atomic thing collected ("Number of boreholes rehabilitated"). Has a value type. |
| **Category / Category Option** | A disaggregation axis and its values: Sex → {Female, Male}; Age → {0–17, 18–59, 60+}. |
| **Category Combo** | Cartesian product of categories assigned to a data element (Sex × Age → 6 category option combos). Every stored value points to exactly one **Category Option Combo** (with a reserved `default` combo when no disaggregation). |
| **Period** | A reporting interval generated from a frequency: Daily, Weekly, Monthly, Quarterly, Yearly, Custom range. Encoded as ISO-like strings: `2026-03`, `2026-Q1`, `2026`, `2026-W14`, `2026-03-15`. |
| **Dataset (Form)** | A collection form: a set of data elements + a frequency + assigned org units + an entry layout. The unit of "reporting completeness". |
| **Indicator** | A computed value: `formula(numerator) / formula(denominator) × factor`, where formulas reference data elements/COCs. Direct-entry indicators are just data elements. |
| **Results Framework** | Tree of Goal → Outcome → Output → Activity nodes, each linked to indicators with baselines and targets per org unit/period. |
| **Target / Baseline** | Expected/initial value for an indicator at (orgUnit, period). |
| **Validation Rule** | Expression comparing data values (`leftSide <op> rightSide`), severity warning/error, run at entry time (offline) and server-side. |
| **Submission** | A user's saved batch of data values for (dataset, orgUnit, period). Has lifecycle: draft → completed → approved/rejected. |
| **Approval Workflow** | Optional per-dataset chain of approval levels mapped to org unit levels. |

---

## 4. Data Model

All tables get: `id` (UUIDv7), `created_at`, `updated_at`, `created_by`, `updated_by`.
All **metadata** tables additionally get `version` (int, bumped on every write) and
`deleted_at` (soft delete → tombstone for sync).

### 4.1 Metadata tables

```
org_unit            (parent_id, name, short_name, code, level, path ltree,
                     opening_date, closed_date, geometry geometry(Geometry,4326),
                     attributes jsonb)
org_unit_level      (level int unique, name)
category            (name, code, data_dimension bool)
category_option     (category_id, name, code, sort_order)
category_combo      (name, code)
category_combo_categories (combo_id, category_id, sort_order)
category_option_combo (combo_id, name, option_ids uuid[])   -- materialised product
data_element        (name, short_name, code, description, value_type, category_combo_id,
                     unit_of_measure, aggregation_op enum(sum,avg,count,min,max,last),
                     option_set_id nullable)
value_type enum: INTEGER, INTEGER_POSITIVE, INTEGER_ZERO_OR_POSITIVE, NUMBER,
                 PERCENTAGE, BOOLEAN, TEXT, LONG_TEXT, DATE, OPTION, COORDINATE, FILE
option_set          (name, code) / option (option_set_id, name, code, sort_order)
dataset             (name, code, description, frequency enum, open_future_periods int,
                     expiry_days int, requires_approval bool, entry_layout jsonb)
dataset_elements    (dataset_id, data_element_id, sort_order, section, required bool)
dataset_org_units   (dataset_id, org_unit_id)
indicator           (name, code, description, numerator_expr text, denominator_expr text,
                     factor numeric default 1, decimals int, indicator_type enum(
                     number, percent, rate, per_thousand, per_ten_thousand),
                     annualized bool)
results_framework   (name, program?)  /  rf_node (framework_id, parent_id, kind enum(
                     goal,outcome,output,activity), title, description, sort_order)
rf_node_indicators  (node_id, indicator_id)
target              (indicator_id, org_unit_id, period, value numeric,
                     kind enum(baseline,target))
validation_rule     (name, left_expr, op enum(<,<=,=,!=,>=,>), right_expr,
                     severity enum(warning,error), datasets uuid[])
dashboard           (name, owner_id, shared bool, layout jsonb)
dashboard_item      (dashboard_id, kind enum(chart,map,kpi,table,text), config jsonb,
                     grid_x, grid_y, grid_w, grid_h)
user                (username, email, password_hash, display_name, locale, disabled)
role                (name, permissions text[])     -- permission strings, e.g. 'data:write'
user_role           (user_id, role_id)
user_org_units      (user_id, org_unit_id, scope enum(data_entry, data_view))
```

### 4.2 Data tables (high volume)

```
data_value (
  id uuid,                       -- client-generated UUIDv7 (idempotency key)
  data_element_id, org_unit_id, period text, category_option_combo_id,
  value text,                    -- stored as text, validated by value_type
  comment text,
  submission_id uuid,
  stored_by uuid, client_ts timestamptz, server_seq bigint generated identity,
  base_version int,              -- version of the value the client edited (conflict check)
  UNIQUE (data_element_id, org_unit_id, period, category_option_combo_id)
)
data_value_audit (data_value_id, old_value, new_value, actor, ts, action enum(
                  create,update,delete,sync_conflict))
submission (dataset_id, org_unit_id, period, status enum(draft,completed,approved,
            rejected), completed_by, completed_at, note)
approval   (submission_id, level int, actor, status, comment, ts)
sync_change_log (server_seq bigint identity, collection text, row_id uuid,
                 op enum(upsert,delete), ts)    -- written by triggers on all synced tables
```

`server_seq` (one global monotonic sequence via `sync_change_log`) is the sync cursor.

### 4.3 Period logic

Implement once in `packages/shared/periods.ts`: generate, parse, compare, offset,
humanise; tested exhaustively. Both client and server import it. Support fiscal-year
offsets (config: fiscal year start month) — UN agencies need Jul–Jun and Oct–Sep years.

### 4.4 Disaggregation rules

- Category combos are materialised into category_option_combos at save time.
- Changing a combo on a data element with existing data is blocked (require a new
  element version) — protects historical comparability.
- Entry UI renders combos as grid columns (≤2 categories) or stacked field groups (>2).

### 4.5 Aggregation semantics

Analytics aggregates raw `data_value` rows:
- across org units: by `aggregation_op` of the data element (default sum)
- across periods: sum for flows; `last` for stocks (e.g., "number of functional water
  points" takes the latest period's value)
- indicator formulas are computed **after** aggregation of their operands.
v1 computes on the fly with indexed SQL + a small materialised summary table refreshed
on sync batches; no OLAP engine.

### 4.6 Expression grammar (indicators & validation rules)

```
expr     := term (('+'|'-') term)*
term     := factor (('*'|'/') factor)*
factor   := NUMBER | ref | '(' expr ')' | func '(' args ')'
ref      := '#{' dataElementCode ('.' cocCode)? '}'
func     := if | isNull | min | max | abs | round
```
Hand-written recursive-descent parser in `packages/shared/expr/`. Same code evaluates
offline (client-side validation) and server-side (analytics). No `eval`, no `Function`.


---

## 5. Offline Architecture (Client)

### 5.1 Principles

1. **Local is the source of truth for the session.** Every read and write hits Dexie
   first. The network is an async replication concern, never in the UI critical path.
2. **The app is fully functional offline** after first login + initial sync: browse
   metadata, enter data, run validation, view locally-cached dashboards.
3. **Online/offline is a status, not a mode.** No separate "offline mode" toggle; the
   UI shows connectivity + sync state passively and continuously.

### 5.2 Dexie schema (mirrors server, plus client-only tables)

```
metadata tables: orgUnits, dataElements, categories, categoryOptionCombos, datasets,
                 indicators, validationRules, optionSets, targets, rfNodes, dashboards
data tables:     dataValues, submissions
client-only:
  outbox     (opId uuidv7, kind enum(dataValue.upsert, dataValue.delete,
              submission.complete, ...), payload, createdAt, tries, lastError, state
              enum(pending, inflight, failed, conflicted))
  syncState  (collection, cursor bigint, lastFullSync ts)
  authCache  (user profile, permissions, org unit scope, token expiry)
  conflicts  (local payload, server payload, resolvedAt nullable)
```

### 5.3 Write path

UI save → validate locally (zod + validation rules) → write to Dexie `dataValues`
(optimistic) → append op to `outbox` → schedule sync. UI marks the row "pending sync"
(subtle dot, not a blocking state).

### 5.4 Sync triggers

- app start / login
- `online` event and Network Information API change
- every 90 s while tab focused and online
- manual "Sync now" (always visible)
- Chromium only: Background Sync registration as enhancement

### 5.5 Service worker

- Workbox precache of the app shell (HTML/JS/CSS/fonts) — app loads with zero network.
- Runtime caching: basemap tiles (CacheFirst, max-entries LRU), avatar/files
  (StaleWhileRevalidate). API calls are **never** cached by SW — Dexie owns data.
- Update flow: SW `waiting` → toast "Update available — Reload"; never auto-reload
  during data entry.

### 5.6 Storage stewardship

- Request `navigator.storage.persist()` after first successful data save; show storage
  page (used/quota via `estimate()`, per-table counts, "free up space" for old synced
  periods).
- Initial metadata sync is scoped to the user's org-unit subtree and assigned datasets
  — keeps small devices small.
- Files/photos (FILE value type): stored as Blobs in Dexie, uploaded on sync, value
  stores the file UUID; configurable max size; downscale images client-side.

---

## 6. Sync Protocol

Single endpoint pair; JSON; documented in `docs/sync-protocol.md`.

### 6.1 Push (upload)

```
POST /api/sync/push
{ deviceId, ops: [ { opId, kind, payload, clientTs, baseVersion? } ] }   // ≤200 ops/batch
→ { results: [ { opId, status: applied|duplicate|conflict|rejected, serverVersion?,
                 conflict?: {serverValue, serverActor, serverTs}, error? } ] }
```

- **Idempotent**: `opId` is unique; replays return `duplicate`. Safe to retry forever.
- **Ordered per device**: server applies a batch in order, in one transaction per op
  (not per batch — partial success allowed and reported per-op).
- **Conflict rule for data values**: the row's unique key is
  (dataElement, orgUnit, period, coc). If a row exists and `baseVersion` ≠ current
  version → `conflict`, value is NOT overwritten, audit row written. Client stores
  both versions in `conflicts` and shows a resolution UI (keep mine / take server /
  edit). Resolving re-pushes with the new baseVersion. New rows never conflict.
- `rejected` = permanent validation/permission failure → moved out of outbox into an
  error list visible to the user; never retried silently.

### 6.2 Pull (download)

```
GET /api/sync/pull?cursor=<server_seq>&collections=...&scope=auto
→ { changes: [ {collection, op, row} ... ], nextCursor, hasMore }
```

- Server reads `sync_change_log` after cursor, joins current rows, filters by the
  user's org-unit scope and dataset assignment, returns ≤1000 changes per page.
- Deletes arrive as tombstones `{op:'delete', rowId}`.
- First sync: `cursor=0` streams the scoped snapshot (same code path).
- Pull runs after every successful push, and on the triggers in 5.4.

### 6.3 Integrity & ops

- Every push batch is journaled server-side (`device_id`, batch hash) for forensics.
- `GET /api/sync/status` → server time, latest seq, per-device last-seen (admin page
  shows which field devices are lagging — critical operational feature).
- Clock skew: server timestamps are authoritative; `clientTs` is kept for audit only.

---

## 7. Server Application

### 7.1 API surface (REST, OpenAPI generated from zod)

```
/api/auth        login, refresh, logout, me, webauthn
/api/metadata    CRUD for every metadata entity (admin), bulk import/export json
/api/sync        push, pull, status
/api/data        query data values & submissions (online analytics path)
/api/analytics   aggregate queries: dimensions=dx;ou;pe, filters, totals, pivots
/api/approvals   list pending, approve, reject
/api/files       upload/download (FILE values), images resized server-side
/api/export      csv, xlsx, geojson, DHIS2 ADX (post-v1)
/api/webhooks    admin-configured POST on events (submission.completed, etc.)
```

### 7.2 Permissions

Permission strings checked per route: `metadata:read|write`, `data:read|write`,
`approvals:act`, `dashboards:manage`, `users:manage`, `system:admin`. Data access is
always intersected with the user's org-unit scope (subtree). Default roles:
Superuser, Program Admin, M&E Officer, Data Entry, Viewer.

### 7.3 Server-side validation

Re-run everything the client validated (never trust the client): value_type coercion,
option membership, period validity against dataset frequency + open_future_periods +
expiry_days, org-unit assignment, validation rules (errors block, warnings stored on
the value).

---

## 8. UI/UX Specification

### 8.1 Design language — explicitly anti-template

The product must not look like the current default AI-generated SaaS (Inter +
shadcn pills + purple gradients + glassmorphism cards). Direction: **utilitarian
editorial** — closer to a well-set field notebook / Swiss timetable than a startup
landing page. Codify it in `docs/design-language.md` and tokens; all UI work must
follow it.

Rules:

- **Typography is the interface.** UI text: a grotesque with character, self-hosted —
  *IBM Plex Sans* primary. ALL numerals in tables, KPIs, charts: *IBM Plex Mono* or
  Plex Sans with `font-variant-numeric: tabular-nums`. Generous type scale contrast
  (12/14 px dense data vs 28–40 px section numerals).
- **Color**: paper-warm neutral background (#FAF8F4-ish), near-black ink, ONE accent
  (deep cobalt) used only for interaction states, plus semantic ochre/green/red used
  only for data meaning (warning/on-track/off-track). Dark theme = true ink-dark, same
  discipline. No gradients, no glass, no glow.
- **Shape**: 2–4 px radii maximum. Hairline 1 px borders instead of drop shadows.
  Density toggle (comfortable/compact) with compact default on data screens.
- **Tables are first-class citizens**: sticky headers/first column, row hover,
  keyboard navigation, right-aligned tabular numbers, zebra OFF, hairline rules.
- **Status is typographic, not pill-shaped**: small-caps text + leading dot
  (`● SYNCED`, `◌ PENDING`, `▲ CONFLICT`) instead of rounded badges.
- **Motion**: 120–160 ms ease-out on state changes only. No springy entrance
  animations.
- Build the component kit in-house on Radix primitives (unstyled, accessible) +
  vanilla-extract or Tailwind v4 with a locked token file. **Do not install a
  pre-styled component library.**
- Empty states teach (show what to configure next), never decorate.

### 8.2 Information architecture

```
├── Enter Data        (the home for field users)
├── Review & Approve
├── Dashboards
├── Maps
├── Explore           (ad-hoc pivot/chart builder)
├── Framework         (results framework + targets view)
└── Configure         (admin: indicators, disaggregations, org units, datasets,
                       validation, users, system)
```
Role-based landing: data-entry users land on Enter Data with their last
(dataset, org unit) preselected.

### 8.3 Data entry workflow (the product lives or dies here)

1. Selector bar: Dataset → Org Unit (searchable tree) → Period (smart stepper with
   ← → keys). Persisted per user.
2. Entry grid: spreadsheet-like. One row per data element; disaggregation combos as
   columns. **Full keyboard model**: Tab/Enter advance, arrows move, Esc reverts cell,
   Ctrl+S completes section. Cell states: saved-local (dot), synced (no mark),
   warning (ochre underline + message on focus), error (red underline, blocks
   complete), conflict (▲, opens resolver).
3. Every cell save is instant-local (5.3). There is **no Save button** for values —
   only a "Mark complete" action for the submission, which runs all validation rules
   and shows a completeness summary (filled/required/warnings) before confirming.
4. Section navigation rail with per-section completeness meters.
5. Comment affordance per cell (long-press / right-click), required when a validation
   warning is overridden.
6. Offline behaviour identical; top bar shows `◌ 14 pending — last sync 09:42`.

### 8.4 Sync & conflict UX

- Persistent compact sync chip in the header: state (synced / pending n / syncing /
  offline / attention), tap → Sync Center page: outbox list, per-item status, errors
  with human messages, conflict resolver (side-by-side mine vs server, with actor and
  time, pick or edit), device storage panel.
- Never block entry on sync. Never lose a value silently — every rejected op is
  visible until dismissed.

### 8.5 Configuration UX

- Indicator builder: formula editor with autocomplete of `#{code}` refs, live parse
  errors, test evaluation against sample period/org unit.
- Disaggregation builder: define categories/options, compose combos, preview the
  generated entry grid immediately.
- Dataset designer: drag data elements into sections, set required flags, preview the
  exact entry form, assign org units via tree with subtree-select.
- Org unit manager: tree editor + map panel (draw/edit point or polygon, or import
  GeoJSON per level), bulk CSV import with dry-run report.
- Everything importable/exportable as a single `metadata.json` bundle (versioned
  schema) — enables sharing configurations between instances.

### 8.6 Dashboards

- Grid layout (drag/resize), widgets: KPI card (value vs target, sparkline, period
  delta), line/bar/stacked (ECharts), choropleth/point map, pivot table, rich-text.
- Each widget = saved analytics query: indicators/data elements × org unit level/tree
  selection × relative periods ("last 12 months", "this quarter") × disaggregation
  series.
- Global dashboard filters (org unit, period) cascade into widgets.
- Last-fetched dashboard data is cached in Dexie → dashboards render offline with a
  "data as of <ts>" stamp.
- Export: widget → PNG/CSV; dashboard → PDF (server-rendered, post-v1 ok).

### 8.7 Maps

- MapLibre + self-hostable PMTiles basemap (download-once, cached for offline).
- Layers: org unit boundaries (choropleth by indicator value vs target thresholds),
  facility points (graduated/colored), labels. Legend editor with manual or quantile
  classes.
- Offline: tiles cached for the user's scoped bounding box at configurable zooms.

### 8.8 Accessibility & i18n

- WCAG 2.1 AA: full keyboard operability (mandatory anyway for the grid), visible
  focus, 4.5:1 contrast, reduced-motion respect.
- All strings through i18n (typesafe keys); locales: en first; structure ready for
  fr, am, ar (RTL audit in layout primitives from day one).
- Dates/numbers via `Intl`; Ethiopian calendar display is a documented post-v1 item.


---

## 9. Security

- Passwords: argon2id. Sessions: httpOnly refresh cookie + short-lived JWT (15 min)
  for API/sync.
- **Offline auth**: after login, profile/permissions/scope cached in `authCache`.
  If the access token expires while offline, the app stays usable (local writes
  continue); sync waits for re-auth. Optional device PIN re-lock after idle
  (config flag) — PIN unlocks the cached session locally, never replaces server auth.
- Multi-user shared devices: per-user Dexie database name (`dodo_<userId>`); switch
  user keeps each outbox separate; admin setting to disallow cached logins on shared
  devices.
- Server: rate limiting on auth + sync, helmet headers, strict CORS (same-origin
  deploy default), input validation everywhere via shared zod schemas, audit log on
  all metadata writes and approvals.
- At-rest client encryption is explicitly out of scope v1 (documented threat model:
  device theft → mitigated by PIN lock + small scoped datasets); revisit with OPFS
  adapter.

---

## 10. Testing Strategy

- `packages/shared`: 100% coverage target on periods, expression parser/evaluator,
  zod schemas (property-based tests with fast-check for the parser).
- Server: integration tests against real Postgres (testcontainers) for sync
  push/pull, idempotency (replay batches), conflict paths, scope filtering,
  permissions.
- Client: component tests for the entry grid keyboard model; Dexie logic unit-tested
  with fake-indexeddb.
- **E2E offline suite (Playwright)** — the signature tests:
  1. login → initial sync → go offline (`context.setOffline(true)`) → enter 50 values
     across 2 datasets → reload page offline → data intact → go online → auto-sync →
     server has all values exactly once.
  2. two clients edit the same value offline → first sync wins → second gets conflict
     UI → resolve both directions.
  3. outbox replay after simulated 500s/network drops mid-batch → no duplicates.
  4. SW update during pending outbox → nothing lost.
- CI: lint (eslint+prettier), typecheck, tests, license-checker, Lighthouse PWA
  budget (installable, offline-capable, TTI budget on throttled mid-tier mobile).

---

## 11. Deployment

- `docker-compose.yml`: `dodo-server` (serves API + built SPA), `postgres:16-postgis`,
  `caddy` (TLS). Single VM friendly.
- `.env`-driven config; first-run setup wizard (create superuser, org name, fiscal
  year start, locale).
- Seed command: demo configuration (WASH program: 12 indicators, 3-level org tree of
  ~40 units with geometry, 2 datasets, sample 18 months of data) — used by e2e and
  demos.
- Backup: documented `pg_dump` + files volume; metadata bundle export as logical
  backup.

---

## 12. Build Plan (Milestones for Claude Code)

Each milestone ends with: tests green, e2e for that milestone green, short demo notes
in `docs/changelog.md`. Do not start milestone N+1 with N's acceptance criteria
failing.

**M0 — Skeleton (foundation)**
Monorepo, tooling, CI, docker-compose, Fastify hello, Vite PWA shell installable +
offline app-shell, Postgres + Drizzle migrations runner, shared zod setup,
design tokens + base primitives (Button, Input, Table, Dialog) per design language.
*Accept: app installs as PWA, loads offline, CI green.*

**M1 — Metadata core**
Org units (tree + levels + CRUD + CSV/GeoJSON import), categories/options/combos with
COC materialisation, data elements, option sets, datasets (designer v1: sections,
required, org-unit assignment), users/roles/scopes, metadata bundle export/import.
*Accept: full WASH demo config creatable via UI only.*

**M2 — Sync engine**
`sync_change_log` triggers, pull with scoping + cursor + tombstones, Dexie schema +
metadata mirror, outbox, push with idempotency + conflicts, Sync Center UI, auth
caching, storage persist + estimate page.
*Accept: e2e offline test #1 and #3 pass.*

**M3 — Data entry**
Entry grid (keyboard model, cell states, comments), local validation rules engine,
submission complete flow with completeness summary, conflict resolver UI.
*Accept: e2e #2 passes; 50-value entry offline ≤ no jank on throttled CPU.*

**M4 — Indicators & analytics**
Expression parser/evaluator, indicator CRUD + builder with test-evaluate, analytics
API (dx;ou;pe aggregation, aggregation_op semantics incl. `last`), Explore page
(pivot + chart from a query builder), targets/baselines, results framework tree.
*Accept: computed indicator values match hand-calculated fixtures.*

**M5 — Dashboards & maps**
Dashboard grid + 5 widget types, relative periods, offline dashboard cache,
MapLibre + PMTiles pipeline, choropleth vs target thresholds, offline tile cache.
*Accept: dashboard renders offline with stamp; map works offline in scoped bbox.*

**M6 — Workflow & ops**
Approvals (levels, queue UI), audit views, device fleet page (last-seen per device),
webhooks, CSV/XLSX export, server-side validation hardening, rate limits.
*Accept: approval chain e2e; export round-trips.*

**M7 — Polish & release**
i18n extraction, a11y audit fixes, perf pass (bundle budget, virtualised trees/grids),
docs site content (admin guide + field guide), demo seed, v0.1.0 tag, README with
screenshots/GIFs.

---

## 13. Git & Repo Conventions

- Branch per milestone feature: `m2/sync-pull`, `m3/entry-grid`.
- **Commit messages: imperative, lower-case, ≤ 50 chars, no trailing period.
  Body only when the why is non-obvious (wrap 72). No emojis, no Conventional-Commits
  prefixes, no issue boilerplate, NO author trailers — never add
  `Co-Authored-By`, `Generated with Claude Code`, or any tool attribution lines.**
  Examples:
  ```
  add category combo materialisation
  fix outbox replay duplicating values
  scope pull endpoint to org unit subtree
  ```
- Squash-merge to `master`. Tags `v0.x.y`. `LICENSE` = MIT, copyright "DODO
  contributors". Add `CONTRIBUTING.md` + `CODE_OF_CONDUCT.md` at M7.

---

## 14. Open Questions (decide before/while building)

1. Single program vs multiple programs per instance — schema above is
   program-agnostic; add a `program` grouping entity in M1 if needed (cheap now,
   expensive later). **Recommended: add it.**
2. Event-level (one row per occurrence with date + coordinates) in addition to
   aggregate? Schema supports it later via an `event` table feeding aggregation;
   defer to v0.2.
3. DHIS2 ADX export for interoperability with national HMIS — defer to v0.2 but keep
   codes (`code` fields everywhere) mandatory-unique to make mapping trivial.
4. PMTiles basemap source: protomaps builds (ODbL attribution required) — confirm
   attribution UI.
