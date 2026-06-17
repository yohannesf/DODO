// M4 acceptance (spec §12): computed indicator values match hand-calculated
// fixtures, including aggregation_op semantics (`sum` flows, `last` stocks)
// and subtree aggregation.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { uuidv7 } from '@dodo/shared';
import { buildApp } from './app.js';
import { bootstrapAdmin } from './bootstrap.js';
import { createDb, createPool, type Db } from './db/index.js';
import { runMigrations } from './migrate.js';
import { runDueSchedules } from './services/export.js';

let container: StartedPostgreSqlContainer;
let pool: pg.Pool;
let app: FastifyInstance;
let token: string;
let db: Db;
const filesDir = path.join(os.tmpdir(), 'dodo-files');

let countryId: string;
let d1Id: string;
let d2Id: string;
let deFlowId: string; // boreholes rehabilitated (sum)
let deStockId: string; // functional water points (last)
let dePeopleId: string; // people served, by sex (sum)
let indPctFemaleId: string;
let indPerCapitaId: string;

const PE = ['2026-01', '2026-02'];

async function api(method: 'GET' | 'POST', url: string, body?: unknown) {
  const res = await app.inject({
    method,
    url,
    payload: body as object | undefined,
    headers: { authorization: `Bearer ${token}` },
  });
  expect(res.statusCode, `${method} ${url} → ${res.body}`).toBeLessThan(300);
  return res.json();
}

async function pushValues(
  values: Array<{ de: string; ou: string; pe: string; coc?: string; value: string }>,
) {
  const ops = values.map((v) => ({
    opId: uuidv7(),
    kind: 'dataValue.upsert',
    clientTs: new Date().toISOString(),
    payload: {
      id: uuidv7(),
      dataElementId: v.de,
      orgUnitId: v.ou,
      period: v.pe,
      categoryOptionComboId: v.coc ?? '019754a0-0000-7000-8000-00000000c0c1',
      value: v.value,
    },
  }));
  const res = await api('POST', '/api/sync/push', { deviceId: uuidv7(), ops });
  for (const r of res.results) expect(r.status).toBe('applied');
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgis/postgis:16-3.5').start();
  const uri = container.getConnectionUri();
  await runMigrations(uri);
  pool = createPool(uri);
  db = createDb(pool);
  await bootstrapAdmin(db, 'admin-test-password');
  app = await buildApp({
    db,
    health: { dbPing: async () => true, version: 'test' },
    logger: false,
  });
  token = (
    await app
      .inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'admin', password: 'admin-test-password' },
      })
      .then((r) => r.json())
  ).accessToken;

  // org tree: country with two districts
  const country = await api('POST', '/api/metadata/org-units', {
    name: 'Country',
    shortName: 'C',
    code: 'AN-C',
  });
  countryId = country.id;
  const d1 = await api('POST', '/api/metadata/org-units', {
    name: 'District 1',
    shortName: 'D1',
    code: 'AN-D1',
    parentId: countryId,
  });
  d1Id = d1.id;
  const d2 = await api('POST', '/api/metadata/org-units', {
    name: 'District 2',
    shortName: 'D2',
    code: 'AN-D2',
    parentId: countryId,
  });
  d2Id = d2.id;

  // disaggregation: Sex (F/M)
  const sex = await api('POST', '/api/metadata/categories', {
    name: 'Sex',
    code: 'AN-SEX',
  });
  await api('POST', '/api/metadata/category-options', {
    categoryId: sex.id,
    name: 'Female',
    code: 'AN-SEX-F',
    sortOrder: 0,
  });
  await api('POST', '/api/metadata/category-options', {
    categoryId: sex.id,
    name: 'Male',
    code: 'AN-SEX-M',
    sortOrder: 1,
  });
  const combo = await api('POST', '/api/metadata/category-combos', {
    name: 'Sex',
    code: 'AN-SEX-COMBO',
    categoryIds: [sex.id],
  });

  const deFlow = await api('POST', '/api/metadata/data-elements', {
    name: 'Boreholes rehabilitated',
    shortName: 'Boreholes',
    code: 'AN-BOREHOLES',
    valueType: 'INTEGER_ZERO_OR_POSITIVE',
    aggregationOp: 'sum',
  });
  deFlowId = deFlow.id;
  const deStock = await api('POST', '/api/metadata/data-elements', {
    name: 'Functional water points',
    shortName: 'Water points',
    code: 'AN-WATERPOINTS',
    valueType: 'INTEGER_ZERO_OR_POSITIVE',
    aggregationOp: 'last',
  });
  deStockId = deStock.id;
  const dePeople = await api('POST', '/api/metadata/data-elements', {
    name: 'People served',
    shortName: 'People',
    code: 'AN-PEOPLE',
    valueType: 'INTEGER_ZERO_OR_POSITIVE',
    aggregationOp: 'sum',
    categoryComboId: combo.id,
  });
  dePeopleId = dePeople.id;

  const indPct = await api('POST', '/api/metadata/indicators', {
    name: '% of people served who are female',
    code: 'AN-PCT-FEMALE',
    numeratorExpr: '#{AN-PEOPLE.AN-SEX-F}',
    denominatorExpr: '#{AN-PEOPLE}',
    indicatorType: 'percent',
    decimals: 1,
  });
  indPctFemaleId = indPct.id;
  const indCapita = await api('POST', '/api/metadata/indicators', {
    name: 'People served per water point',
    code: 'AN-PER-WP',
    numeratorExpr: '#{AN-PEOPLE}',
    denominatorExpr: '#{AN-WATERPOINTS}',
    indicatorType: 'number',
    decimals: 2,
  });
  indPerCapitaId = indCapita.id;

  // sex COCs
  const cocs = await api(
    'GET',
    `/api/metadata/category-combos/${combo.id}/option-combos`,
  );
  const cocF = cocs.find((c: { name: string }) => c.name === 'Female').id;
  const cocM = cocs.find((c: { name: string }) => c.name === 'Male').id;

  // entry windows (spec §7.3) require a dataset collecting these elements
  await api('POST', '/api/metadata/datasets', {
    name: 'Analytics fixture monthly',
    code: 'AN-DS-M',
    frequency: 'MONTHLY',
    elements: [deFlowId, deStockId, dePeopleId].map((id, idx) => ({
      dataElementId: id,
      sortOrder: idx,
      section: '',
      required: false,
    })),
    orgUnitIds: [d1Id, d2Id],
  });

  // fixture values — hand-calculated expectations live in the tests below
  await pushValues([
    // flow (sum): boreholes
    { de: deFlowId, ou: d1Id, pe: '2026-01', value: '3' },
    { de: deFlowId, ou: d2Id, pe: '2026-01', value: '2' },
    { de: deFlowId, ou: d1Id, pe: '2026-02', value: '4' },
    // stock (last): water points
    { de: deStockId, ou: d1Id, pe: '2026-01', value: '10' },
    { de: deStockId, ou: d2Id, pe: '2026-01', value: '8' },
    { de: deStockId, ou: d1Id, pe: '2026-02', value: '12' },
    { de: deStockId, ou: d2Id, pe: '2026-02', value: '9' },
    // people by sex
    { de: dePeopleId, ou: d1Id, pe: '2026-01', coc: cocF, value: '30' },
    { de: dePeopleId, ou: d1Id, pe: '2026-01', coc: cocM, value: '20' },
    { de: dePeopleId, ou: d2Id, pe: '2026-01', coc: cocF, value: '15' },
    { de: dePeopleId, ou: d2Id, pe: '2026-01', coc: cocM, value: '15' },
    { de: dePeopleId, ou: d1Id, pe: '2026-02', coc: cocF, value: '25' },
    { de: dePeopleId, ou: d1Id, pe: '2026-02', coc: cocM, value: '35' },
  ]);
});

afterAll(async () => {
  await pool?.end();
  await container?.stop();
});

function cell(
  result: { rows: Array<{ dx: string; ou: string; pe: string; value: number | null }> },
  dx: string,
  ou: string,
  pe: string,
) {
  return result.rows.find((r) => r.dx === dx && r.ou === ou && r.pe === pe)?.value;
}

describe('analytics aggregation', () => {
  it('sums flows across org units and periods (subtree)', async () => {
    const res = await api(
      'GET',
      `/api/analytics?dx=${deFlowId}&ou=${countryId}&pe=${PE.join(';')}&ouMode=subtree&peTotal=1`,
    );
    // 2026-01: 3+2 = 5 ; 2026-02: 4 ; TOTAL (flow → sum): 9
    expect(cell(res, deFlowId, countryId, '2026-01')).toBe(5);
    expect(cell(res, deFlowId, countryId, '2026-02')).toBe(4);
    expect(cell(res, deFlowId, countryId, 'TOTAL')).toBe(9);
  });

  it('takes the latest period for stocks (`last`)', async () => {
    const res = await api(
      'GET',
      `/api/analytics?dx=${deStockId}&ou=${countryId}&pe=${PE.join(';')}&ouMode=subtree&peTotal=1`,
    );
    // per period sums: 2026-01: 18, 2026-02: 21; TOTAL (stock → last): 21
    expect(cell(res, deStockId, countryId, '2026-01')).toBe(18);
    expect(cell(res, deStockId, countryId, '2026-02')).toBe(21);
    expect(cell(res, deStockId, countryId, 'TOTAL')).toBe(21);
  });

  it('aggregates monthly data under a coarser yearly period', async () => {
    // a yearly period must contain the monthly values, not string-match them
    const res = await api(
      'GET',
      `/api/analytics?dx=${deFlowId}&ou=${countryId}&pe=2026&ouMode=subtree&peTotal=1`,
    );
    // flow: Jan(5) + Feb(4) summed across both months = 9
    expect(cell(res, deFlowId, countryId, '2026')).toBe(9);
    // stock under the year takes the latest real month (Feb = 21), not a sum
    const stock = await api(
      'GET',
      `/api/analytics?dx=${deStockId}&ou=${countryId}&pe=2026&ouMode=subtree&peTotal=1`,
    );
    expect(cell(stock, deStockId, countryId, '2026')).toBe(21);
  });

  it('keeps selected mode to the unit itself', async () => {
    const res = await api(
      'GET',
      `/api/analytics?dx=${deFlowId}&ou=${countryId}&pe=2026-01`,
    );
    // no values recorded directly on the country
    expect(cell(res, deFlowId, countryId, '2026-01')).toBeNull();
  });

  it('computes percent indicators after aggregation', async () => {
    const res = await api(
      'GET',
      `/api/analytics?dx=${indPctFemaleId}&ou=${countryId};${d1Id}&pe=${PE.join(';')}&ouMode=subtree&peTotal=1`,
    );
    // country 2026-01: F=45, all=80 → 56.3% (1 decimal)
    expect(cell(res, indPctFemaleId, countryId, '2026-01')).toBe(56.3);
    // country 2026-02: F=25, all=60 → 41.7%
    expect(cell(res, indPctFemaleId, countryId, '2026-02')).toBe(41.7);
    // country TOTAL: F=70, all=140 → 50%
    expect(cell(res, indPctFemaleId, countryId, 'TOTAL')).toBe(50);
    // district 1 2026-01: F=30, all=50 → 60%
    expect(cell(res, indPctFemaleId, d1Id, '2026-01')).toBe(60);
  });

  it('mixes flow numerator with stock denominator', async () => {
    const res = await api(
      'GET',
      `/api/analytics?dx=${indPerCapitaId}&ou=${countryId}&pe=${PE.join(';')}&ouMode=subtree&peTotal=1`,
    );
    // 2026-01: people 80 / water points 18 = 4.44
    expect(cell(res, indPerCapitaId, countryId, '2026-01')).toBe(4.44);
    // TOTAL: people 140 (sum) / water points 21 (last) = 6.67
    expect(cell(res, indPerCapitaId, countryId, 'TOTAL')).toBe(6.67);
  });

  it('rejects out-of-scope org units for non-admins', async () => {
    const roles = await api('GET', '/api/metadata/roles');
    const viewer = roles.find((r: { code: string }) => r.code === 'VIEWER');
    await api('POST', '/api/metadata/users', {
      username: 'd1.viewer',
      displayName: 'D1 viewer',
      password: 'viewer-password-1',
      roleIds: [viewer.id],
      orgUnits: [{ orgUnitId: d1Id, scope: 'data_view' }],
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'd1.viewer', password: 'viewer-password-1' },
    });
    const viewerToken = login.json().accessToken;

    const ok = await app.inject({
      method: 'GET',
      url: `/api/analytics?dx=${deFlowId}&ou=${d1Id}&pe=2026-01`,
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(ok.statusCode).toBe(200);

    const denied = await app.inject({
      method: 'GET',
      url: `/api/analytics?dx=${deFlowId}&ou=${d2Id}&pe=2026-01`,
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(denied.statusCode).toBe(400);
  });
});

describe('configurable RAG (spec §16.4)', () => {
  it('recalculates status against program-scope thresholds', async () => {
    const prog = await api('POST', '/api/metadata/programs', {
      name: 'RAG Prog',
      code: 'RAGPROG',
    });
    const ind = await api('POST', '/api/metadata/indicators', {
      name: 'Boreholes total',
      code: 'AN-BH-TOTAL',
      numeratorExpr: '#{AN-BOREHOLES}',
      denominatorExpr: '1',
      indicatorType: 'number',
      decimals: 0,
      programId: prog.id,
    });
    // achieved at country/2026-01 (subtree) = 3 + 2 = 5
    await api('POST', '/api/metadata/targets', {
      indicatorId: ind.id,
      orgUnitId: countryId,
      period: '2026-01',
      value: 10,
      kind: 'target',
    });
    // program scope: green ≥ 90, yellow ≥ 40 → 50% achieved lands yellow
    await api('POST', '/api/metadata/rag-configs', {
      programId: prog.id,
      scopeType: 'program',
      scopeId: prog.id,
      greenThreshold: 90,
      yellowThreshold: 40,
    });

    const recalc = await api('POST', '/api/analytics/rag/recalculate', {
      indicatorId: ind.id,
    });
    expect(recalc.computed).toHaveLength(1);
    expect(recalc.computed[0].achieved).toBe(5);
    expect(recalc.computed[0].pct).toBeCloseTo(50);
    expect(recalc.computed[0].status).toBe('yellow');
    expect(recalc.computed[0].configId).toBeTruthy();

    const log = await api('GET', `/api/analytics/rag?indicator=${ind.id}`);
    expect(log).toHaveLength(1);
    expect(log[0].status).toBe('yellow');
  });

  it('falls back to the system default (green ≥ 80) when no config matches', async () => {
    const ind = await api('POST', '/api/metadata/indicators', {
      name: 'Boreholes total 2',
      code: 'AN-BH-TOTAL2',
      numeratorExpr: '#{AN-BOREHOLES}',
      denominatorExpr: '1',
      indicatorType: 'number',
      decimals: 0,
    });
    // target 5 → achieved 5 → 100% ≥ 80 default → green; no config → null
    await api('POST', '/api/metadata/targets', {
      indicatorId: ind.id,
      orgUnitId: countryId,
      period: '2026-01',
      value: 5,
      kind: 'target',
    });
    const recalc = await api('POST', '/api/analytics/rag/recalculate', {
      indicatorId: ind.id,
    });
    expect(recalc.computed[0].status).toBe('green');
    expect(recalc.computed[0].configId).toBeNull();
  });
});

describe('API keys (spec §16.5)', () => {
  it('reads RAG scoped to the key program, enforcing scope and rate limit', async () => {
    const prog = await api('POST', '/api/metadata/programs', {
      name: 'Key Prog',
      code: 'KEYPROG',
    });
    const ind = await api('POST', '/api/metadata/indicators', {
      name: 'BH for key',
      code: 'AN-BH-KEY',
      numeratorExpr: '#{AN-BOREHOLES}',
      denominatorExpr: '1',
      indicatorType: 'number',
      decimals: 0,
      programId: prog.id,
    });
    await api('POST', '/api/metadata/targets', {
      indicatorId: ind.id,
      orgUnitId: countryId,
      period: '2026-01',
      value: 10,
      kind: 'target',
    });
    await api('POST', '/api/analytics/rag/recalculate', { programId: prog.id });

    // read key scoped to this program, limited to the RAG endpoint, 2 req/hr
    const created = await api('POST', '/api/admin/api-keys', {
      name: 'Dashboard poller',
      programId: prog.id,
      accessLevel: 'read',
      allowedEndpoints: ['rag'],
      rateLimitRph: 2,
    });
    expect(created.rawKey).toMatch(/^dodo_/);

    // list never leaks the hash or the raw key
    const list = await api('GET', '/api/admin/api-keys');
    const listed = list.find((k: { id: string }) => k.id === created.id);
    expect(listed.rawKey).toBeUndefined();
    expect(listed.keyHash).toBeUndefined();

    const withKey = (url: string) =>
      app.inject({
        method: 'GET',
        url,
        headers: { authorization: `Bearer ${created.rawKey}` },
      });

    // GET /api/analytics/rag → rows scoped to the key's program
    const r1 = await withKey('/api/analytics/rag');
    expect(r1.statusCode).toBe(200);
    const rows = r1.json() as Array<{ indicatorId: string }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.indicatorId === ind.id)).toBe(true);

    // endpoint scope: a non-allowed endpoint is rejected (does not consume rate)
    const denied = await withKey(
      `/api/analytics?dx=${ind.id}&ou=${countryId}&pe=2026-01`,
    );
    expect(denied.statusCode).toBe(403);

    // rate limit: 2/hr — the third RAG read is 429
    expect((await withKey('/api/analytics/rag')).statusCode).toBe(200);
    expect((await withKey('/api/analytics/rag')).statusCode).toBe(429);
  });
});

describe('target framework extension (spec §16.8)', () => {
  it('accepts assigned_to_id; framework_mapping_id defaults to null', async () => {
    const ind = await api('POST', '/api/metadata/indicators', {
      name: 'Target ext ind',
      code: 'AN-TGT-EXT',
      numeratorExpr: '#{AN-BOREHOLES}',
      denominatorExpr: '1',
      indicatorType: 'number',
      decimals: 0,
    });
    const t = await api('POST', '/api/metadata/targets', {
      indicatorId: ind.id,
      orgUnitId: d1Id,
      period: '2026-01',
      value: 50,
      kind: 'target',
      assignedToId: d1Id,
    });
    expect(t.assignedToId).toBe(d1Id);
    expect(t.frameworkMappingId).toBeNull();
  });
});

describe('export templates (spec §16.11–16.13)', () => {
  it('fills a donor cell, generates a RAG column, advances schedules', async () => {
    const prog = await api('POST', '/api/metadata/programs', {
      name: 'Export Prog',
      code: 'EXPPROG',
    });
    const de = await api('POST', '/api/metadata/data-elements', {
      name: 'Exp DE',
      shortName: 'ExpDE',
      code: 'EXP-DE',
      valueType: 'INTEGER_ZERO_OR_POSITIVE',
    });
    await api('POST', '/api/metadata/datasets', {
      name: 'Exp DS',
      code: 'EXP-DS',
      frequency: 'MONTHLY',
      programId: prog.id,
      elements: [{ dataElementId: de.id, sortOrder: 0, section: '', required: false }],
      orgUnitIds: [d1Id, d2Id],
    });
    // 10 @ d1 + 20 @ d2 (distinct cells) → total 30 in the period window
    await pushValues([
      { de: de.id, ou: d1Id, pe: '2026-01', value: '10' },
      { de: de.id, ou: d2Id, pe: '2026-01', value: '20' },
    ]);

    // upload a donor .xlsx
    const donorWb = new ExcelJS.Workbook();
    donorWb.addWorksheet('Donor');
    const donorBuf = Buffer.from(await donorWb.xlsx.writeBuffer());
    const boundary = '----expdonor';
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="donor.xlsx"\r\n` +
          'Content-Type: application/octet-stream\r\n\r\n',
      ),
      donorBuf,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const up = await app.inject({
      method: 'POST',
      url: '/api/files',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });
    expect(up.statusCode).toBe(201);
    const donorRef = up.json().fileRef as string;

    const tpl = await api('POST', '/api/export/templates', {
      programId: prog.id,
      name: 'Donor template',
      outputFormat: 'excel',
      templateType: 'donor',
      donorFileRef: donorRef,
      periodType: 'fixed',
    });
    await api('POST', '/api/export/template-mappings', {
      templateId: tpl.id,
      dodoField: 'data_value.value',
      donorCellRef: 'C5',
    });
    const job = await api('POST', '/api/export/jobs', {
      templateId: tpl.id,
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
    });
    expect(job.status).toBe('complete');

    const dl = await app.inject({
      method: 'GET',
      url: `/api/export/jobs/${job.id}/download`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(dl.statusCode).toBe(200);
    const outWb = new ExcelJS.Workbook();
    // `as never`: exceljs's bundled Buffer type vs node 22's Buffer<ArrayBufferLike>
    await outWb.xlsx.load(dl.rawPayload as never);
    expect(outWb.worksheets[0]!.getCell('C5').value).toBe(30);

    // generated workbook with a RAG column (flags.include_rag)
    const tpl2 = await api('POST', '/api/export/templates', {
      programId: prog.id,
      name: 'Generated',
      outputFormat: 'excel',
      templateType: 'internal',
      periodType: 'fixed',
      flags: { include_rag: true },
    });
    const job2 = await api('POST', '/api/export/jobs', {
      templateId: tpl2.id,
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
    });
    const dl2 = await app.inject({
      method: 'GET',
      url: `/api/export/jobs/${job2.id}/download`,
      headers: { authorization: `Bearer ${token}` },
    });
    const genWb = new ExcelJS.Workbook();
    await genWb.xlsx.load(dl2.rawPayload as never);
    const header = genWb.worksheets[0]!.getRow(1).values as unknown[];
    expect(header).toContain('RAG');
    expect(header).toContain('Value');

    // scheduled export advances next_run_at after a run
    const sched = await api('POST', '/api/export/scheduled', {
      templateId: tpl2.id,
      frequency: 'quarterly',
      nextRunAt: '2020-01-01T00:00:00.000Z',
    });
    const ran = await runDueSchedules(db, filesDir, new Date('2026-06-16T00:00:00.000Z'));
    expect(ran).toBeGreaterThanOrEqual(1);
    const list = await api('GET', '/api/export/scheduled');
    const updated = list.find((s: { id: string }) => s.id === sched.id);
    expect(updated.lastRunAt).not.toBeNull();
    expect(new Date(updated.nextRunAt).getTime()).toBeGreaterThan(
      new Date('2026-06-16').getTime(),
    );
  });
});
