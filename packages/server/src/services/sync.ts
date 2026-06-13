// Sync engine server side (spec §6): pull = change-log replication with
// scoping + tombstones; push = idempotent, per-op transactional apply with
// base-version conflict detection.
import { createHash } from 'node:crypto';
import { and, asc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import {
  dataValueDeletePayloadSchema,
  dataValueUpsertPayloadSchema,
  evaluateRules,
  rulesForDataset,
  submissionCompletePayloadSchema,
  parsePeriod,
  periodOpenStatus,
  validateValue,
  PULL_PAGE_SIZE,
  SYNC_COLLECTIONS,
  type AuthUser,
  type PullChange,
  type PullResponse,
  type PushResult,
  type SyncCollection,
  type SyncOp,
} from '@dodo/shared';
import type { Db } from '../db/index.js';
import {
  category,
  categoryOption,
  dataset,
  datasetElements,
  datasetOrgUnits,
  categoryOptionCombo,
  dataElement,
  dataValue,
  dataValueAudit,
  option,
  optionSet,
  orgUnit,
  indicator,
  orgUnitLevel,
  program,
  resultsFramework,
  submission,
  target,
  validationRule,
  syncChangeLog,
  syncDevice,
  syncOp,
  syncPushJournal,
} from '../db/schema.js';
import { AppError, badRequest } from '../lib/errors.js';
import { listCategoryCombos } from './metadata/category-combos.js';
import { listDatasets } from './metadata/datasets.js';
import { listRfNodes } from './metadata/rf-nodes.js';
import { listDashboards } from './metadata/dashboards.js';
import { listOrgUnits } from './metadata/org-units.js';

// --- scoping ----------------------------------------------------------------

interface Scope {
  /** null = unrestricted (admin); otherwise ltree paths of scope roots */
  paths: string[] | null;
}

async function resolveScope(db: Db, user: AuthUser): Promise<Scope> {
  if (user.permissions.includes('system:admin')) return { paths: null };
  if (user.orgUnits.length === 0) return { paths: [] };
  const ids = user.orgUnits.map((o) => o.orgUnitId);
  const rows = await db
    .select({ path: orgUnit.path })
    .from(orgUnit)
    .where(and(inArray(orgUnit.id, ids), isNull(orgUnit.deletedAt)));
  return { paths: rows.map((r) => r.path) };
}

const inScope = (scope: Scope, path: string): boolean =>
  scope.paths === null || scope.paths.some((p) => path === p || path.startsWith(`${p}.`));

// --- pull -------------------------------------------------------------------

export async function pull(
  db: Db,
  user: AuthUser,
  cursor: number,
  collections?: SyncCollection[],
): Promise<PullResponse> {
  const wanted = collections ?? [...SYNC_COLLECTIONS];
  const scope = await resolveScope(db, user);

  const log = await db
    .select()
    .from(syncChangeLog)
    .where(
      and(gt(syncChangeLog.serverSeq, cursor), inArray(syncChangeLog.collection, wanted)),
    )
    .orderBy(asc(syncChangeLog.serverSeq))
    .limit(PULL_PAGE_SIZE);

  // newest change wins per row; deletes always pass through as tombstones
  const latestByRow = new Map<string, (typeof log)[number]>();
  for (const entry of log) latestByRow.set(entry.rowId, entry);

  // org unit path lookup for scope checks of values/submissions
  const orgUnitsById = new Map(
    (await db.select({ id: orgUnit.id, path: orgUnit.path }).from(orgUnit)).map((o) => [
      o.id,
      o.path,
    ]),
  );

  // load current rows per collection in one query each
  const idsBy = (coll: string) =>
    [...latestByRow.values()]
      .filter((e) => e.collection === coll && e.op === 'upsert')
      .map((e) => e.rowId);

  const rows = new Map<string, unknown>();
  const keep = (coll: string, items: Array<{ id: string }>) => {
    for (const item of items) rows.set(`${coll}:${item.id}`, item);
  };

  // simple flat collections
  const flat: Array<[SyncCollection, typeof program]> = [
    ['programs', program],
    ['orgUnitLevels', orgUnitLevel as unknown as typeof program],
    ['categories', category as unknown as typeof program],
    ['categoryOptions', categoryOption as unknown as typeof program],
    ['optionSets', optionSet as unknown as typeof program],
    ['options', option as unknown as typeof program],
    ['dataElements', dataElement as unknown as typeof program],
    ['validationRules', validationRule as unknown as typeof program],
    ['indicators', indicator as unknown as typeof program],
    ['resultsFrameworks', resultsFramework as unknown as typeof program],
    ['targets', target as unknown as typeof program],
  ];
  for (const [coll, table] of flat) {
    const ids = idsBy(coll);
    if (ids.length === 0) continue;
    keep(
      coll,
      await db
        .select()
        .from(table)
        .where(and(inArray(table.id, ids), isNull(table.deletedAt))),
    );
  }

  if (idsBy('categoryOptionCombos').length > 0) {
    keep(
      'categoryOptionCombos',
      await db
        .select()
        .from(categoryOptionCombo)
        .where(inArray(categoryOptionCombo.id, idsBy('categoryOptionCombos'))),
    );
  }
  if (idsBy('categoryCombos').length > 0) {
    const ids = new Set(idsBy('categoryCombos'));
    keep(
      'categoryCombos',
      (await listCategoryCombos(db)).filter((c) => ids.has(c.id)),
    );
  }
  if (idsBy('orgUnits').length > 0) {
    const ids = new Set(idsBy('orgUnits'));
    keep(
      'orgUnits',
      (await listOrgUnits(db)).filter((o) => ids.has(o.id) && inScope(scope, o.path)),
    );
  }
  if (idsBy('dashboards').length > 0) {
    const ids = new Set(idsBy('dashboards'));
    keep(
      'dashboards',
      (await listDashboards(db)).filter((d) => ids.has(d.id)),
    );
  }
  if (idsBy('rfNodes').length > 0) {
    const ids = new Set(idsBy('rfNodes'));
    keep(
      'rfNodes',
      (await listRfNodes(db)).filter((n) => ids.has(n.id)),
    );
  }
  if (idsBy('datasets').length > 0) {
    const ids = new Set(idsBy('datasets'));
    keep(
      'datasets',
      (await listDatasets(db)).filter(
        (d) =>
          ids.has(d.id) &&
          (scope.paths === null ||
            d.orgUnitIds.some((ouId) => {
              const path = orgUnitsById.get(ouId);
              return path !== undefined && inScope(scope, path);
            })),
      ),
    );
  }
  if (idsBy('dataValues').length > 0) {
    const values = await db
      .select()
      .from(dataValue)
      .where(inArray(dataValue.id, idsBy('dataValues')));
    keep(
      'dataValues',
      values.filter((v) => {
        const path = orgUnitsById.get(v.orgUnitId);
        return path !== undefined && inScope(scope, path);
      }),
    );
  }
  if (idsBy('submissions').length > 0) {
    const subs = await db
      .select()
      .from(submission)
      .where(inArray(submission.id, idsBy('submissions')));
    keep(
      'submissions',
      subs.filter((s) => {
        const path = orgUnitsById.get(s.orgUnitId);
        return path !== undefined && inScope(scope, path);
      }),
    );
  }

  const changes: PullChange[] = [];
  for (const entry of log) {
    const latest = latestByRow.get(entry.rowId);
    if (latest !== entry) continue; // superseded within this page
    const collection = entry.collection as SyncCollection;
    if (entry.op === 'delete') {
      changes.push({
        seq: entry.serverSeq,
        collection,
        op: 'delete',
        rowId: entry.rowId,
      });
      continue;
    }
    const row = rows.get(`${collection}:${entry.rowId}`);
    if (row === undefined) {
      // row vanished since, was soft-deleted, or is out of scope → tombstone
      changes.push({
        seq: entry.serverSeq,
        collection,
        op: 'delete',
        rowId: entry.rowId,
      });
      continue;
    }
    changes.push({
      seq: entry.serverSeq,
      collection,
      op: 'upsert',
      rowId: entry.rowId,
      row,
    });
  }

  const nextCursor = log.length > 0 ? log[log.length - 1]!.serverSeq : cursor;
  return { changes, nextCursor, hasMore: log.length === PULL_PAGE_SIZE };
}

// --- push -------------------------------------------------------------------

async function canWriteOrgUnit(
  db: Db,
  user: AuthUser,
  orgUnitId: string,
): Promise<boolean> {
  if (user.permissions.includes('system:admin')) return true;
  const entryScopes = user.orgUnits.filter((o) => o.scope === 'data_entry');
  if (entryScopes.length === 0) return false;
  const target = await db
    .select({ path: orgUnit.path })
    .from(orgUnit)
    .where(and(eq(orgUnit.id, orgUnitId), isNull(orgUnit.deletedAt)));
  if (!target[0]) return false;
  const roots = await db
    .select({ path: orgUnit.path })
    .from(orgUnit)
    .where(
      inArray(
        orgUnit.id,
        entryScopes.map((o) => o.orgUnitId),
      ),
    );
  return roots.some(
    (r) => target[0]!.path === r.path || target[0]!.path.startsWith(`${r.path}.`),
  );
}

async function applyDataValueUpsert(
  db: Db,
  user: AuthUser,
  op: SyncOp,
): Promise<PushResult> {
  const payload = dataValueUpsertPayloadSchema.parse(op.payload);

  if (!(await canWriteOrgUnit(db, user, payload.orgUnitId))) {
    return { opId: op.opId, status: 'rejected', error: 'org unit out of scope' };
  }

  const des = await db
    .select()
    .from(dataElement)
    .where(and(eq(dataElement.id, payload.dataElementId), isNull(dataElement.deletedAt)));
  const de = des[0];
  if (!de) {
    return { opId: op.opId, status: 'rejected', error: 'unknown data element' };
  }
  let optionCodes: string[] | undefined;
  if (de.valueType === 'OPTION' && de.optionSetId) {
    optionCodes = (
      await db
        .select({ code: option.code })
        .from(option)
        .where(and(eq(option.optionSetId, de.optionSetId), isNull(option.deletedAt)))
    ).map((o) => o.code);
  }
  const valueError = validateValue(de.valueType, payload.value, { optionCodes });
  if (valueError) {
    return { opId: op.opId, status: 'rejected', error: valueError };
  }

  // Period window (spec §7.3): the period must be open for at least one live
  // dataset that contains this element and is assigned to this org unit.
  const candidateDatasets = await db
    .select({
      frequency: dataset.frequency,
      openFuturePeriods: dataset.openFuturePeriods,
      expiryDays: dataset.expiryDays,
    })
    .from(dataset)
    .innerJoin(datasetElements, eq(datasetElements.datasetId, dataset.id))
    .innerJoin(datasetOrgUnits, eq(datasetOrgUnits.datasetId, dataset.id))
    .where(
      and(
        eq(datasetElements.dataElementId, payload.dataElementId),
        eq(datasetOrgUnits.orgUnitId, payload.orgUnitId),
        isNull(dataset.deletedAt),
      ),
    );
  if (candidateDatasets.length === 0) {
    return {
      opId: op.opId,
      status: 'rejected',
      error: 'no dataset collects this element at this org unit',
    };
  }
  const statuses = candidateDatasets.map((d) => periodOpenStatus(payload.period, d));
  if (!statuses.includes('open')) {
    const reason = statuses.includes('future')
      ? 'period is in the future'
      : statuses.includes('expired')
        ? 'entry for this period has closed'
        : 'period does not match the dataset frequency';
    return { opId: op.opId, status: 'rejected', error: reason };
  }

  const existing = await db
    .select()
    .from(dataValue)
    .where(
      and(
        eq(dataValue.dataElementId, payload.dataElementId),
        eq(dataValue.orgUnitId, payload.orgUnitId),
        eq(dataValue.period, payload.period),
        eq(dataValue.categoryOptionComboId, payload.categoryOptionComboId),
      ),
    );
  const current = existing[0];

  if (!current) {
    await db.insert(dataValue).values({
      ...payload,
      storedBy: user.id,
      clientTs: op.clientTs,
    });
    await db.insert(dataValueAudit).values({
      dataValueId: payload.id,
      oldValue: null,
      newValue: payload.value,
      actor: user.id,
      action: 'create',
    });
    return { opId: op.opId, status: 'applied', serverVersion: 1 };
  }

  if (op.baseVersion !== current.version) {
    await db.insert(dataValueAudit).values({
      dataValueId: current.id,
      oldValue: current.value,
      newValue: payload.value,
      actor: user.id,
      action: 'sync_conflict',
    });
    return {
      opId: op.opId,
      status: 'conflict',
      conflict: {
        serverId: current.id,
        serverValue: current.value,
        serverActor: current.storedBy,
        serverTs: current.updatedAt,
        serverVersion: current.version,
      },
    };
  }

  await db
    .update(dataValue)
    .set({
      value: payload.value,
      comment: payload.comment,
      storedBy: user.id,
      clientTs: op.clientTs,
      updatedAt: sql`now()`,
      version: sql`${dataValue.version} + 1`,
    })
    .where(eq(dataValue.id, current.id));
  await db.insert(dataValueAudit).values({
    dataValueId: current.id,
    oldValue: current.value,
    newValue: payload.value,
    actor: user.id,
    action: 'update',
  });
  return { opId: op.opId, status: 'applied', serverVersion: current.version + 1 };
}

async function applyDataValueDelete(
  db: Db,
  user: AuthUser,
  op: SyncOp,
): Promise<PushResult> {
  const payload = dataValueDeletePayloadSchema.parse(op.payload);
  const existing = await db.select().from(dataValue).where(eq(dataValue.id, payload.id));
  const current = existing[0];
  if (!current) return { opId: op.opId, status: 'applied' }; // already gone

  if (!(await canWriteOrgUnit(db, user, current.orgUnitId))) {
    return { opId: op.opId, status: 'rejected', error: 'org unit out of scope' };
  }
  if (op.baseVersion !== current.version) {
    return {
      opId: op.opId,
      status: 'conflict',
      conflict: {
        serverId: current.id,
        serverValue: current.value,
        serverActor: current.storedBy,
        serverTs: current.updatedAt,
        serverVersion: current.version,
      },
    };
  }
  await db.delete(dataValue).where(eq(dataValue.id, payload.id));
  await db.insert(dataValueAudit).values({
    dataValueId: payload.id,
    oldValue: current.value,
    newValue: null,
    actor: user.id,
    action: 'delete',
  });
  return { opId: op.opId, status: 'applied' };
}

async function applySubmissionComplete(
  db: Db,
  user: AuthUser,
  op: SyncOp,
): Promise<PushResult> {
  const payload = submissionCompletePayloadSchema.parse(op.payload);

  if (!(await canWriteOrgUnit(db, user, payload.orgUnitId))) {
    return { opId: op.opId, status: 'rejected', error: 'org unit out of scope' };
  }
  const dsRows = await db
    .select()
    .from(dataset)
    .where(and(eq(dataset.id, payload.datasetId), isNull(dataset.deletedAt)));
  const ds = dsRows[0];
  if (!ds) return { opId: op.opId, status: 'rejected', error: 'unknown dataset' };

  const assigned = await db
    .select()
    .from(datasetOrgUnits)
    .where(
      and(
        eq(datasetOrgUnits.datasetId, payload.datasetId),
        eq(datasetOrgUnits.orgUnitId, payload.orgUnitId),
      ),
    );
  if (assigned.length === 0) {
    return { opId: op.opId, status: 'rejected', error: 'dataset not assigned here' };
  }
  const period = parsePeriod(payload.period);
  if (!period || period.type !== ds.frequency) {
    return {
      opId: op.opId,
      status: 'rejected',
      error: `period must be ${ds.frequency.toLowerCase()}`,
    };
  }
  const windowStatus = periodOpenStatus(payload.period, ds);
  if (windowStatus !== 'open') {
    return {
      opId: op.opId,
      status: 'rejected',
      error:
        windowStatus === 'future'
          ? 'period is in the future'
          : 'entry for this period has closed',
    };
  }

  // server re-runs validation rules (spec §7.3) — errors block completion
  const rules = rulesForDataset(
    await db.select().from(validationRule).where(isNull(validationRule.deletedAt)),
    payload.datasetId,
  );
  if (rules.length > 0) {
    const values = await db
      .select({
        dataElementId: dataValue.dataElementId,
        categoryOptionComboId: dataValue.categoryOptionComboId,
        value: dataValue.value,
      })
      .from(dataValue)
      .where(
        and(
          eq(dataValue.orgUnitId, payload.orgUnitId),
          eq(dataValue.period, payload.period),
        ),
      );
    const [des, cocs, opts] = await Promise.all([
      db
        .select({ id: dataElement.id, code: dataElement.code })
        .from(dataElement)
        .where(isNull(dataElement.deletedAt)),
      db
        .select({ id: categoryOptionCombo.id, optionIds: categoryOptionCombo.optionIds })
        .from(categoryOptionCombo),
      db
        .select({ id: categoryOption.id, code: categoryOption.code })
        .from(categoryOption)
        .where(isNull(categoryOption.deletedAt)),
    ]);
    const failingErrors = evaluateRules(rules, {
      values,
      dataElements: des,
      categoryOptionCombos: cocs,
      categoryOptions: opts,
    }).filter((r) => r.ok === false && r.severity === 'error');
    if (failingErrors.length > 0) {
      return {
        opId: op.opId,
        status: 'rejected',
        error: `validation errors: ${failingErrors.map((r) => r.name).join('; ')}`,
      };
    }
  }

  const existing = await db
    .select()
    .from(submission)
    .where(
      and(
        eq(submission.datasetId, payload.datasetId),
        eq(submission.orgUnitId, payload.orgUnitId),
        eq(submission.period, payload.period),
      ),
    );
  const current = existing[0];
  if (!current) {
    await db.insert(submission).values({
      id: payload.id,
      datasetId: payload.datasetId,
      orgUnitId: payload.orgUnitId,
      period: payload.period,
      status: 'completed',
      completedBy: user.id,
      completedAt: sql`now()`,
      note: payload.note,
    });
    return { opId: op.opId, status: 'applied', serverVersion: 1 };
  }
  if (current.status === 'approved') {
    return {
      opId: op.opId,
      status: 'rejected',
      error: 'submission already approved',
    };
  }
  await db
    .update(submission)
    .set({
      status: 'completed',
      completedBy: user.id,
      completedAt: sql`now()`,
      note: payload.note,
      updatedAt: sql`now()`,
      version: sql`${submission.version} + 1`,
    })
    .where(eq(submission.id, current.id));
  return { opId: op.opId, status: 'applied', serverVersion: current.version + 1 };
}

export async function push(
  db: Db,
  user: AuthUser,
  deviceId: string,
  ops: SyncOp[],
): Promise<PushResult[]> {
  const batchHash = createHash('sha256')
    .update(ops.map((o) => o.opId).join(','))
    .digest('hex');
  await db.insert(syncPushJournal).values({ deviceId, batchHash, opCount: ops.length });
  await db
    .insert(syncDevice)
    .values({ deviceId, userId: user.id, lastPushAt: sql`now()` })
    .onConflictDoUpdate({
      target: syncDevice.deviceId,
      set: { lastSeen: sql`now()`, lastPushAt: sql`now()`, userId: user.id },
    });

  const results: PushResult[] = [];
  for (const op of ops) {
    // ordered per device; one transaction per op — partial success allowed
    const result = await db
      .transaction(async (tx) => {
        const txDb = tx as unknown as Db;
        const seen = await tx.select().from(syncOp).where(eq(syncOp.opId, op.opId));
        if (seen[0]) {
          // idempotent in OUTCOME: a replayed op returns its original result.
          // Only originally-applied ops report `duplicate` — a conflict or
          // rejection must surface again, not be masked (spec §6.1).
          const original = seen[0].result as PushResult;
          return original.status === 'applied'
            ? { ...original, status: 'duplicate' as const }
            : original;
        }

        let r: PushResult;
        try {
          r =
            op.kind === 'dataValue.upsert'
              ? await applyDataValueUpsert(txDb, user, op)
              : op.kind === 'dataValue.delete'
                ? await applyDataValueDelete(txDb, user, op)
                : await applySubmissionComplete(txDb, user, op);
        } catch (err) {
          // validation problems are permanent → rejected, never retried
          if (err instanceof AppError || err instanceof Error) {
            r = {
              opId: op.opId,
              status: 'rejected',
              error: err.message.slice(0, 500),
            };
          } else {
            throw err;
          }
        }
        await tx.insert(syncOp).values({
          opId: op.opId,
          deviceId,
          kind: op.kind,
          status: r.status,
          result: r,
        });
        return r;
      })
      .catch((err: unknown): PushResult => {
        // transaction-level failure (e.g. db connectivity) — client retries
        throw err instanceof Error ? err : new Error(String(err));
      });
    results.push(result);
  }
  return results;
}

export async function syncStatus(db: Db) {
  const latest = await db
    .select({ seq: sql<number>`coalesce(max(server_seq), 0)` })
    .from(syncChangeLog);
  const devices = await db.select().from(syncDevice);
  return {
    serverTime: new Date().toISOString(),
    latestSeq: Number(latest[0]?.seq ?? 0),
    devices,
  };
}

export function ensureValidCursor(raw: string | undefined): number {
  const cursor = raw === undefined ? 0 : Number(raw);
  if (!Number.isInteger(cursor) || cursor < 0) {
    throw badRequest('invalid cursor');
  }
  return cursor;
}
