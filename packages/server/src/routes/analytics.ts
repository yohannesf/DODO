import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import { runAnalytics } from '../services/analytics.js';

const querySchema = z.object({
  dx: z.string().min(1),
  ou: z.string().min(1),
  pe: z.string().min(1),
  ouMode: z.enum(['selected', 'subtree']).default('selected'),
  peTotal: z.coerce.boolean().default(false),
});

export function registerAnalyticsRoutes(app: FastifyInstance, db: Db) {
  app.get(
    '/api/analytics',
    { preHandler: app.requirePermission('data:read') },
    async (req) => {
      const q = querySchema.parse(req.query);
      const split = (s: string) => s.split(';').filter(Boolean);
      return runAnalytics(db, req.authUser!, {
        dx: split(q.dx),
        ou: split(q.ou),
        pe: split(q.pe),
        ouMode: q.ouMode,
        peTotal: q.peTotal,
      });
    },
  );
}
