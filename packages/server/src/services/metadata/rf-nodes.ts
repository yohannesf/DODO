import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { uuidv7, type RfNode } from '@dodo/shared';
import type { Db } from '../../db/index.js';
import { indicator, rfNode, rfNodeIndicators } from '../../db/schema.js';
import { badRequest, notFound } from '../../lib/errors.js';

const live = isNull(rfNode.deletedAt);

interface RfNodeInput {
  frameworkId: string;
  parentId: string | null;
  kind: RfNode['kind'];
  title: string;
  description: string;
  sortOrder: number;
  indicatorIds: string[];
}

async function loadLinks(db: Db, ids: string[]) {
  if (ids.length === 0) return [];
  return db.select().from(rfNodeIndicators).where(inArray(rfNodeIndicators.nodeId, ids));
}

function assemble(
  row: typeof rfNode.$inferSelect,
  links: Awaited<ReturnType<typeof loadLinks>>,
): RfNode {
  return {
    ...row,
    indicatorIds: links.filter((l) => l.nodeId === row.id).map((l) => l.indicatorId),
  } as unknown as RfNode;
}

export async function listRfNodes(db: Db): Promise<RfNode[]> {
  const rows = await db.select().from(rfNode).where(live).orderBy(asc(rfNode.sortOrder));
  const links = await loadLinks(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((r) => assemble(r, links));
}

export async function getRfNode(db: Db, id: string): Promise<RfNode> {
  const rows = await db
    .select()
    .from(rfNode)
    .where(and(eq(rfNode.id, id), live));
  if (!rows[0]) throw notFound('framework node');
  return assemble(rows[0], await loadLinks(db, [id]));
}

async function validateIndicators(db: Db, ids: string[]) {
  if (ids.length === 0) return;
  const found = await db
    .select({ id: indicator.id })
    .from(indicator)
    .where(and(inArray(indicator.id, ids), isNull(indicator.deletedAt)));
  if (found.length !== new Set(ids).size) throw badRequest('unknown indicators');
}

async function writeLinks(tx: Db, id: string, indicatorIds: string[]) {
  await tx.delete(rfNodeIndicators).where(eq(rfNodeIndicators.nodeId, id));
  if (indicatorIds.length > 0) {
    await tx
      .insert(rfNodeIndicators)
      .values(indicatorIds.map((indicatorId) => ({ nodeId: id, indicatorId })));
  }
}

export async function createRfNode(
  db: Db,
  input: RfNodeInput,
  actor?: string,
  presetId?: string,
): Promise<RfNode> {
  await validateIndicators(db, input.indicatorIds);
  const id = presetId ?? uuidv7();
  await db.transaction(async (tx) => {
    const { indicatorIds, ...fields } = input;
    await tx.insert(rfNode).values({ ...fields, id, createdBy: actor, updatedBy: actor });
    await writeLinks(tx as unknown as Db, id, indicatorIds);
  });
  return getRfNode(db, id);
}

export async function updateRfNode(
  db: Db,
  id: string,
  patch: Partial<RfNodeInput>,
  actor?: string,
): Promise<RfNode> {
  const current = await getRfNode(db, id);
  const merged = {
    ...current,
    ...patch,
    indicatorIds: patch.indicatorIds ?? current.indicatorIds,
  };
  await validateIndicators(db, merged.indicatorIds);
  await db.transaction(async (tx) => {
    const { indicatorIds, ...fields } = merged;
    await tx
      .update(rfNode)
      .set({
        frameworkId: fields.frameworkId,
        parentId: fields.parentId,
        kind: fields.kind,
        title: fields.title,
        description: fields.description,
        sortOrder: fields.sortOrder,
        updatedBy: actor,
        updatedAt: sql`now()`,
        version: sql`${rfNode.version} + 1`,
      })
      .where(eq(rfNode.id, id));
    await writeLinks(tx as unknown as Db, id, indicatorIds);
  });
  return getRfNode(db, id);
}

export async function deleteRfNode(db: Db, id: string, actor?: string): Promise<void> {
  await getRfNode(db, id);
  const children = await db
    .select({ id: rfNode.id })
    .from(rfNode)
    .where(and(eq(rfNode.parentId, id), live))
    .limit(1);
  if (children.length > 0) {
    throw badRequest('node has children — delete them first');
  }
  await db
    .update(rfNode)
    .set({
      deletedAt: sql`now()`,
      updatedBy: actor,
      updatedAt: sql`now()`,
      version: sql`${rfNode.version} + 1`,
    })
    .where(eq(rfNode.id, id));
}
