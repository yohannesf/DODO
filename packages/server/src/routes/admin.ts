// /api/admin — instance/program administration (spec §16.5). API-key
// management requires users:manage; an API key itself can never reach here
// (its derived permissions never include users:manage).
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { apiKeyInputSchema, shapefileApplyBodySchema, uuidv7 } from '@dodo/shared';
import type { Db } from '../db/index.js';
import { apiKey, shapefileImport } from '../db/schema.js';
import { generateRawKey, hashKey } from '../services/api-keys.js';
import {
  featureGeometry,
  featureName,
  shapefileToGeoJson,
  type ShapefileFeatureCollection,
} from '../services/shapefile.js';
import { createOrgUnit } from '../services/metadata/org-units.js';
import { badRequest, notFound } from '../lib/errors.js';

const idParam = z.object({ id: z.string().uuid() });

// shapefile_import row as returned by the API — raw_features stripped (large)
function importPublic(row: typeof shapefileImport.$inferSelect) {
  const { rawFeatures: _rf, importedBy: _by, ...rest } = row;
  return { ...rest, featureCount: (_rf as ShapefileFeatureCollection).features.length };
}

const featuresQuery = z.object({
  page: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});

// never expose key_hash (or the internal created_by) over the API
function publicRow(row: typeof apiKey.$inferSelect) {
  const { keyHash: _hash, createdBy: _by, ...rest } = row;
  return rest;
}

export function registerAdminRoutes(app: FastifyInstance, db: Db) {
  const admin = { preHandler: app.requirePermission('users:manage') };

  app.get('/api/admin/api-keys', admin, async () => {
    const rows = await db.select().from(apiKey);
    return rows.map(publicRow);
  });

  app.post('/api/admin/api-keys', admin, async (req, reply) => {
    const input = apiKeyInputSchema.parse(req.body);
    const rawKey = generateRawKey();
    const [row] = await db
      .insert(apiKey)
      .values({
        id: uuidv7(),
        keyHash: hashKey(rawKey),
        name: input.name,
        programId: input.programId,
        accessLevel: input.accessLevel,
        allowedEndpoints: input.allowedEndpoints,
        rateLimitRph: input.rateLimitRph,
        webhookUrl: input.webhookUrl,
        webhookEvents: input.webhookEvents,
        expiresAt: input.expiresAt,
        createdBy: req.authUser?.id ?? null,
      })
      .returning();
    // the raw key is shown exactly once
    return reply.code(201).send({ ...publicRow(row!), rawKey });
  });

  app.delete('/api/admin/api-keys/:id', admin, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    await db.delete(apiKey).where(eq(apiKey.id, id));
    return reply.code(204).send();
  });

  // --- shapefile imports (spec §16.6) ---------------------------------------

  // Upload .shp (+ .dbf, .prj) as separate multipart file parts plus the
  // programId / orgUnitLevel fields. All features are converted and preserved.
  app.post('/api/admin/shapefile-imports', admin, async (req, reply) => {
    let shp: Buffer | null = null;
    let dbf: Buffer | null = null;
    let programId = '';
    let orgUnitLevel = 1;
    let fileName = 'import.shp';
    for await (const part of req.parts()) {
      if (part.type === 'file') {
        const buf = await part.toBuffer();
        if (part.fieldname === 'shp') {
          shp = buf;
          fileName = part.filename ?? fileName;
        } else if (part.fieldname === 'dbf') {
          dbf = buf;
        }
      } else if (part.fieldname === 'programId') {
        programId = String(part.value);
      } else if (part.fieldname === 'orgUnitLevel') {
        orgUnitLevel = Number(part.value);
      }
    }
    if (!shp) throw badRequest('expected a .shp file part named "shp"');
    if (!programId) throw badRequest('programId field is required');

    try {
      const fc = await shapefileToGeoJson(shp, dbf ?? undefined);
      const [row] = await db
        .insert(shapefileImport)
        .values({
          id: uuidv7(),
          programId,
          orgUnitLevel,
          fileName,
          fileRef: fileName,
          rawFeatures: fc,
          status: 'complete',
          importedBy: req.authUser?.id ?? null,
        })
        .returning();
      return reply.code(201).send(importPublic(row!));
    } catch (err) {
      const [row] = await db
        .insert(shapefileImport)
        .values({
          id: uuidv7(),
          programId,
          orgUnitLevel,
          fileName,
          fileRef: fileName,
          rawFeatures: { type: 'FeatureCollection', features: [] },
          status: 'failed',
          errorLog: { message: err instanceof Error ? err.message : String(err) },
          importedBy: req.authUser?.id ?? null,
        })
        .returning();
      return reply.code(201).send(importPublic(row!));
    }
  });

  app.get('/api/admin/shapefile-imports/:id/features', admin, async (req) => {
    const { id } = idParam.parse(req.params);
    const q = featuresQuery.parse(req.query);
    const [imp] = await db
      .select()
      .from(shapefileImport)
      .where(eq(shapefileImport.id, id));
    if (!imp) throw notFound('shapefile import');
    const all = (imp.rawFeatures as ShapefileFeatureCollection).features ?? [];
    const start = q.page * q.pageSize;
    const features = all.slice(start, start + q.pageSize).map((f, i) => ({
      index: start + i,
      name: featureName(f.properties, start + i),
      geometryType: f.geometry?.type ?? null,
      properties: f.properties,
    }));
    return { total: all.length, page: q.page, pageSize: q.pageSize, features };
  });

  app.post('/api/admin/shapefile-imports/:id/apply', admin, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = shapefileApplyBodySchema.parse(req.body);
    const [imp] = await db
      .select()
      .from(shapefileImport)
      .where(eq(shapefileImport.id, id));
    if (!imp) throw notFound('shapefile import');
    const all = (imp.rawFeatures as ShapefileFeatureCollection).features ?? [];

    let created = 0;
    for (const idx of body.selectedIds) {
      const f = all[idx];
      if (!f) continue;
      const name = featureName(f.properties, idx);
      await createOrgUnit(
        db,
        {
          name,
          shortName: name.slice(0, 60),
          code: `IMP-${id.slice(0, 8)}-${idx}`,
          parentId: body.parentId ?? null,
          openingDate: null,
          closedDate: null,
          geometry: featureGeometry(f.geometry),
          attributes: { shapefileImportId: id, featureIndex: idx },
        },
        req.authUser?.id,
      );
      created++;
    }
    await db
      .update(shapefileImport)
      .set({ nodesCreated: (imp.nodesCreated ?? 0) + created })
      .where(eq(shapefileImport.id, id));
    return reply.code(200).send({ created });
  });
}
