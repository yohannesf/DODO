// Sync protocol integration tests (spec §6, §10): idempotent push with
// replay, base-version conflicts, scoped pull with tombstones.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { uuidv7, type PullResponse } from '@dodo/shared';
import { buildApp } from './app.js';
import { bootstrapAdmin } from './bootstrap.js';
import { createDb, createPool } from './db/index.js';
import { runMigrations } from './migrate.js';

let container: StartedPostgreSqlContainer;
let pool: pg.Pool;
let app: FastifyInstance;
let adminToken: string;
let fieldToken: string;

// fixture ids
let northId: string;
let southId: string;
let deBoreholesId: string;

const DEVICE_A = uuidv7();
const DEVICE_B = uuidv7();

async function api(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  token: string,
  body?: unknown,
) {
  const res = await app.inject({
    method,
    url,
    payload: body as object | undefined,
    headers: { authorization: `Bearer ${token}` },
  });
  return { status: res.statusCode, body: res.statusCode === 204 ? null : res.json() };
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgis/postgis:16-3.5').start();
  const uri = container.getConnectionUri();
  await runMigrations(uri);
  pool = createPool(uri);
  const db = createDb(pool);
  await bootstrapAdmin(db, 'admin-test-password');
  app = await buildApp({
    db,
    health: { dbPing: async () => true, version: 'test' },
    logger: false,
  });
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'admin', password: 'admin-test-password' },
  });
  adminToken = login.json().accessToken;

  // minimal config: country → two regions; one data element; field user in North
  const country = await api('POST', '/api/metadata/org-units', adminToken, {
    name: 'Testland',
    shortName: 'TL',
    code: 'TL',
  });
  const north = await api('POST', '/api/metadata/org-units', adminToken, {
    name: 'North',
    shortName: 'North',
    code: 'TL-N',
    parentId: country.body.id,
  });
  northId = north.body.id;
  const south = await api('POST', '/api/metadata/org-units', adminToken, {
    name: 'South',
    shortName: 'South',
    code: 'TL-S',
    parentId: country.body.id,
  });
  southId = south.body.id;

  const de = await api('POST', '/api/metadata/data-elements', adminToken, {
    name: 'Boreholes rehabilitated',
    shortName: 'Boreholes',
    code: 'DE-BH',
    valueType: 'INTEGER_ZERO_OR_POSITIVE',
  });
  deBoreholesId = de.body.id;

  const roles = await api('GET', '/api/metadata/roles', adminToken);
  const dataEntry = roles.body.find((r: { code: string }) => r.code === 'DATA_ENTRY');
  await api('POST', '/api/metadata/users', adminToken, {
    username: 'field.north',
    displayName: 'North Field User',
    password: 'field-password-1',
    roleIds: [dataEntry.id],
    orgUnits: [
      { orgUnitId: northId, scope: 'data_entry' },
      { orgUnitId: northId, scope: 'data_view' },
    ],
  });
  const fieldLogin = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'field.north', password: 'field-password-1' },
  });
  fieldToken = fieldLogin.json().accessToken;
});

afterAll(async () => {
  await pool?.end();
  await container?.stop();
});

const pullAll = async (token: string, cursor = 0) => {
  const res = await api('GET', `/api/sync/pull?cursor=${cursor}`, token);
  expect(res.status).toBe(200);
  return res.body as PullResponse;
};

describe('pull', () => {
  it('streams the scoped snapshot from cursor 0', async () => {
    const full = await pullAll(adminToken);
    const collections = new Set(full.changes.map((c) => c.collection));
    expect(collections.has('orgUnits')).toBe(true);
    expect(collections.has('dataElements')).toBe(true);
    expect(full.nextCursor).toBeGreaterThan(0);
    expect(full.hasMore).toBe(false);

    // field user sees only the North subtree
    const scoped = await pullAll(fieldToken);
    const orgUnitUpserts = scoped.changes.filter(
      (c) => c.collection === 'orgUnits' && c.op === 'upsert',
    );
    const names = orgUnitUpserts.map((c) => (c.row as { name: string }).name);
    expect(names).toContain('North');
    expect(names).not.toContain('South');
  });

  it('turns deletes and out-of-scope rows into tombstones', async () => {
    const before = await pullAll(adminToken);
    const program = await api('POST', '/api/metadata/programs', adminToken, {
      name: 'Temp',
      code: 'TEMP',
    });
    await api('DELETE', `/api/metadata/programs/${program.body.id}`, adminToken);

    const after = await pullAll(adminToken, before.nextCursor);
    const tombstone = after.changes.find(
      (c) => c.collection === 'programs' && c.rowId === program.body.id,
    );
    expect(tombstone?.op).toBe('delete');
  });
});

describe('push', () => {
  const cellId = uuidv7();
  const op = (overrides: Record<string, unknown> = {}) => ({
    opId: uuidv7(),
    kind: 'dataValue.upsert',
    clientTs: new Date().toISOString(),
    payload: {
      id: cellId,
      dataElementId: deBoreholesId,
      orgUnitId: northId,
      period: '2026-05',
      categoryOptionComboId: '019754a0-0000-7000-8000-00000000c0c1',
      value: '12',
    },
    ...overrides,
  });

  it('applies new values and is idempotent on replay', async () => {
    const first = op();
    const res = await api('POST', '/api/sync/push', fieldToken, {
      deviceId: DEVICE_A,
      ops: [first],
    });
    expect(res.body.results[0]).toMatchObject({ status: 'applied', serverVersion: 1 });

    // replay the exact same batch — safe to retry forever (§6.1)
    const replay = await api('POST', '/api/sync/push', fieldToken, {
      deviceId: DEVICE_A,
      ops: [first],
    });
    expect(replay.body.results[0].status).toBe('duplicate');

    // value exists exactly once
    const { rows } = await pool.query(
      'select value, version from data_value where id = $1',
      [cellId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe('12');
  });

  it('updates with matching baseVersion, conflicts otherwise', async () => {
    const update = op({ baseVersion: 1 });
    (update.payload as { value: string }).value = '15';
    const ok = await api('POST', '/api/sync/push', fieldToken, {
      deviceId: DEVICE_A,
      ops: [update],
    });
    expect(ok.body.results[0]).toMatchObject({ status: 'applied', serverVersion: 2 });

    // second client edited the same cell from a stale base
    const stale = op({ baseVersion: 1 });
    (stale.payload as { value: string; id: string }).value = '99';
    (stale.payload as { id: string }).id = uuidv7(); // different client row id, same cell
    const conflict = await api('POST', '/api/sync/push', fieldToken, {
      deviceId: DEVICE_B,
      ops: [stale],
    });
    expect(conflict.body.results[0].status).toBe('conflict');
    expect(conflict.body.results[0].conflict.serverValue).toBe('15');

    // replaying a conflicted op surfaces the conflict again — a lost
    // response must never mask it as a plain duplicate
    const conflictReplay = await api('POST', '/api/sync/push', fieldToken, {
      deviceId: DEVICE_B,
      ops: [stale],
    });
    expect(conflictReplay.body.results[0].status).toBe('conflict');
    expect(conflictReplay.body.results[0].conflict.serverValue).toBe('15');

    // server value untouched
    const { rows } = await pool.query('select value from data_value where id = $1', [
      cellId,
    ]);
    expect(rows[0].value).toBe('15');
  });

  it('rejects invalid values and out-of-scope org units permanently', async () => {
    const bad = op({ opId: uuidv7() });
    (bad.payload as { value: string; id: string }).value = '-4';
    (bad.payload as { id: string }).id = uuidv7();
    (bad.payload as { period: string }).period = '2026-04';
    const res = await api('POST', '/api/sync/push', fieldToken, {
      deviceId: DEVICE_A,
      ops: [bad],
    });
    expect(res.body.results[0].status).toBe('rejected');
    expect(res.body.results[0].error).toMatch(/zero or a positive/);

    const outOfScope = op({ opId: uuidv7() });
    (outOfScope.payload as { orgUnitId: string; id: string }).orgUnitId = southId;
    (outOfScope.payload as { id: string }).id = uuidv7();
    const res2 = await api('POST', '/api/sync/push', fieldToken, {
      deviceId: DEVICE_A,
      ops: [outOfScope],
    });
    expect(res2.body.results[0].status).toBe('rejected');
    expect(res2.body.results[0].error).toMatch(/scope/);
  });

  it('replicates pushed values to other clients via pull', async () => {
    const adminPull = await pullAll(adminToken);
    const valueChange = adminPull.changes.find(
      (c) => c.collection === 'dataValues' && c.op === 'upsert',
    );
    expect(valueChange).toBeDefined();
    expect((valueChange!.row as { value: string }).value).toBe('15');
  });

  it('supports dataValue.delete with version check', async () => {
    const del = {
      opId: uuidv7(),
      kind: 'dataValue.delete',
      clientTs: new Date().toISOString(),
      payload: { id: cellId },
      baseVersion: 2,
    };
    const res = await api('POST', '/api/sync/push', fieldToken, {
      deviceId: DEVICE_A,
      ops: [del],
    });
    expect(res.body.results[0].status).toBe('applied');
    const { rows } = await pool.query('select 1 from data_value where id = $1', [cellId]);
    expect(rows).toHaveLength(0);
  });
});

describe('status', () => {
  it('reports devices and latest seq to admins only', async () => {
    const res = await api('GET', '/api/sync/status', adminToken);
    expect(res.status).toBe(200);
    expect(res.body.latestSeq).toBeGreaterThan(0);
    expect(res.body.devices.map((d: { deviceId: string }) => d.deviceId).sort()).toEqual(
      [DEVICE_A, DEVICE_B].sort(),
    );

    const forbidden = await api('GET', '/api/sync/status', fieldToken);
    expect(forbidden.status).toBe(403);
  });
});

describe('submission.complete', () => {
  it('completes a submission, replicates it, rejects bad periods', async () => {
    // assign a dataset to North first
    const ds = await api('POST', '/api/metadata/datasets', adminToken, {
      name: 'North monthly',
      code: 'DS-NORTH-M',
      frequency: 'MONTHLY',
      elements: [
        { dataElementId: deBoreholesId, sortOrder: 0, section: '', required: true },
      ],
      orgUnitIds: [northId],
    });

    const subId = uuidv7();
    const complete = (period: string, opId = uuidv7()) => ({
      opId,
      kind: 'submission.complete',
      clientTs: new Date().toISOString(),
      payload: {
        id: subId,
        datasetId: ds.body.id,
        orgUnitId: northId,
        period,
        note: 'all done',
      },
    });

    const bad = await api('POST', '/api/sync/push', fieldToken, {
      deviceId: DEVICE_A,
      ops: [complete('2026-Q1')],
    });
    expect(bad.body.results[0].status).toBe('rejected');
    expect(bad.body.results[0].error).toMatch(/monthly/);

    const op = complete('2026-05');
    const ok = await api('POST', '/api/sync/push', fieldToken, {
      deviceId: DEVICE_A,
      ops: [op],
    });
    expect(ok.body.results[0]).toMatchObject({ status: 'applied', serverVersion: 1 });

    const replay = await api('POST', '/api/sync/push', fieldToken, {
      deviceId: DEVICE_A,
      ops: [op],
    });
    expect(replay.body.results[0].status).toBe('duplicate');

    const pulled = await pullAll(adminToken);
    const sub = pulled.changes.find(
      (c) => c.collection === 'submissions' && c.rowId === subId,
    );
    expect(sub?.op).toBe('upsert');
    expect((sub!.row as { status: string }).status).toBe('completed');
  });
});

describe('m6: approvals, hardening, exports', () => {
  it('blocks completion when an error-severity rule fails', async () => {
    // rule: boreholes must be <= 5 (error)
    await api('POST', '/api/metadata/validation-rules', adminToken, {
      name: 'Boreholes sanity',
      code: 'VR-BH-MAX',
      leftExpr: '#{DE-BH}',
      op: '<=',
      rightExpr: '5',
      severity: 'error',
    });
    const ds = await api('POST', '/api/metadata/datasets', adminToken, {
      name: 'North monthly 2',
      code: 'DS-NORTH-M2',
      frequency: 'MONTHLY',
      requiresApproval: true,
      approvalLevels: 2,
      elements: [
        { dataElementId: deBoreholesId, sortOrder: 0, section: '', required: false },
      ],
      orgUnitIds: [northId],
    });

    // push an offending value for 2026-08
    const valueOp = {
      opId: uuidv7(),
      kind: 'dataValue.upsert',
      clientTs: new Date().toISOString(),
      payload: {
        id: uuidv7(),
        dataElementId: deBoreholesId,
        orgUnitId: northId,
        period: '2026-08',
        categoryOptionComboId: '019754a0-0000-7000-8000-00000000c0c1',
        value: '12',
      },
    };
    await api('POST', '/api/sync/push', fieldToken, {
      deviceId: DEVICE_A,
      ops: [valueOp],
    });

    const completeOp = (id: string) => ({
      opId: uuidv7(),
      kind: 'submission.complete',
      clientTs: new Date().toISOString(),
      payload: {
        id,
        datasetId: ds.body.id,
        orgUnitId: northId,
        period: '2026-08',
        note: '',
      },
    });
    const blocked = await api('POST', '/api/sync/push', fieldToken, {
      deviceId: DEVICE_A,
      ops: [completeOp(uuidv7())],
    });
    expect(blocked.body.results[0].status).toBe('rejected');
    expect(blocked.body.results[0].error).toMatch(/Boreholes sanity/);

    // fix the value → completion passes → two-level approval chain
    const fixOp = {
      ...valueOp,
      opId: uuidv7(),
      baseVersion: 1,
      payload: { ...valueOp.payload, value: '4' },
    };
    await api('POST', '/api/sync/push', fieldToken, { deviceId: DEVICE_A, ops: [fixOp] });
    const subId = uuidv7();
    const done = await api('POST', '/api/sync/push', fieldToken, {
      deviceId: DEVICE_A,
      ops: [completeOp(subId)],
    });
    expect(done.body.results[0].status).toBe('applied');

    // approvals: level 1 keeps it completed, level 2 approves
    const pending = await api('GET', '/api/approvals', adminToken);
    const mine = pending.body.find(
      (p: { submissionId: string }) => p.submissionId === subId,
    );
    expect(mine.approvalLevels).toBe(2);

    const first = await api('POST', `/api/approvals/${subId}/approve`, adminToken, {
      comment: 'level 1 ok',
    });
    expect(first.body).toMatchObject({ submissionStatus: 'completed', level: 1 });

    const second = await api('POST', `/api/approvals/${subId}/approve`, adminToken, {
      comment: 'level 2 ok',
    });
    expect(second.body).toMatchObject({ submissionStatus: 'approved', level: 2 });

    const hist = await api('GET', `/api/approvals/${subId}/history`, adminToken);
    expect(hist.body).toHaveLength(2);

    // approved submissions cannot be re-completed
    const again = await api('POST', '/api/sync/push', fieldToken, {
      deviceId: DEVICE_A,
      ops: [completeOp(subId)],
    });
    expect(again.body.results[0].status).toBe('rejected');
  });

  it('round-trips the org unit csv export through the importer', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/export/org-units.csv',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const csv = res.body;
    expect(csv.split('\n')[0]).toBe(
      'code,name,short_name,parent_code,opening_date,latitude,longitude',
    );

    const reimport = await api('POST', '/api/metadata/org-units/import-csv', adminToken, {
      csv,
      dryRun: true,
    });
    expect(reimport.body.errors).toBe(0);
    expect(reimport.body.created).toBe(0); // pure update — nothing new
    expect(reimport.body.updated).toBeGreaterThan(0);
  });

  it('exports data values as csv and xlsx', async () => {
    const csv = await app.inject({
      method: 'GET',
      url: '/api/export/data-values.csv',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(csv.statusCode).toBe(200);
    expect(csv.body).toContain('DE-BH');
    expect(csv.body).toContain('2026-08');

    const xlsx = await app.inject({
      method: 'GET',
      url: '/api/export/data-values.xlsx',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(xlsx.statusCode).toBe(200);
    // xlsx = zip container
    expect(xlsx.rawPayload.subarray(0, 2).toString('latin1')).toBe('PK');
  });

  it('rate-limits login attempts', async () => {
    let limited = false;
    for (let i = 0; i < 12; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'nobody', password: 'wrong-password' },
      });
      if (res.statusCode === 429) limited = true;
    }
    expect(limited).toBe(true);
  });
});
