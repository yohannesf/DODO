import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export function createPool(connectionString: string): pg.Pool {
  const pool = new pg.Pool({ connectionString, max: 10 });
  // An idle client can emit 'error' when the backend drops its connection
  // (Postgres restart, container teardown in tests, network blip). With no
  // listener pg escalates this to an unhandled exception that crashes the
  // process; log it and let the pool re-establish on the next checkout.
  pool.on('error', (err) => {
    console.error('postgres idle client error:', err.message);
  });
  return pool;
}

export function createDb(pool: pg.Pool) {
  return drizzle(pool, { schema });
}

export type Db = ReturnType<typeof createDb>;
