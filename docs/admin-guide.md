# DODO administrator guide

This guide covers setting up an instance and configuring it for a programme.
Everything is done in the UI under **Configure** — no code changes.

## Installation

```sh
git clone https://github.com/yohannesf/DODO && cd DODO
docker compose up --build -d
```

This starts the DODO server (API + web app), PostgreSQL 16 with PostGIS, and
Caddy on port 8080 (`HTTP_PORT` to change). On first boot a superuser
`admin` is created with the password from `DODO_ADMIN_PASSWORD`
(default `admin` — **change it immediately** under Configure → Users).

Key environment variables (`.env`, see `.env.example`):

| Variable                          | Purpose                                               |
| --------------------------------- | ----------------------------------------------------- |
| `POSTGRES_PASSWORD`               | database password                                     |
| `DODO_ADMIN_PASSWORD`             | first-boot superuser password                         |
| `JWT_SECRET`                      | access-token signing secret — set a long random value |
| `LOGIN_RATE_LIMIT` / `RATE_LIMIT` | per-IP request limits per minute                      |

To load the demo WASH configuration with 18 months of sample data:

```sh
pnpm --filter @dodo/server seed
```

## Configuration order

1. **Programs** — the project container: name/code plus status
   (draft/active/closed/suspended), currency, fiscal-year start month,
   start/end dates, and **custom metadata fields** (donor, grant code,
   region…) defined per programme under Configure → Programs → Fields.
2. **Org units** — create the hierarchy top-down (country → region → site),
   or paste a CSV (`code,name,short_name,parent_code,opening_date,latitude,longitude`)
   with a dry-run report before anything is written. Boundaries and facility
   points can be imported from GeoJSON (matched by `code`) or by **selective
   shapefile import**: upload `.shp` + `.dbf`, review the paginated feature
   checklist, and apply only the features you want as org units. The full
   feature set is kept so you can re-open the import and add more later.
3. **Disaggregation** — categories (Sex, Age band…) with options, then
   category combos. The builder previews the exact entry-grid columns with
   the same code the server uses to materialise them. Options can **nest**
   (a parent option with children) for service-ladder breakdowns such as
   SDG 6.1.1; the entry grid renders the tree when depth > 1.
4. **Data elements** — the atomic things collected, each with a value type,
   aggregation operation (`sum` for flows, `last` for stocks such as
   "functional water points"), and optional disaggregation. Use the
   **Evidence** action to require supporting media — photo, video, audio,
   document, GPS, or signature — as required or optional per element.
5. **Datasets** — collection forms: pick data elements, group them into
   sections, set required flags, choose the reporting frequency, and assign
   org units (subtree select). Enable approval and set the number of levels
   if submissions need sign-off.
6. **Indicators** — formulas over data element codes:
   `#{DE-CODE}` aggregates the element, `#{DE-CODE.OPTION-CODE}` narrows to
   combos containing a category option. Test-evaluate against live data
   before saving.
7. **Frameworks** — one or more results frameworks per programme (USAID, BMGF,
   internal…) under Configure → Frameworks. For each: name the levels, build
   the node tree, and assign indicators to nodes — an indicator can sit in
   several frameworks at once. Per mapping you can set a **disaggregation
   filter** (e.g. USAID sees Sex only, BMGF the full breakdown) so the same
   collected data satisfies multiple donor reports without duplicate entry.
   Targets can be set per framework mapping; the Framework page shows a RAG
   dot against each framework's own target.
8. **RAG thresholds** _(optional)_ — configurable red/amber/green bands at
   program, framework, indicator, or category-option scope; the most specific
   match wins, defaulting to green ≥ 80 % and amber ≥ 50 % of target. Status is
   computed server-side after each sync and on demand
   (`POST /api/analytics/rag/recalculate`).
9. **Validation rules** — `left expression <op> right expression` with
   severity. Warnings require an explanation at completion; errors block it.
   Rules run during entry on the device and again on the server.
10. **Users & roles** — accounts with role-based permissions and org-unit
    scopes (`data_entry` and/or `data_view`). A user only syncs and sees the
    subtree they are scoped to.

The whole configuration exports/imports as one `metadata.json` bundle
(Configure → Overview) for sharing between instances.

## Operations

- **Review & Approve** — scope-filtered queue of completed submissions with
  the approval chain progress; approve or reject with comments.
- **Configure → Operations** — device fleet (last seen per device, lag
  flags), the data value audit trail, and webhooks (signed JSON POSTs on
  submission events).
- **Exports** — `/api/export/org-units.csv` (round-trips through the CSV
  importer), `/api/export/data-values.csv` and `.xlsx`.
- **Backups** — `pg_dump` the database; the metadata bundle export doubles
  as a logical configuration backup.

## Export templates

Configure → Export templates builds donor and internal exports without code:

- **Generated** templates produce an Excel/CSV/JSON file from field mappings,
  with an optional RAG column.
- **Donor** templates fill the donor's own `.xlsx`: upload it, then map DODO
  fields to fixed cells (e.g. `data_value.value → C5`); the engine writes those
  cells and leaves the rest of their layout intact.
- **Run now** generates a file immediately (jobs run in-process); the history
  list keeps each run with a download link until it expires.
- **Scheduled exports** (monthly/quarterly/annual) run server-side via a
  per-minute cron tick; each run advances its next-run date.

## API access

Configure → API keys issues bearer keys for external consumers (a BI tool, a
donor dashboard). Each key:

- is shown **once** at creation (only its hash is stored — copy it then);
- carries an access level (`read` or `read_write`) and an optional endpoint
  allow-list and per-hour rate limit;
- can be scoped to a single programme (so e.g. `GET /api/analytics/rag` returns
  only that programme's data).

Callers send `Authorization: Bearer dodo_…`. Revoke a key by deleting it.

## Upgrading from v0.1.0

The v0.2.0 schema migrations are additive and apply automatically on start (or
`pnpm --filter @dodo/server migrate`). The one manual step is the results-
framework move — run it once, when you are ready to adopt the multi-framework
model:

```sh
pnpm --filter @dodo/server migrate:rf
```

It copies every `results_framework`/`rf_node` into the new `framework` tables,
verifies the counts, and renames the old tables `_deprecated_*` (kept for one
release, dropped in v0.3.0). It is safe to re-run — a no-op once done. Take a
`pg_dump` first, as with any migration.

## Maps

Org unit geometry renders offline from each device's local mirror. For a
basemap, self-host a [protomaps](https://protomaps.com) PMTiles extract and
paste its URL on the Maps page; field devices can download it once for
offline use. Protomaps data is ODbL — the attribution control is built in.
