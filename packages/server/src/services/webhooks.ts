// Webhooks (spec §7.1): admin-configured POST on events, fire-and-forget
// with an HMAC signature so receivers can verify authenticity.
import { createHmac } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { webhook } from '../db/schema.js';

export async function fireWebhooks(
  db: Db,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const hooks = await db
    .select()
    .from(webhook)
    .where(and(eq(webhook.active, true), isNull(webhook.deletedAt)));
  const body = JSON.stringify({ event, payload, firedAt: new Date().toISOString() });

  await Promise.allSettled(
    hooks
      .filter((h) => h.events.includes(event))
      .map(async (h) => {
        const headers: Record<string, string> = {
          'content-type': 'application/json',
          'x-dodo-event': event,
        };
        if (h.secret) {
          headers['x-dodo-signature'] = createHmac('sha256', h.secret)
            .update(body)
            .digest('hex');
        }
        let status = 0;
        try {
          const res = await fetch(h.url, {
            method: 'POST',
            headers,
            body,
            signal: AbortSignal.timeout(10_000),
          });
          status = res.status;
        } catch {
          status = -1; // unreachable
        }
        await db
          .update(webhook)
          .set({ lastStatus: status, lastFiredAt: sql`now()` })
          .where(eq(webhook.id, h.id));
      }),
  );
}
