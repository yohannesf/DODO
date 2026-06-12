import { and, asc, eq, getTableColumns, isNull, sql } from 'drizzle-orm';
import {
  orgUnitInputSchema,
  uuidv7,
  type FeatureCollection,
  type Geometry,
  type OrgUnit,
} from '@dodo/shared';
import type { Db } from '../../db/index.js';
import { orgUnit } from '../../db/schema.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { parseCsv } from '../../lib/csv.js';

const pathLabel = (id: string) => id.replaceAll('-', '');

const geomFromGeoJson = (g: Geometry) =>
  sql`ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(g)}), 4326)`;

// geometry is stored as PostGIS geometry; API speaks GeoJSON
const selection = {
  ...getTableColumns(orgUnit),
  geometry: sql<Geometry | null>`ST_AsGeoJSON(${orgUnit.geometry})::json`.as('geometry'),
};

const live = isNull(orgUnit.deletedAt);

export async function listOrgUnits(db: Db): Promise<OrgUnit[]> {
  const rows = await db
    .select(selection)
    .from(orgUnit)
    .where(live)
    .orderBy(asc(orgUnit.path));
  return rows as unknown as OrgUnit[];
}

export async function getOrgUnit(db: Db, id: string): Promise<OrgUnit> {
  const rows = await db
    .select(selection)
    .from(orgUnit)
    .where(and(eq(orgUnit.id, id), live));
  if (!rows[0]) throw notFound('org unit');
  return rows[0] as unknown as OrgUnit;
}

type OrgUnitInput = ReturnType<typeof orgUnitInputSchema.parse>;

export async function createOrgUnit(
  db: Db,
  input: OrgUnitInput,
  actor?: string,
  presetId?: string, // bundle import keeps ids stable across instances
): Promise<OrgUnit> {
  const id = presetId ?? uuidv7();
  let level = 1;
  let path = pathLabel(id);
  if (input.parentId) {
    const parent = await getOrgUnit(db, input.parentId);
    level = parent.level + 1;
    path = `${parent.path}.${pathLabel(id)}`;
  }
  const { geometry, ...rest } = input;
  await db.insert(orgUnit).values({
    ...rest,
    id,
    level,
    path,
    geometry: geometry ? geomFromGeoJson(geometry) : null,
    createdBy: actor,
    updatedBy: actor,
  });
  return getOrgUnit(db, id);
}

export async function updateOrgUnit(
  db: Db,
  id: string,
  patch: Partial<OrgUnitInput>,
  actor?: string,
): Promise<OrgUnit> {
  const current = await getOrgUnit(db, id);

  const { geometry, parentId, ...rest } = patch;
  const set: Record<string, unknown> = {
    ...rest,
    updatedBy: actor,
    updatedAt: sql`now()`,
    version: sql`${orgUnit.version} + 1`,
  };
  if (geometry !== undefined) {
    set.geometry = geometry ? geomFromGeoJson(geometry) : null;
  }
  await db.update(orgUnit).set(set).where(eq(orgUnit.id, id));

  // Reparenting moves the whole subtree: paths get re-rooted, levels shift.
  if (parentId !== undefined && parentId !== current.parentId) {
    let newParentPath = '';
    let newLevel = 1;
    if (parentId) {
      const parent = await getOrgUnit(db, parentId);
      if (parent.path === current.path || parent.path.startsWith(`${current.path}.`)) {
        throw badRequest('cannot move an org unit under its own subtree');
      }
      newParentPath = parent.path;
      newLevel = parent.level + 1;
    }
    const newPath = newParentPath ? `${newParentPath}.${pathLabel(id)}` : pathLabel(id);
    const delta = newLevel - current.level;
    // strict descendants keep their tail below the node's new path
    await db.execute(sql`
      update org_unit
      set path = ${newPath}::ltree || subpath(path, nlevel(${current.path}::ltree)),
          level = level + ${delta}
      where path <@ ${current.path}::ltree and path != ${current.path}::ltree
    `);
    await db
      .update(orgUnit)
      .set({ parentId, path: newPath, level: newLevel })
      .where(eq(orgUnit.id, id));
  }
  return getOrgUnit(db, id);
}

export async function deleteOrgUnit(db: Db, id: string, actor?: string): Promise<void> {
  await getOrgUnit(db, id);
  const children = await db
    .select({ id: orgUnit.id })
    .from(orgUnit)
    .where(and(eq(orgUnit.parentId, id), live))
    .limit(1);
  if (children.length > 0) {
    throw badRequest('org unit has children — delete or move them first');
  }
  await db
    .update(orgUnit)
    .set({
      deletedAt: sql`now()`,
      updatedBy: actor,
      updatedAt: sql`now()`,
      version: sql`${orgUnit.version} + 1`,
    })
    .where(eq(orgUnit.id, id));
}

// --- CSV import (spec §8.5): bulk create/update with dry-run report --------
// Columns: code,name,short_name,parent_code,opening_date,latitude,longitude

export interface CsvImportRow {
  line: number;
  code: string;
  action: 'create' | 'update' | 'error';
  message?: string;
}
export interface CsvImportReport {
  dryRun: boolean;
  rows: CsvImportRow[];
  created: number;
  updated: number;
  errors: number;
}

export async function importOrgUnitsCsv(
  db: Db,
  csv: string,
  dryRun: boolean,
  actor?: string,
): Promise<CsvImportReport> {
  const records = parseCsv(csv);
  const report: CsvImportRow[] = [];

  await db
    .transaction(async (tx) => {
      // code → id for parents created earlier in the file
      const codeToId = new Map<string, string>();

      for (let i = 0; i < records.length; i++) {
        const line = i + 2; // header is line 1
        const r = records[i]!;
        const code = r.code ?? '';
        try {
          const lat = r.latitude ? Number(r.latitude) : null;
          const lon = r.longitude ? Number(r.longitude) : null;
          if (
            (lat === null) !== (lon === null) ||
            Number.isNaN(lat) ||
            Number.isNaN(lon)
          ) {
            throw badRequest('latitude/longitude must both be valid numbers');
          }
          const geometry: Geometry | null =
            lat !== null && lon !== null
              ? { type: 'Point', coordinates: [lon, lat] }
              : null;

          let parentId: string | null = null;
          if (r.parent_code) {
            parentId = codeToId.get(r.parent_code) ?? null;
            if (!parentId) {
              const parent = await tx
                .select({ id: orgUnit.id })
                .from(orgUnit)
                .where(and(eq(orgUnit.code, r.parent_code), live));
              if (!parent[0]) throw badRequest(`parent code ${r.parent_code} not found`);
              parentId = parent[0].id;
            }
          }

          const input = orgUnitInputSchema.parse({
            code,
            name: r.name,
            shortName: r.short_name || r.name,
            parentId,
            openingDate: r.opening_date || null,
            geometry,
          });

          const existing = await tx
            .select({ id: orgUnit.id })
            .from(orgUnit)
            .where(and(eq(orgUnit.code, code), live));

          if (existing[0]) {
            await updateOrgUnit(tx as unknown as Db, existing[0].id, input, actor);
            codeToId.set(code, existing[0].id);
            report.push({ line, code, action: 'update' });
          } else {
            const created = await createOrgUnit(tx as unknown as Db, input, actor);
            codeToId.set(code, created.id);
            report.push({ line, code, action: 'create' });
          }
        } catch (err) {
          report.push({
            line,
            code,
            action: 'error',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }

      const hasErrors = report.some((r) => r.action === 'error');
      if (dryRun || hasErrors) {
        tx.rollback();
      }
    })
    .catch((err: unknown) => {
      // drizzle's tx.rollback() throws a marker error — intentional here
      if (!(err instanceof Error) || err.message !== 'Rollback') throw err;
    });

  return {
    dryRun,
    rows: report,
    created: report.filter((r) => r.action === 'create').length,
    updated: report.filter((r) => r.action === 'update').length,
    errors: report.filter((r) => r.action === 'error').length,
  };
}

// --- GeoJSON import: set geometry on org units matched by properties.code --

export interface GeoJsonImportReport {
  matched: number;
  unmatched: string[];
}

export async function importOrgUnitGeoJson(
  db: Db,
  fc: FeatureCollection,
  actor?: string,
): Promise<GeoJsonImportReport> {
  let matched = 0;
  const unmatched: string[] = [];
  for (const feature of fc.features) {
    const code = String(feature.properties?.code ?? '');
    if (!code || !feature.geometry) {
      unmatched.push(code || '(no code)');
      continue;
    }
    const rows = await db
      .select({ id: orgUnit.id })
      .from(orgUnit)
      .where(and(eq(orgUnit.code, code), live));
    if (!rows[0]) {
      unmatched.push(code);
      continue;
    }
    await db
      .update(orgUnit)
      .set({
        geometry: geomFromGeoJson(feature.geometry),
        updatedBy: actor,
        updatedAt: sql`now()`,
        version: sql`${orgUnit.version} + 1`,
      })
      .where(eq(orgUnit.id, rows[0].id));
    matched++;
  }
  return { matched, unmatched };
}
