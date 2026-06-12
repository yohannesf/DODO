// Drizzle schema. M0 ships only the migration infrastructure; domain tables
// (spec §4) arrive with M1. The initial migration enables the Postgres
// extensions the data model depends on (postgis for org-unit geometry, ltree
// for org-unit paths) — see drizzle/0000_init.sql.
export {};
