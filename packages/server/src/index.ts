import { setTimeout as sleep } from 'node:timers/promises';
import { buildApp } from './app.js';
import { bootstrapAdmin } from './bootstrap.js';
import { loadConfig } from './config.js';
import { createDb, createPool } from './db/index.js';
import { runMigrations } from './migrate.js';

const config = loadConfig();

// In docker-compose the database may accept connections a few seconds after
// the server container starts; retry instead of crash-looping.
async function migrateWithRetry(attempts = 30): Promise<void> {
  for (let i = 1; ; i++) {
    try {
      await runMigrations(config.DATABASE_URL);
      return;
    } catch (err) {
      if (i >= attempts) throw err;
      console.error(`migration attempt ${i} failed, retrying in 2s`, err);
      await sleep(2000);
    }
  }
}

await migrateWithRetry();

const pool = createPool(config.DATABASE_URL);
const db = createDb(pool);
await bootstrapAdmin(db);

const app = await buildApp({
  db,
  jwtSecret: config.JWT_SECRET,
  loginRateLimit: config.LOGIN_RATE_LIMIT,
  rateLimitMax: config.RATE_LIMIT,
  health: {
    dbPing: async () => {
      try {
        await pool.query('SELECT 1');
        return true;
      } catch {
        return false;
      }
    },
    version: process.env.DODO_VERSION ?? '0.0.0',
  },
  webDistDir: config.WEB_DIST_DIR,
  filesDir: config.FILES_DIR,
});

await app.listen({ host: config.HOST, port: config.PORT });
