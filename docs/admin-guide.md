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

1. **Org units** — create the hierarchy top-down (country → region → site),
   or paste a CSV (`code,name,short_name,parent_code,opening_date,latitude,longitude`)
   with a dry-run report before anything is written. Boundaries and facility
   points can be imported from GeoJSON, matched by `code`.
2. **Disaggregation** — categories (Sex, Age band…) with options, then
   category combos. The builder previews the exact entry-grid columns with
   the same code the server uses to materialise them.
3. **Data elements** — the atomic things collected, each with a value type,
   aggregation operation (`sum` for flows, `last` for stocks such as
   "functional water points"), and optional disaggregation.
4. **Datasets** — collection forms: pick data elements, group them into
   sections, set required flags, choose the reporting frequency, and assign
   org units (subtree select). Enable approval and set the number of levels
   if submissions need sign-off.
5. **Indicators** — formulas over data element codes:
   `#{DE-CODE}` aggregates the element, `#{DE-CODE.OPTION-CODE}` narrows to
   combos containing a category option. Test-evaluate against live data
   before saving.
6. **Validation rules** — `left expression <op> right expression` with
   severity. Warnings require an explanation at completion; errors block it.
   Rules run during entry on the device and again on the server.
7. **Users & roles** — accounts with role-based permissions and org-unit
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

## Maps

Org unit geometry renders offline from each device's local mirror. For a
basemap, self-host a [protomaps](https://protomaps.com) PMTiles extract and
paste its URL on the Maps page; field devices can download it once for
offline use. Protomaps data is ODbL — the attribution control is built in.
