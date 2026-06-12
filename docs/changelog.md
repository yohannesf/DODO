# Changelog

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
