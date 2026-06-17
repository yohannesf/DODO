import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  HOST: z.string().default('0.0.0.0'),
  // 5433 = the docker-compose db's host-mapped port
  DATABASE_URL: z.string().default('postgres://dodo:dodo@localhost:5433/dodo'),
  // Absolute path to the built SPA; when unset the server is API-only (dev).
  WEB_DIST_DIR: z.string().optional(),
  // HS256 secret for access tokens; the default is for development only.
  JWT_SECRET: z.string().min(16).default('dodo-dev-secret-not-for-production'),
  // per-minute login attempts per IP (raised in test harnesses)
  LOGIN_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  // per-minute requests per IP across the API
  RATE_LIMIT: z.coerce.number().int().positive().default(600),
  // where uploaded evidence files are stored (spec §16.3, ADR 004); maps to
  // "object storage" for v0.2.0. Default under the OS temp dir for dev/tests.
  FILES_DIR: z.string().default(path.join(os.tmpdir(), 'dodo-files')),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return envSchema.parse(env);
}
