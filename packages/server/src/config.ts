import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  HOST: z.string().default('0.0.0.0'),
  // 5433 = the docker-compose db's host-mapped port
  DATABASE_URL: z.string().default('postgres://dodo:dodo@localhost:5433/dodo'),
  // Absolute path to the built SPA; when unset the server is API-only (dev).
  WEB_DIST_DIR: z.string().optional(),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return envSchema.parse(env);
}
