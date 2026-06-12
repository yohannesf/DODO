import { createHash, randomBytes } from 'node:crypto';
import { and, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { verify } from '@node-rs/argon2';
import { type AuthUser, type Permission } from '@dodo/shared';
import type { Db } from '../db/index.js';
import { role, session, user, userOrgUnits, userRole } from '../db/schema.js';
import { AppError } from '../lib/errors.js';

export const SESSION_TTL_DAYS = 30;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function buildAuthUser(db: Db, userId: string): Promise<AuthUser> {
  const users = await db
    .select()
    .from(user)
    .where(and(eq(user.id, userId), isNull(user.deletedAt)));
  const u = users[0];
  if (!u || u.disabled) throw new AppError(401, 'unauthorized');

  const roleLinks = await db
    .select({ roleId: userRole.roleId })
    .from(userRole)
    .where(eq(userRole.userId, userId));
  const permissions = new Set<string>();
  if (roleLinks.length > 0) {
    const roles = await db
      .select({ permissions: role.permissions })
      .from(role)
      .where(
        and(
          inArray(
            role.id,
            roleLinks.map((r) => r.roleId),
          ),
          isNull(role.deletedAt),
        ),
      );
    for (const r of roles) for (const p of r.permissions) permissions.add(p);
  }
  const scopes = await db
    .select({ orgUnitId: userOrgUnits.orgUnitId, scope: userOrgUnits.scope })
    .from(userOrgUnits)
    .where(eq(userOrgUnits.userId, userId));

  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    locale: u.locale,
    permissions: [...permissions] as Permission[],
    orgUnits: scopes,
  };
}

export interface LoginMeta {
  ip?: string;
  userAgent?: string;
}

export async function login(
  db: Db,
  username: string,
  password: string,
  meta: LoginMeta = {},
): Promise<{ sessionToken: string; authUser: AuthUser }> {
  const users = await db
    .select()
    .from(user)
    .where(and(eq(user.username, username), isNull(user.deletedAt)));
  const u = users[0];
  // verify against a dummy hash when the user is unknown — uniform timing
  const hash =
    u?.passwordHash ??
    '$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const ok = await verify(hash, password).catch(() => false);
  if (!u || u.disabled || !ok) throw new AppError(401, 'invalid credentials');

  const sessionToken = randomBytes(32).toString('hex');
  await db.insert(session).values({
    id: hashToken(sessionToken),
    userId: u.id,
    expiresAt: new Date(Date.now() + SESSION_TTL_DAYS * 24 * 3600 * 1000).toISOString(),
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return { sessionToken, authUser: await buildAuthUser(db, u.id) };
}

export async function resolveSession(db: Db, sessionToken: string): Promise<AuthUser> {
  const rows = await db
    .select()
    .from(session)
    .where(eq(session.id, hashToken(sessionToken)));
  const s = rows[0];
  if (!s || new Date(s.expiresAt).getTime() < Date.now()) {
    throw new AppError(401, 'session expired');
  }
  return buildAuthUser(db, s.userId);
}

export async function revokeSession(db: Db, sessionToken: string): Promise<void> {
  await db.delete(session).where(eq(session.id, hashToken(sessionToken)));
}

export async function pruneExpiredSessions(db: Db): Promise<void> {
  await db.delete(session).where(lt(session.expiresAt, sql`now()`));
}
