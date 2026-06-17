// /api/admin — instance/program administration (spec §16.5). API-key
// management requires users:manage; an API key itself can never reach here
// (its derived permissions never include users:manage).
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { apiKeyInputSchema, uuidv7 } from '@dodo/shared';
import type { Db } from '../db/index.js';
import { apiKey } from '../db/schema.js';
import { generateRawKey, hashKey } from '../services/api-keys.js';

const idParam = z.object({ id: z.string().uuid() });

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
}
