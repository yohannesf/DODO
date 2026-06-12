import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { ZodError } from 'zod';
import { healthResponseSchema } from '@dodo/shared';
import type { Db } from './db/index.js';
import { checkHealth, type HealthDeps } from './services/health.js';
import { registerMetadataRoutes } from './routes/metadata.js';
import { registerAuthRoutes } from './routes/auth.js';
import { authPlugin } from './plugins/auth.js';
import { AppError } from './lib/errors.js';

export interface AppOptions {
  health: HealthDeps;
  db?: Db;
  jwtSecret?: string;
  /** Absolute path to the built SPA; when set the server also serves it. */
  webDistDir?: string;
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
    await app.register(authPlugin, {
      jwtSecret: opts.jwtSecret ?? 'dodo-dev-secret-not-for-production',
    });
    registerAuthRoutes(app, opts.db);
    registerMetadataRoutes(app, opts.db);
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
