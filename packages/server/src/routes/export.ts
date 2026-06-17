// /api/export (spec §16.12 / §17). Templates + mappings are config
// (metadata:write); jobs run in-process on create and stream their file back
// (data:read — exporting reads data). Server-only; nothing here is synced.
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  exportJobInputSchema,
  exportTemplateInputSchema,
  exportTemplateMappingInputSchema,
  scheduledExportInputSchema,
  uuidv7,
} from '@dodo/shared';
import type { Db } from '../db/index.js';
import {
  exportJob,
  exportTemplate,
  exportTemplateMapping,
  scheduledExport,
} from '../db/schema.js';
import { makeCrud } from '../services/metadata/crud.js';
import { runExportJob } from '../services/export.js';
import { badRequest, notFound } from '../lib/errors.js';

const idParam = z.object({ id: z.string().uuid() });

export function registerExportRoutes(app: FastifyInstance, db: Db, filesDir: string) {
  const read = { preHandler: app.requirePermission('data:read') };
  const write = { preHandler: app.requirePermission('metadata:write') };
  const templates = makeCrud(exportTemplate, 'export template');

  // --- templates ---
  app.get('/api/export/templates', read, async () => templates.list(db));
  app.post('/api/export/templates', write, async (req, reply) => {
    const input = exportTemplateInputSchema.parse(req.body);
    const row = await templates.create(db, input as never, req.authUser?.id);
    return reply.code(201).send(row);
  });
  app.put('/api/export/templates/:id', write, async (req) => {
    const { id } = idParam.parse(req.params);
    const patch = exportTemplateInputSchema.partial().parse(req.body);
    return templates.update(db, id, patch as never, req.authUser?.id);
  });
  app.delete('/api/export/templates/:id', write, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    await templates.softDelete(db, id, req.authUser?.id);
    return reply.code(204).send();
  });

  // --- template mappings (append-only) ---
  app.get('/api/export/template-mappings', read, async () =>
    db.select().from(exportTemplateMapping),
  );
  app.post('/api/export/template-mappings', write, async (req, reply) => {
    const input = exportTemplateMappingInputSchema.parse(req.body);
    const [row] = await db
      .insert(exportTemplateMapping)
      .values({ ...input, id: uuidv7() })
      .returning();
    return reply.code(201).send(row);
  });
  app.delete('/api/export/template-mappings/:id', write, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    await db.delete(exportTemplateMapping).where(eq(exportTemplateMapping.id, id));
    return reply.code(204).send();
  });

  // --- jobs (created + run in-process) ---
  app.post('/api/export/jobs', read, async (req, reply) => {
    const input = exportJobInputSchema.parse(req.body);
    const [tpl] = await db
      .select()
      .from(exportTemplate)
      .where(eq(exportTemplate.id, input.templateId));
    if (!tpl) throw notFound('export template');
    const id = uuidv7();
    await db.insert(exportJob).values({
      id,
      templateId: input.templateId,
      programId: tpl.programId,
      status: 'queued',
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      locationScope: input.locationScope,
      frameworkScope: input.frameworkScope,
      requestedBy: req.authUser?.id ?? null,
    });
    await runExportJob(db, id, filesDir);
    const [job] = await db.select().from(exportJob).where(eq(exportJob.id, id));
    return reply.code(201).send(job);
  });
  app.get('/api/export/jobs/:id', read, async (req) => {
    const { id } = idParam.parse(req.params);
    const [job] = await db.select().from(exportJob).where(eq(exportJob.id, id));
    if (!job) throw notFound('export job');
    return job;
  });
  app.get('/api/export/jobs/:id/download', read, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const [job] = await db.select().from(exportJob).where(eq(exportJob.id, id));
    if (!job || !job.fileRef) throw notFound('export file');
    if (job.expiresAt && new Date(job.expiresAt).getTime() < Date.now()) {
      throw badRequest('export has expired');
    }
    const full = path.join(filesDir, path.basename(job.fileRef));
    if (!fs.existsSync(full)) throw notFound('export file');
    return reply.send(fs.createReadStream(full));
  });

  // --- scheduled exports ---
  app.get('/api/export/scheduled', read, async () => db.select().from(scheduledExport));
  app.post('/api/export/scheduled', write, async (req, reply) => {
    const input = scheduledExportInputSchema.parse(req.body);
    const [tpl] = await db
      .select()
      .from(exportTemplate)
      .where(eq(exportTemplate.id, input.templateId));
    if (!tpl) throw notFound('export template');
    const [row] = await db
      .insert(scheduledExport)
      .values({
        id: uuidv7(),
        templateId: input.templateId,
        programId: tpl.programId,
        frequency: input.frequency,
        nextRunAt: input.nextRunAt,
        deliveryMethod: input.deliveryMethod,
        deliveryConfig: input.deliveryConfig,
        createdBy: req.authUser?.id ?? null,
      })
      .returning();
    return reply.code(201).send(row);
  });
  app.delete('/api/export/scheduled/:id', write, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    await db.delete(scheduledExport).where(eq(scheduledExport.id, id));
    return reply.code(204).send();
  });
}
