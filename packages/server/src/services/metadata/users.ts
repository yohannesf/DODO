import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { hash } from '@node-rs/argon2';
import { uuidv7, type User } from '@dodo/shared';
import type { Db } from '../../db/index.js';
import { role, user, userOrgUnits, userRole } from '../../db/schema.js';
import { badRequest, notFound } from '../../lib/errors.js';

const live = isNull(user.deletedAt);

// OWASP-recommended argon2id parameters
const ARGON2_OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

interface UserInput {
  username: string;
  email: string | null;
  displayName: string;
  locale: string;
  disabled: boolean;
  password?: string;
  roleIds: string[];
  orgUnits: Array<{ orgUnitId: string; scope: 'data_entry' | 'data_view' }>;
}

async function loadRelations(db: Db, ids: string[]) {
  if (ids.length === 0) return { roles: [], orgUnits: [] };
  const roles = await db.select().from(userRole).where(inArray(userRole.userId, ids));
  const orgUnits = await db
    .select()
    .from(userOrgUnits)
    .where(inArray(userOrgUnits.userId, ids));
  return { roles, orgUnits };
}

function assemble(
  row: typeof user.$inferSelect,
  relations: Awaited<ReturnType<typeof loadRelations>>,
): User {
  const { passwordHash: _passwordHash, ...rest } = row;
  return {
    ...rest,
    roleIds: relations.roles.filter((r) => r.userId === row.id).map((r) => r.roleId),
    orgUnits: relations.orgUnits
      .filter((o) => o.userId === row.id)
      .map(({ orgUnitId, scope }) => ({ orgUnitId, scope })),
  } as unknown as User;
}

export async function listUsers(db: Db): Promise<User[]> {
  const rows = await db.select().from(user).where(live);
  const relations = await loadRelations(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((r) => assemble(r, relations));
}

export async function getUser(db: Db, id: string): Promise<User> {
  const rows = await db
    .select()
    .from(user)
    .where(and(eq(user.id, id), live));
  if (!rows[0]) throw notFound('user');
  return assemble(rows[0], await loadRelations(db, [id]));
}

async function validateRoles(db: Db, roleIds: string[]) {
  if (roleIds.length === 0) return;
  const found = await db
    .select({ id: role.id })
    .from(role)
    .where(and(inArray(role.id, roleIds), isNull(role.deletedAt)));
  if (found.length !== new Set(roleIds).size) {
    throw badRequest('unknown roles');
  }
}

async function writeRelations(tx: Db, id: string, input: UserInput) {
  await tx.delete(userRole).where(eq(userRole.userId, id));
  await tx.delete(userOrgUnits).where(eq(userOrgUnits.userId, id));
  if (input.roleIds.length > 0) {
    await tx
      .insert(userRole)
      .values(input.roleIds.map((roleId) => ({ userId: id, roleId })));
  }
  if (input.orgUnits.length > 0) {
    await tx
      .insert(userOrgUnits)
      .values(input.orgUnits.map((o) => ({ ...o, userId: id })));
  }
}

export async function createUser(
  db: Db,
  input: UserInput,
  actor?: string,
): Promise<User> {
  await validateRoles(db, input.roleIds);
  const id = uuidv7();
  const passwordHash = input.password ? await hash(input.password, ARGON2_OPTS) : null;
  await db.transaction(async (tx) => {
    const { password: _pw, roleIds: _r, orgUnits: _o, ...fields } = input;
    await tx.insert(user).values({
      ...fields,
      id,
      passwordHash,
      createdBy: actor,
      updatedBy: actor,
    });
    await writeRelations(tx as unknown as Db, id, input);
  });
  return getUser(db, id);
}

export async function updateUser(
  db: Db,
  id: string,
  patch: Partial<UserInput>,
  actor?: string,
): Promise<User> {
  const current = await getUser(db, id);
  const merged: UserInput = {
    ...current,
    ...patch,
    roleIds: patch.roleIds ?? [...current.roleIds],
    orgUnits: patch.orgUnits ?? current.orgUnits.map((o) => ({ ...o })),
  } as UserInput;
  await validateRoles(db, merged.roleIds);

  await db.transaction(async (tx) => {
    const { password, roleIds: _r, orgUnits: _o, ...fields } = merged;
    const set: Record<string, unknown> = {
      ...fields,
      updatedBy: actor,
      updatedAt: sql`now()`,
      version: sql`${user.version} + 1`,
    };
    if (password) set.passwordHash = await hash(password, ARGON2_OPTS);
    await tx.update(user).set(set).where(eq(user.id, id));
    await writeRelations(tx as unknown as Db, id, merged);
  });
  return getUser(db, id);
}

export async function deleteUser(db: Db, id: string, actor?: string): Promise<void> {
  await getUser(db, id);
  await db
    .update(user)
    .set({
      deletedAt: sql`now()`,
      updatedBy: actor,
      updatedAt: sql`now()`,
      version: sql`${user.version} + 1`,
    })
    .where(eq(user.id, id));
}
