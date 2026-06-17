import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import multipart from '@fastify/multipart';
import { ZodError } from 'zod';
import { healthResponseSchema } from '@dodo/shared';
import type { Db } from './db/index.js';
import { checkHealth, type HealthDeps } from './services/health.js';
import { registerMetadataRoutes } from './routes/metadata.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerSyncRoutes } from './routes/sync.js';
import { registerAnalyticsRoutes } from './routes/analytics.js';
import { registerOpsRoutes } from './routes/ops.js';
import { registerFilesRoutes } from './routes/files.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerExportRoutes } from './routes/export.js';
import rateLimit from '@fastify/rate-limit';
import { authPlugin } from './plugins/auth.js';
import { AppError } from './lib/errors.js';

export interface AppOptions {
  health: HealthDeps;
  db?: Db;
  jwtSecret?: string;
  loginRateLimit?: number;
  rateLimitMax?: number;
  /** Absolute path to the built SPA; when set the server also serves it. */
  webDistDir?: string;
  /** Where uploaded evidence files are stored (spec §16.3, ADR 004). */
  filesDir?: string;
  logger?: boolean;
}

interface PgError {
  code?: string;
  constraint?: string;
}

export async function buildApp(opts: AppOptions) {
  const app = Fastify({ logger: opts.logger ?? true });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: 'validation failed',
        issues: err.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    }
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({ error: err.message });
    }
    // framework errors that carry a status (rate limit 429, body too large…)
    const upstreamStatus = (err as { statusCode?: unknown }).statusCode;
    if (typeof upstreamStatus === 'number' && upstreamStatus < 500) {
      return reply.code(upstreamStatus).send({ error: (err as Error).message });
    }
    // drizzle wraps driver errors; the pg error is on `cause`
    const pg = ((err as Error).cause ?? err) as PgError;
    if (pg.code === '23505') {
      return reply.code(409).send({
        error: 'duplicate value violates a uniqueness rule (code already in use?)',
      });
    }
    if (pg.code === '23503') {
      return reply.code(400).send({ error: 'reference to a missing related entity' });
    }
    req.log.error(err);
    return reply.code(500).send({ error: 'internal error' });
  });

  app.get('/api/health', async () => {
    return healthResponseSchema.parse(await checkHealth(opts.health));
  });

  if (opts.db) {
    // rate limiting (spec §9): tight on auth, generous elsewhere
    await app.register(rateLimit, {
      global: true,
      max: opts.rateLimitMax ?? 600,
      timeWindow: '1 minute',
    });
    await app.register(authPlugin, {
      jwtSecret: opts.jwtSecret ?? 'dodo-dev-secret-not-for-production',
      db: opts.db,
    });
    // 50 MB cap per uploaded evidence file (spec §16.10 warns >50 MB pending).
    await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });
    registerAuthRoutes(app, opts.db, opts.loginRateLimit ?? 10);
    registerMetadataRoutes(app, opts.db);
    registerSyncRoutes(app, opts.db);
    registerAnalyticsRoutes(app, opts.db);
    registerOpsRoutes(app, opts.db);
    registerAdminRoutes(app, opts.db);
    const filesDir = opts.filesDir ?? path.join(os.tmpdir(), 'dodo-files');
    registerFilesRoutes(app, opts.db, filesDir);
    registerExportRoutes(app, opts.db, filesDir);
  }

  if (opts.webDistDir && fs.existsSync(opts.webDistDir)) {
    await app.register(fastifyStatic, { root: opts.webDistDir });
    // SPA fallback: unknown non-API GET routes serve the app shell.
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) {
        return reply
          .type('text/html')
          .send(fs.createReadStream(path.join(opts.webDistDir as string, 'index.html')));
      }
      return reply.code(404).send({ error: 'not found' });
    });
  }

  return app;
}
