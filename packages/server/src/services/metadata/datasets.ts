import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { uuidv7, type Dataset } from '@dodo/shared';
import type { Db } from '../../db/index.js';
import {
  dataElement,
  dataset,
  datasetElements,
  datasetOrgUnits,
  orgUnit,
} from '../../db/schema.js';
import { badRequest, notFound } from '../../lib/errors.js';

const live = isNull(dataset.deletedAt);

interface DatasetInput {
  name: string;
  code: string;
  description: string;
  frequency: Dataset['frequency'];
  openFuturePeriods: number;
  expiryDays: number;
  requiresApproval: boolean;
  programId: string | null;
  entryLayout: Record<string, unknown>;
  elements: Array<{
    dataElementId: string;
    sortOrder: number;
    section: string;
    required: boolean;
  }>;
  orgUnitIds: string[];
}

async function loadRelations(db: Db, ids: string[]) {
  if (ids.length === 0) {
    return { elements: [], orgUnits: [] };
  }
  const elements = await db
    .select()
    .from(datasetElements)
    .where(inArray(datasetElements.datasetId, ids))
    .orderBy(asc(datasetElements.sortOrder));
  const orgUnits = await db
    .select()
    .from(datasetOrgUnits)
    .where(inArray(datasetOrgUnits.datasetId, ids));
  return { elements, orgUnits };
}

function assemble(
  row: typeof dataset.$inferSelect,
  relations: Awaited<ReturnType<typeof loadRelations>>,
): Dataset {
  return {
    ...row,
    elements: relations.elements
      .filter((e) => e.datasetId === row.id)
      .map(({ dataElementId, sortOrder, section, required }) => ({
        dataElementId,
        sortOrder,
        section,
        required,
      })),
    orgUnitIds: relations.orgUnits
      .filter((o) => o.datasetId === row.id)
      .map((o) => o.orgUnitId),
  } as unknown as Dataset;
}

export async function listDatasets(db: Db): Promise<Dataset[]> {
  const rows = await db.select().from(dataset).where(live);
  const relations = await loadRelations(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((r) => assemble(r, relations));
}

export async function getDataset(db: Db, id: string): Promise<Dataset> {
  const rows = await db
    .select()
    .from(dataset)
    .where(and(eq(dataset.id, id), live));
  if (!rows[0]) throw notFound('dataset');
  return assemble(rows[0], await loadRelations(db, [id]));
}

async function validateRelations(db: Db, input: DatasetInput) {
  const deIds = input.elements.map((e) => e.dataElementId);
  if (deIds.length > 0) {
    const found = await db
      .select({ id: dataElement.id })
      .from(dataElement)
      .where(and(inArray(dataElement.id, deIds), isNull(dataElement.deletedAt)));
    if (found.length !== new Set(deIds).size) {
      throw badRequest('dataset references unknown data elements');
    }
  }
  if (input.orgUnitIds.length > 0) {
    const found = await db
      .select({ id: orgUnit.id })
      .from(orgUnit)
      .where(and(inArray(orgUnit.id, input.orgUnitIds), isNull(orgUnit.deletedAt)));
    if (found.length !== new Set(input.orgUnitIds).size) {
      throw badRequest('dataset references unknown org units');
    }
  }
}

async function writeRelations(
  tx: Db,
  id: string,
  input: Pick<DatasetInput, 'elements' | 'orgUnitIds'>,
) {
  await tx.delete(datasetElements).where(eq(datasetElements.datasetId, id));
  await tx.delete(datasetOrgUnits).where(eq(datasetOrgUnits.datasetId, id));
  if (input.elements.length > 0) {
    await tx
      .insert(datasetElements)
      .values(input.elements.map((e) => ({ ...e, datasetId: id })));
  }
  if (input.orgUnitIds.length > 0) {
    await tx
      .insert(datasetOrgUnits)
      .values(input.orgUnitIds.map((orgUnitId) => ({ datasetId: id, orgUnitId })));
  }
}

export async function createDataset(
  db: Db,
  input: DatasetInput,
  actor?: string,
  presetId?: string, // bundle import keeps ids stable across instances
): Promise<Dataset> {
  await validateRelations(db, input);
  const id = presetId ?? uuidv7();
  await db.transaction(async (tx) => {
    const { elements, orgUnitIds, ...fields } = input;
    await tx
      .insert(dataset)
      .values({ ...fields, id, createdBy: actor, updatedBy: actor });
    await writeRelations(tx as unknown as Db, id, { elements, orgUnitIds });
  });
  return getDataset(db, id);
}

export async function updateDataset(
  db: Db,
  id: string,
  patch: Partial<DatasetInput>,
  actor?: string,
): Promise<Dataset> {
  const current = await getDataset(db, id);
  const merged: DatasetInput = {
    ...current,
    ...patch,
    elements: patch.elements ?? current.elements.map((e) => ({ ...e })),
    orgUnitIds: patch.orgUnitIds ?? [...current.orgUnitIds],
  } as DatasetInput;
  await validateRelations(db, merged);

  await db.transaction(async (tx) => {
    const { elements, orgUnitIds, ...fields } = merged;
    await tx
      .update(dataset)
      .set({
        ...fields,
        updatedBy: actor,
        updatedAt: sql`now()`,
        version: sql`${dataset.version} + 1`,
      })
      .where(eq(dataset.id, id));
    await writeRelations(tx as unknown as Db, id, { elements, orgUnitIds });
  });
  return getDataset(db, id);
}

export async function deleteDataset(db: Db, id: string, actor?: string): Promise<void> {
  await getDataset(db, id);
  await db
    .update(dataset)
    .set({
      deletedAt: sql`now()`,
      updatedBy: actor,
      updatedAt: sql`now()`,
      version: sql`${dataset.version} + 1`,
    })
    .where(eq(dataset.id, id));
}
