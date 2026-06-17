// API keys (spec §16.5). Raw key shown once; only its sha256 hash is stored.
// In-memory sliding-window rate limiter per key (good enough for v0.2.0).
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { apiKey } from '../db/schema.js';

const KEY_PREFIX = 'dodo_';

export function isApiKey(token: string): boolean {
  return token.startsWith(KEY_PREFIX);
}

export function generateRawKey(): string {
  return KEY_PREFIX + crypto.randomBytes(32).toString('base64url');
}

export function hashKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export async function lookupApiKey(db: Db, rawKey: string) {
  const [row] = await db
    .select()
    .from(apiKey)
    .where(eq(apiKey.keyHash, hashKey(rawKey)));
  return row ?? null;
}

const hits = new Map<string, number[]>();

/** false when the key has exhausted its requests-per-hour budget. */
export function rateLimitOk(keyId: string, perHour: number | null): boolean {
  if (perHour == null) return true;
  const windowStart = Date.now() - 3_600_000;
  const recent = (hits.get(keyId) ?? []).filter((t) => t > windowStart);
  if (recent.length >= perHour) {
    hits.set(keyId, recent);
    return false;
  }
  recent.push(Date.now());
  hits.set(keyId, recent);
  return true;
}

/** test/maintenance hook — drop the in-memory rate-limit state. */
export function resetRateLimiter(): void {
  hits.clear();
}
