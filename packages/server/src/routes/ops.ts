// Approvals, audit, exports, device fleet (spec §7.1, M6).
import type { FastifyInstance } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import { dataValueAudit } from '../db/schema.js';
import { act, history, listPending } from '../services/approvals.js';
import {
  exportDataValuesCsv,
  exportDataValuesXlsx,
  exportOrgUnitsCsv,
} from '../services/exports.js';

const actSchema = z.object({ comment: z.string().max(2000).default('') });
const idParam = z.object({ id: z.string().uuid() });

export function registerOpsRoutes(app: FastifyInstance, db: Db) {
  const approvalsGuard = { preHandler: app.requirePermission('approvals:act') };

  app.get('/api/approvals', approvalsGuard, async (req) =>
    listPending(db, req.authUser!),
  );
  app.post('/api/approvals/:id/approve', approvalsGuard, async (req) => {
    const { id } = idParam.parse(req.params);
    const { comment } = actSchema.parse(req.body ?? {});
    return act(db, req.authUser!, id, 'approved', comment);
  });
  app.post('/api/approvals/:id/reject', approvalsGuard, async (req) => {
    const { id } = idParam.parse(req.params);
    const { comment } = actSchema.parse(req.body ?? {});
    return act(db, req.authUser!, id, 'rejected', comment);
  });
  app.get('/api/approvals/:id/history', approvalsGuard, async (req) => {
    const { id } = idParam.parse(req.params);
    return history(db, id);
  });

  // audit trail (spec M6) — most recent first
  app.get(
    '/api/data/audit',
    { preHandler: app.requirePermission('system:admin', 'approvals:act') },
    async (req) => {
      const q = z.object({ dataValueId: z.string().uuid().optional() }).parse(req.query);
      const where = q.dataValueId
        ? eq(dataValueAudit.dataValueId, q.dataValueId)
        : undefined;
      return db
        .select()
        .from(dataValueAudit)
        .where(where)
        .orderBy(desc(dataValueAudit.ts))
        .limit(200);
    },
  );

  const exportGuard = { preHandler: app.requirePermission('data:read') };
  app.get('/api/export/org-units.csv', exportGuard, async (_req, reply) => {
    reply.type('text/csv');
    return exportOrgUnitsCsv(db);
  });
  app.get('/api/export/data-values.csv', exportGuard, async (_req, reply) => {
    reply.type('text/csv');
    return exportDataValuesCsv(db);
  });
  app.get('/api/export/data-values.xlsx', exportGuard, async (_req, reply) => {
    reply.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return exportDataValuesXlsx(db);
  });
}
