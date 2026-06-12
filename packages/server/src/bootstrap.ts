import { isNull } from 'drizzle-orm';
import { hash } from '@node-rs/argon2';
import { uuidv7 } from '@dodo/shared';
import type { Db } from './db/index.js';
import { user, userRole } from './db/schema.js';

const SUPERUSER_ROLE_ID = '019754a0-0000-7000-8000-000000000001';

/**
 * First-boot superuser (full setup wizard arrives in M7): when no users
 * exist, create `admin` with DODO_ADMIN_PASSWORD (default `admin` — change
 * it immediately on real deployments).
 */
export async function bootstrapAdmin(
  db: Db,
  password = process.env.DODO_ADMIN_PASSWORD ?? 'admin',
): Promise<boolean> {
  const existing = await db
    .select({ id: user.id })
    .from(user)
    .where(isNull(user.deletedAt))
    .limit(1);
  if (existing.length > 0) return false;

  const id = uuidv7();
  await db.insert(user).values({
    id,
    username: 'admin',
    displayName: 'Administrator',
    passwordHash: await hash(password, {
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    }),
  });
  await db.insert(userRole).values({ userId: id, roleId: SUPERUSER_ROLE_ID });
  console.warn('bootstrapped superuser "admin" — change its password before going live');
  return true;
}
