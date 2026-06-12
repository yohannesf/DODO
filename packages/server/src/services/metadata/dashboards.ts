import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { uuidv7, type Dashboard, type DashboardItem } from '@dodo/shared';
import type { Db } from '../../db/index.js';
import { dashboard, dashboardItem } from '../../db/schema.js';
import { notFound } from '../../lib/errors.js';

const live = isNull(dashboard.deletedAt);

interface DashboardInput {
  name: string;
  code: string;
  shared: boolean;
  items: DashboardItem[];
}

async function loadItems(db: Db, ids: string[]) {
  if (ids.length === 0) return [];
  return db.select().from(dashboardItem).where(inArray(dashboardItem.dashboardId, ids));
}

function assemble(
  row: typeof dashboard.$inferSelect,
  items: Awaited<ReturnType<typeof loadItems>>,
): Dashboard {
  return {
    ...row,
    items: items
      .filter((i) => i.dashboardId === row.id)
      .map(({ dashboardId: _d, ...item }) => item),
  } as unknown as Dashboard;
}

export async function listDashboards(db: Db): Promise<Dashboard[]> {
  const rows = await db.select().from(dashboard).where(live);
  const items = await loadItems(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((r) => assemble(r, items));
}

export async function getDashboard(db: Db, id: string): Promise<Dashboard> {
  const rows = await db
    .select()
    .from(dashboard)
    .where(and(eq(dashboard.id, id), live));
  if (!rows[0]) throw notFound('dashboard');
  return assemble(rows[0], await loadItems(db, [id]));
}

async function writeItems(tx: Db, id: string, items: DashboardItem[]) {
  await tx.delete(dashboardItem).where(eq(dashboardItem.dashboardId, id));
  if (items.length > 0) {
    await tx
      .insert(dashboardItem)
      .values(items.map((i) => ({ ...i, dashboardId: id, config: i.config })));
  }
}

export async function createDashboard(
  db: Db,
  input: DashboardInput,
  actor?: string,
  presetId?: string,
): Promise<Dashboard> {
  const id = presetId ?? uuidv7();
  await db.transaction(async (tx) => {
    const { items, ...fields } = input;
    await tx
      .insert(dashboard)
      .values({ ...fields, id, createdBy: actor, updatedBy: actor });
    await writeItems(tx as unknown as Db, id, items);
  });
  return getDashboard(db, id);
}

export async function updateDashboard(
  db: Db,
  id: string,
  patch: Partial<DashboardInput>,
  actor?: string,
): Promise<Dashboard> {
  const current = await getDashboard(db, id);
  const merged = { ...current, ...patch, items: patch.items ?? current.items };
  await db.transaction(async (tx) => {
    await tx
      .update(dashboard)
      .set({
        name: merged.name,
        code: merged.code,
        shared: merged.shared,
        updatedBy: actor,
        updatedAt: sql`now()`,
        version: sql`${dashboard.version} + 1`,
      })
      .where(eq(dashboard.id, id));
    await writeItems(tx as unknown as Db, id, merged.items);
  });
  return getDashboard(db, id);
}

export async function deleteDashboard(db: Db, id: string, actor?: string): Promise<void> {
  await getDashboard(db, id);
  await db
    .update(dashboard)
    .set({
      deletedAt: sql`now()`,
      updatedBy: actor,
      updatedAt: sql`now()`,
      version: sql`${dashboard.version} + 1`,
    })
    .where(eq(dashboard.id, id));
}
