// Analytics (spec §4.5, §7.1): aggregate raw data_value rows on the fly.
// Across org units: the data element's aggregation_op (default sum).
// Across periods: sum for flows; `last` takes the latest period (stocks).
// Indicator formulas are computed AFTER aggregation of their operands.
import { and, inArray, isNull } from 'drizzle-orm';
import {
  collectRefs,
  evaluateExpression,
  parseExpression,
  type AggregationOp,
  type AuthUser,
  type ExprNode,
} from '@dodo/shared';
import type { Db } from '../db/index.js';
import {
  categoryOption,
  categoryOptionCombo,
  dataElement,
  dataValue,
  indicator,
  orgUnit,
} from '../db/schema.js';
import { badRequest } from '../lib/errors.js';

export interface AnalyticsQuery {
  dx: string[];
  ou: string[];
  pe: string[];
  ouMode: 'selected' | 'subtree';
  /** add a TOTAL pseudo-period row aggregated across pe */
  peTotal: boolean;
}

export interface AnalyticsRow {
  dx: string;
  ou: string;
  pe: string;
  value: number | null;
}

export interface AnalyticsResult {
  rows: AnalyticsRow[];
  meta: { names: Record<string, string> };
}

const TYPE_FACTOR: Record<string, number> = {
  number: 1,
  percent: 100,
  rate: 1,
  per_thousand: 1000,
  per_ten_thousand: 10_000,
};

interface ValueRow {
  dataElementId: string;
  orgUnitId: string;
  period: string;
  categoryOptionComboId: string;
  value: string;
}

/** stage 1: across org units within one period */
function aggregateAcrossOrgUnits(op: AggregationOp, nums: number[]): number | null {
  if (nums.length === 0) return null;
  switch (op) {
    case 'avg':
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    case 'min':
      return Math.min(...nums);
    case 'max':
      return Math.max(...nums);
    case 'count':
      return nums.length;
    case 'sum':
    case 'last':
      return nums.reduce((a, b) => a + b, 0);
  }
}

/** stage 2: across periods — sum for flows, latest for stocks */
function aggregateAcrossPeriods(
  op: AggregationOp,
  byPeriod: Array<{ period: string; value: number }>,
): number | null {
  if (byPeriod.length === 0) return null;
  const values = byPeriod.map((p) => p.value);
  switch (op) {
    case 'last': {
      const latest = [...byPeriod].sort((a, b) => a.period.localeCompare(b.period));
      return latest[latest.length - 1]!.value;
    }
    case 'avg':
      return values.reduce((a, b) => a + b, 0) / values.length;
    case 'min':
      return Math.min(...values);
    case 'max':
      return Math.max(...values);
    case 'sum':
    case 'count':
      return values.reduce((a, b) => a + b, 0);
  }
}

export async function runAnalytics(
  db: Db,
  user: AuthUser,
  query: AnalyticsQuery,
): Promise<AnalyticsResult> {
  if (query.dx.length === 0 || query.ou.length === 0 || query.pe.length === 0) {
    throw badRequest('dx, ou, and pe are all required');
  }

  // classify dx
  const des = await db
    .select()
    .from(dataElement)
    .where(and(inArray(dataElement.id, query.dx), isNull(dataElement.deletedAt)));
  const indicators = await db
    .select()
    .from(indicator)
    .where(and(inArray(indicator.id, query.dx), isNull(indicator.deletedAt)));
  const known = new Set([...des.map((d) => d.id), ...indicators.map((i) => i.id)]);
  const unknown = query.dx.filter((id) => !known.has(id));
  if (unknown.length > 0) throw badRequest(`unknown dx: ${unknown.join(', ')}`);

  // indicator refs → additional data elements by code
  const parsed = new Map<string, { num: ExprNode; den: ExprNode }>();
  const refCodes = new Set<string>();
  for (const ind of indicators) {
    const num = parseExpression(ind.numeratorExpr);
    const den = parseExpression(ind.denominatorExpr);
    parsed.set(ind.id, { num, den });
    for (const ref of [...collectRefs(num), ...collectRefs(den)]) {
      refCodes.add(ref.dataElementCode);
    }
  }
  const refDes = refCodes.size
    ? await db
        .select()
        .from(dataElement)
        .where(
          and(inArray(dataElement.code, [...refCodes]), isNull(dataElement.deletedAt)),
        )
    : [];
  const allDes = new Map([...des, ...refDes].map((d) => [d.id, d]));
  const deByCode = new Map([...allDes.values()].map((d) => [d.code, d]));

  // org units: requested roots + their subtrees when ouMode=subtree
  const ouRows = await db
    .select({ id: orgUnit.id, path: orgUnit.path, name: orgUnit.name })
    .from(orgUnit)
    .where(and(inArray(orgUnit.id, query.ou), isNull(orgUnit.deletedAt)));
  if (ouRows.length !== new Set(query.ou).size) throw badRequest('unknown org units');

  // scope check (spec §7.2): data access intersects the user's scope
  if (!user.permissions.includes('system:admin')) {
    const scopeIds = user.orgUnits.map((o) => o.orgUnitId);
    const scopeRows = scopeIds.length
      ? await db
          .select({ path: orgUnit.path })
          .from(orgUnit)
          .where(inArray(orgUnit.id, scopeIds))
      : [];
    for (const root of ouRows) {
      const ok = scopeRows.some(
        (s) => root.path === s.path || root.path.startsWith(`${s.path}.`),
      );
      if (!ok) throw badRequest(`org unit out of your scope: ${root.name}`);
    }
  }

  const allOrgUnits = await db
    .select({ id: orgUnit.id, path: orgUnit.path })
    .from(orgUnit)
    .where(isNull(orgUnit.deletedAt));
  const groupMembers = new Map<string, Set<string>>();
  for (const root of ouRows) {
    const members =
      query.ouMode === 'subtree'
        ? allOrgUnits.filter(
            (o) => o.path === root.path || o.path.startsWith(`${root.path}.`),
          )
        : allOrgUnits.filter((o) => o.id === root.id);
    groupMembers.set(root.id, new Set(members.map((m) => m.id)));
  }

  // load all candidate value rows once
  const values: ValueRow[] = allDes.size
    ? await db
        .select({
          dataElementId: dataValue.dataElementId,
          orgUnitId: dataValue.orgUnitId,
          period: dataValue.period,
          categoryOptionComboId: dataValue.categoryOptionComboId,
          value: dataValue.value,
        })
        .from(dataValue)
        .where(
          and(
            inArray(dataValue.dataElementId, [...allDes.keys()]),
            inArray(dataValue.period, query.pe),
          ),
        )
    : [];

  // coc → option ids for #{DE.OPTION} narrowing
  const cocs = await db
    .select({ id: categoryOptionCombo.id, optionIds: categoryOptionCombo.optionIds })
    .from(categoryOptionCombo);
  const cocOptions = new Map(cocs.map((c) => [c.id, new Set(c.optionIds)]));
  const options = await db
    .select({ id: categoryOption.id, code: categoryOption.code })
    .from(categoryOption);
  const optionByCode = new Map(options.map((o) => [o.code, o.id]));

  /** aggregate one DE over (member set × period list), honouring its op */
  function aggregateDe(
    deId: string,
    members: Set<string>,
    periods: string[],
    optionCode: string | null,
  ): number | null {
    const de = allDes.get(deId);
    if (!de) return null;
    const optionId = optionCode ? optionByCode.get(optionCode) : null;
    if (optionCode && !optionId) return null;
    const perPeriod: Array<{ period: string; value: number }> = [];
    for (const pe of periods) {
      const nums = values
        .filter(
          (v) =>
            v.dataElementId === deId &&
            v.period === pe &&
            members.has(v.orgUnitId) &&
            (!optionId || cocOptions.get(v.categoryOptionComboId)?.has(optionId)),
        )
        .map((v) => Number(v.value))
        .filter((n) => Number.isFinite(n));
      const agg = aggregateAcrossOrgUnits(de.aggregationOp, nums);
      if (agg !== null) perPeriod.push({ period: pe, value: agg });
    }
    return aggregateAcrossPeriods(de.aggregationOp, perPeriod);
  }

  const names: Record<string, string> = {};
  for (const d of des) names[d.id] = d.name;
  for (const i of indicators) names[i.id] = i.name;
  for (const o of ouRows) names[o.id] = o.name;

  const periodCells: Array<{ periods: string[]; label: string }> = query.pe.map((p) => ({
    periods: [p],
    label: p,
  }));
  if (query.peTotal) periodCells.push({ periods: query.pe, label: 'TOTAL' });

  const rows: AnalyticsRow[] = [];
  for (const dxId of query.dx) {
    for (const root of ouRows) {
      const members = groupMembers.get(root.id)!;
      for (const { periods, label } of periodCells) {
        let value: number | null;
        const ind = indicators.find((i) => i.id === dxId);
        if (!ind) {
          value = aggregateDe(dxId, members, periods, null);
        } else {
          const { num, den } = parsed.get(ind.id)!;
          const resolve = (code: string, coc: string | null) => {
            const de = deByCode.get(code);
            return de ? aggregateDe(de.id, members, periods, coc) : null;
          };
          const numerator = evaluateExpression(num, resolve);
          const denominator = evaluateExpression(den, resolve);
          if (numerator === null || denominator === null || denominator === 0) {
            value = null;
          } else {
            const raw =
              (numerator / denominator) *
              ind.factor *
              (TYPE_FACTOR[ind.indicatorType] ?? 1);
            const f = 10 ** ind.decimals;
            value = Math.round(raw * f) / f;
          }
        }
        rows.push({ dx: dxId, ou: root.id, pe: label, value });
      }
    }
  }

  return { rows, meta: { names } };
}
