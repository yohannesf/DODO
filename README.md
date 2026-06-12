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

![Explore](docs/screenshots/explore.png)
![Maps](docs/screenshots/maps.png)

## Quick start

```sh
docker compose up --build -d         # server + postgres/postgis + caddy on :8080
pnpm --filter @dodo/server seed      # optional: WASH demo with 18 months of data
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
