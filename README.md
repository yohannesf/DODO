# DODO — Data Online, Data Offline

Open-source (MIT), self-hostable, **offline-first** indicator data
collection and M&E platform. Field users enter data in their browser; it is
stored on the device and synchronized when connectivity returns. Program
managers configure everything — indicators, disaggregations, org units,
forms, validation, approvals, dashboards, and maps — through the UI.

![Data entry grid](docs/screenshots/entry-grid.png)

## Why DODO

- **Browser-offline-first.** No native app. The PWA installs from the
  browser, the entire app shell is precached, and every read/write hits the
  on-device database first. Sync is asynchronous replication with
  idempotent, replay-safe pushes and conflict detection that surfaces to
  humans — never silent last-write-wins.
- **Indicator-centric.** Continuous reporting against a results framework:
  periods, disaggregation (category combos), targets and baselines,
  validation rules, approval chains — the proven DHIS2 conceptual model,
  reimplemented as a small TypeScript system.
- **Light to operate.** One server container + PostgreSQL/PostGIS + Caddy.
  Single-VM friendly, `pg_dump` backups, configuration shared as one
  `metadata.json` bundle.

## What you get

- **Spreadsheet-style data entry.** Visible, keyboard-navigable cells with
  per-cell save/sync/warning/error/conflict states, automatic disaggregation
  totals, per-section completeness, and a "mark complete" flow that runs
  every validation rule. Values save to the device instantly — there is no
  save button.
- **Validation that actually validates.** Value-type and option-set checks,
  expression-based validation rules (run offline at entry and again on the
  server), and **period entry windows** — closed and future periods cannot
  be entered from the UI and are re-rejected on sync (a dataset's frequency,
  `open future periods`, and `expiry days` define the window).
- **Dashboards & analytics.** A drag-resize dashboard grid with KPI, chart,
  map, pivot, and text widgets, an ad-hoc Explore pivot/chart builder, and
  relative periods ("this year", "last 12 months") that aggregate the
  underlying monthly data correctly. Last-fetched results are cached so
  dashboards render offline with a "data as of" stamp.
- **Thematic maps.** MapLibre choropleth of org-unit boundaries and facility
  points coloured against target thresholds (≥100% / 70–99% / <70%), fully
  offline from the on-device mirror, with optional self-hosted PMTiles
  basemaps.

![Dashboard](docs/screenshots/dashboard.png)
![Maps](docs/screenshots/maps.png)
![Explore](docs/screenshots/explore.png)

## Quick start

```sh
docker compose up --build -d         # server + postgres/postgis + caddy on :8080
pnpm --filter @dodo/server seed      # optional: WASH demo — 40 org units with
                                     # geometry, 12 indicators, 18 months of data,
                                     # targets, and a ready-made overview dashboard
```

Sign in as `admin` / `admin` (change it immediately). See the
[administrator guide](docs/admin-guide.md) and the
[field guide](docs/field-guide.md).

## Development

Node 22 + pnpm 11 + Docker (for Postgres and integration tests).

```sh
pnpm install
docker compose up -d db
pnpm dev          # fastify :3000 + vite :5173
pnpm test         # unit + integration (testcontainers)
pnpm e2e          # playwright incl. the offline scenarios
```

Repository layout:

```
packages/shared    zod schemas, period logic, expression engine, validation
packages/server    fastify app, drizzle schema, migrations, sync protocol
packages/web       vite react pwa (dexie, sync engine, entry grid, dashboards)
e2e/               playwright, incl. offline & conflict scenarios
```

Design language: [docs/design-language.md](docs/design-language.md) ·
Release notes: [docs/changelog.md](docs/changelog.md) ·
Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)

## License

MIT — see [LICENSE](LICENSE). Map basemaps via
[Protomaps](https://protomaps.com) are © OpenStreetMap contributors (ODbL).
