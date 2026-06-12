// Generic CRUD over metadata tables (spec §4 conventions: soft delete,
// version bump on every write). Entities with relations or derived state
// (org units, combos, datasets, users) have dedicated services.
import { eq, isNull, sql, and, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { uuidv7 } from '@dodo/shared';
import type { Db } from '../../db/index.js';
import { notFound } from '../../lib/errors.js';

export interface MetaTable extends PgTable {
  id: PgColumn;
  version: PgColumn;
  updatedAt: PgColumn;
  deletedAt: PgColumn;
}

export const live = (t: MetaTable): SQL => isNull(t.deletedAt);

// Values flow in already validated by the entity's zod schema at the route
// boundary; drizzle cannot type a "table with arbitrary extra columns"
// insert without losing that table generic, hence the loose record type.
type Row = Record<string, unknown>;

export function makeCrud<T extends MetaTable>(table: T, entity: string) {
  async function list(db: Db): Promise<Row[]> {
    return db
      .select()
      .from(table as PgTable)
      .where(live(table))
      .orderBy(sql`created_at`);
  }

  async function get(db: Db, id: string): Promise<Row> {
    const rows = await db
      .select()
      .from(table as PgTable)
      .where(and(eq(table.id, id), live(table)));
    const row = rows[0];
    if (!row) throw notFound(entity);
    return row;
  }

  async function create(db: Db, input: Row, actor?: string): Promise<Row> {
    const id = uuidv7();
    await db
      .insert(table)
      .values({ ...input, id, createdBy: actor, updatedBy: actor } as never);
    return get(db, id);
  }

  async function update(db: Db, id: string, patch: Row, actor?: string): Promise<Row> {
    await get(db, id);
    await db
      .update(table)
      .set({
        ...patch,
        updatedBy: actor,
        updatedAt: sql`now()`,
        version: sql`${table.version} + 1`,
      } as never)
      .where(eq(table.id, id));
    return get(db, id);
  }

  async function softDelete(db: Db, id: string, actor?: string): Promise<void> {
    await get(db, id);
    await db
      .update(table)
      .set({
        deletedAt: sql`now()`,
        updatedBy: actor,
        updatedAt: sql`now()`,
        version: sql`${table.version} + 1`,
      } as never)
      .where(eq(table.id, id));
  }

  return { list, get, create, update, softDelete };
}
