import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { healthResponseSchema } from '@dodo/shared';
import { checkHealth, type HealthDeps } from './services/health.js';

export interface AppOptions {
  health: HealthDeps;
  /** Absolute path to the built SPA; when set the server also serves it. */
  webDistDir?: string;
  logger?: boolean;
}

export async function buildApp(opts: AppOptions) {
  const app = Fastify({ logger: opts.logger ?? true });

  app.get('/api/health', async () => {
    return healthResponseSchema.parse(await checkHealth(opts.health));
  });

  if (opts.webDistDir && fs.existsSync(opts.webDistDir)) {
    await app.register(fastifyStatic, { root: opts.webDistDir });
    // SPA fallback: unknown non-API GET routes serve the app shell.
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) {
        return reply.type('text/html').send(
          fs.createReadStream(path.join(opts.webDistDir as string, 'index.html')),
        );
      }
      return reply.code(404).send({ error: 'not found' });
    });
  }

  return app;
}
