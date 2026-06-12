import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pushRequestSchema, SYNC_COLLECTIONS } from '@dodo/shared';
import type { Db } from '../db/index.js';
import { ensureValidCursor, pull, push, syncStatus } from '../services/sync.js';

const pullQuerySchema = z.object({
  cursor: z.string().optional(),
  collections: z.string().optional(),
});

export function registerSyncRoutes(app: FastifyInstance, db: Db) {
  app.get(
    '/api/sync/pull',
    { preHandler: app.requirePermission('data:read') },
    async (req) => {
      const q = pullQuerySchema.parse(req.query);
      const cursor = ensureValidCursor(q.cursor);
      const collections = q.collections
        ? z
            .array(z.enum(SYNC_COLLECTIONS))
            .parse(q.collections.split(',').filter(Boolean))
        : undefined;
      return pull(db, req.authUser!, cursor, collections);
    },
  );

  app.post(
    '/api/sync/push',
    { preHandler: app.requirePermission('data:write') },
    async (req) => {
      const { deviceId, ops } = pushRequestSchema.parse(req.body);
      return { results: await push(db, req.authUser!, deviceId, ops) };
    },
  );

  app.get(
    '/api/sync/status',
    { preHandler: app.requirePermission('system:admin') },
    async () => syncStatus(db),
  );
}
