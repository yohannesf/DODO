# DODO — Data Online, Data Offline

Open-source (MIT) offline-first indicator data collection and M&E platform.

Field users enter indicator data in their browser; data is stored locally on
the device and synchronized to the server when connectivity returns. See
[docs/DODO-SPEC.md](docs/DODO-SPEC.md) for the full specification.

## Repository layout

```
packages/shared    zod schemas, types, period logic, formula engine
packages/server    fastify app, drizzle schema, migrations
packages/web       vite react pwa
e2e/               playwright, incl. offline scenarios
```

## Development

Requires Node 22 and pnpm 11.

```sh
pnpm install
pnpm dev          # server + web dev servers
pnpm test         # unit tests
pnpm e2e          # playwright offline suite
```

## Deployment

```sh
docker compose up --build
```

Brings up the DODO server (API + built SPA), PostgreSQL 16 + PostGIS, and
Caddy. See [docker-compose.yml](docker-compose.yml).

## License

MIT — see [LICENSE](LICENSE).
