// Exports (spec §7.1): CSV and XLSX. The org unit CSV uses exactly the
// import columns, so export → import round-trips cleanly.
import * as XLSX from 'xlsx';
import { asc, eq, isNull } from 'drizzle-orm';
import type { Geometry } from '@dodo/shared';
import type { Db } from '../db/index.js';
import { categoryOptionCombo, dataElement, dataValue, orgUnit } from '../db/schema.js';
import { listOrgUnits } from './metadata/org-units.js';

function csvEscape(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

const toCsv = (rows: string[][]): string =>
  rows.map((r) => r.map(csvEscape).join(',')).join('\n') + '\n';

export async function exportOrgUnitsCsv(db: Db): Promise<string> {
  const units = await listOrgUnits(db); // path-ordered → parents before children
  const codeOf = new Map(units.map((u) => [u.id, u.code]));
  const rows: string[][] = [
    [
      'code',
      'name',
      'short_name',
      'parent_code',
      'opening_date',
      'latitude',
      'longitude',
    ],
  ];
  for (const u of units) {
    const geom = u.geometry as Geometry | null;
    const point =
      geom?.type === 'Point' && Array.isArray(geom.coordinates)
        ? (geom.coordinates as number[])
        : null;
    rows.push([
      u.code,
      u.name,
      u.shortName,
      u.parentId ? (codeOf.get(u.parentId) ?? '') : '',
      u.openingDate ?? '',
      point ? String(point[1]) : '',
      point ? String(point[0]) : '',
    ]);
  }
  return toCsv(rows);
}

interface DataValueExportRow {
  dataElement: string;
  orgUnit: string;
  period: string;
  categoryOptionCombo: string;
  value: string;
  comment: string;
  updatedAt: string;
}

async function dataValueRows(db: Db): Promise<DataValueExportRow[]> {
  const rows = await db
    .select({
      de: dataElement.code,
      ou: orgUnit.code,
      period: dataValue.period,
      coc: categoryOptionCombo.name,
      value: dataValue.value,
      comment: dataValue.comment,
      updatedAt: dataValue.updatedAt,
    })
    .from(dataValue)
    .innerJoin(dataElement, eq(dataElement.id, dataValue.dataElementId))
    .innerJoin(orgUnit, eq(orgUnit.id, dataValue.orgUnitId))
    .innerJoin(
      categoryOptionCombo,
      eq(categoryOptionCombo.id, dataValue.categoryOptionComboId),
    )
    .where(isNull(dataElement.deletedAt))
    .orderBy(asc(dataElement.code), asc(orgUnit.code), asc(dataValue.period));
  return rows.map((r) => ({
    dataElement: r.de,
    orgUnit: r.ou,
    period: r.period,
    categoryOptionCombo: r.coc,
    value: r.value,
    comment: r.comment,
    updatedAt: r.updatedAt,
  }));
}

const DV_HEADER = [
  'data_element',
  'org_unit',
  'period',
  'category_option_combo',
  'value',
  'comment',
  'updated_at',
];

export async function exportDataValuesCsv(db: Db): Promise<string> {
  const rows = await dataValueRows(db);
  return toCsv([
    DV_HEADER,
    ...rows.map((r) => [
      r.dataElement,
      r.orgUnit,
      r.period,
      r.categoryOptionCombo,
      r.value,
      r.comment,
      r.updatedAt,
    ]),
  ]);
}

export async function exportDataValuesXlsx(db: Db): Promise<Buffer> {
  const rows = await dataValueRows(db);
  const aoa: Array<Array<string | number>> = [
    DV_HEADER,
    ...rows.map((r) => [
      r.dataElement,
      r.orgUnit,
      r.period,
      r.categoryOptionCombo,
      Number.isFinite(Number(r.value)) ? Number(r.value) : r.value,
      r.comment,
      r.updatedAt,
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = DV_HEADER.map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'data values');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
