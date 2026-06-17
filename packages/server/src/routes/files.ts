// /api/files + /api/media-files (spec §16.3, ADR 004). Built from scratch —
// M7 never shipped a files endpoint. Local-filesystem storage; no server-side
// image compression in v0.2.0 (deferred to avoid a native image dependency).
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { mediaFileInputSchema, uuidv7 } from '@dodo/shared';
import type { Db } from '../db/index.js';
import { mediaFile } from '../db/schema.js';
import { badRequest } from '../lib/errors.js';

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/webm': 'weba',
  'application/pdf': 'pdf',
};

// refs are always "<uuidv7>.<ext>" — the pattern rules out path separators and
// traversal; basename() is a second guard.
const refParam = z.object({ ref: z.string().regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/) });

export function registerFilesRoutes(app: FastifyInstance, db: Db, filesDir: string) {
  fs.mkdirSync(filesDir, { recursive: true });
  const write = { preHandler: app.requirePermission('data:write') };
  const read = { preHandler: app.requirePermission('data:read') };

  // Step 1 of the two-step push: store the uploaded file, return its ref.
  app.post('/api/files', write, async (req, reply) => {
    const part = await req.file();
    if (!part) throw badRequest('expected a multipart file field');
    const buf = await part.toBuffer();
    const extFromName = path
      .extname(part.filename ?? '')
      .replace('.', '')
      .toLowerCase();
    const ext = extFromName || EXT_BY_MIME[part.mimetype] || 'bin';
    const ref = `${uuidv7()}.${ext}`;
    await fs.promises.writeFile(path.join(filesDir, ref), buf);
    return reply.code(201).send({
      fileRef: ref,
      // no separate thumbnail in v0.2.0 (ADR 004)
      thumbnailRef: ref,
      fileName: part.filename ?? ref,
      fileSizeKb: Math.max(1, Math.ceil(buf.length / 1024)),
      mimeType: part.mimetype,
    });
  });

  app.get('/api/files/:ref', read, async (req, reply) => {
    const { ref } = refParam.parse(req.params);
    const full = path.join(filesDir, path.basename(ref));
    if (!fs.existsSync(full)) return reply.code(404).send({ error: 'not found' });
    return reply.send(fs.createReadStream(full));
  });

  // Step 2: persist the media_file row the client generated. Idempotent on the
  // client UUIDv7 id so a retried push is safe.
  app.post('/api/media-files', write, async (req, reply) => {
    const input = mediaFileInputSchema.parse(req.body);
    await db
      .insert(mediaFile)
      .values({
        ...input,
        uploadedBy: req.authUser?.id ?? null,
        syncStatus: 'synced',
        syncedAt: sql`now()`,
      })
      .onConflictDoNothing();
    const [row] = await db.select().from(mediaFile).where(eq(mediaFile.id, input.id));
    return reply.code(201).send(row);
  });

  app.get('/api/media-files', read, async (req) => {
    const q = z
      .object({
        dataValueId: z.string().uuid().optional(),
        submissionId: z.string().uuid().optional(),
      })
      .parse(req.query);
    const rows = await db.select().from(mediaFile);
    return rows.filter(
      (r) =>
        (!q.dataValueId || r.dataValueId === q.dataValueId) &&
        (!q.submissionId || r.submissionId === q.submissionId),
    );
  });
}
