import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import { runAnalytics } from '../services/analytics.js';
import { getRagLog, recalculateRag } from '../services/rag.js';

const querySchema = z.object({
  dx: z.string().min(1),
  ou: z.string().min(1),
  pe: z.string().min(1),
  ouMode: z.enum(['selected', 'subtree']).default('selected'),
  peTotal: z.coerce.boolean().default(false),
});

const recalcSchema = z.object({
  indicatorId: z.string().uuid().optional(),
  programId: z.string().uuid().optional(),
});

const ragQuerySchema = z.object({
  indicator: z.string().uuid().optional(),
  period: z.string().optional(),
  orgUnit: z.string().uuid().optional(),
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

  // Configurable RAG (spec §16.4). rag_log is server-only; dashboards read it
  // here rather than via sync.
  app.post(
    '/api/analytics/rag/recalculate',
    { preHandler: app.requirePermission('data:write') },
    async (req) => {
      const body = recalcSchema.parse(req.body ?? {});
      const computed = await recalculateRag(db, req.authUser!, body);
      return { computed };
    },
  );

  app.get(
    '/api/analytics/rag',
    { preHandler: app.requirePermission('data:read') },
    async (req) => {
      const q = ragQuerySchema.parse(req.query);
      return getRagLog(db, {
        indicatorId: q.indicator,
        period: q.period,
        orgUnitId: q.orgUnit,
      });
    },
  );
}
