// Integration tests against real Postgres+PostGIS (spec §10) — one container
// for the whole file.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { DEFAULT_CATEGORY_COMBO_ID } from '@dodo/shared';
import { buildApp } from './app.js';
import { bootstrapAdmin } from './bootstrap.js';
import { createDb, createPool } from './db/index.js';
import { runMigrations } from './migrate.js';

let container: StartedPostgreSqlContainer;
let pool: pg.Pool;
let app: FastifyInstance;
let token: string;

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
  token = login.json().accessToken;
});

afterAll(async () => {
  await pool?.end();
  await container?.stop();
});

const auth = () => ({ authorization: `Bearer ${token}` });

async function post(url: string, body: unknown) {
  const res = await app.inject({
    method: 'POST',
    url,
    payload: body as object,
    headers: auth(),
  });
  return { status: res.statusCode, body: res.json() };
}
async function patch(url: string, body: unknown) {
  const res = await app.inject({
    method: 'PATCH',
    url,
    payload: body as object,
    headers: auth(),
  });
  return { status: res.statusCode, body: res.json() };
}
async function get(url: string) {
  const res = await app.inject({ method: 'GET', url, headers: auth() });
  return { status: res.statusCode, body: res.json() };
}
async function del(url: string) {
  const res = await app.inject({ method: 'DELETE', url, headers: auth() });
  return { status: res.statusCode };
}

describe('auth', () => {
  it('rejects bad credentials and missing tokens', async () => {
    const bad = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'wrong' },
    });
    expect(bad.statusCode).toBe(401);

    const noToken = await app.inject({ method: 'GET', url: '/api/metadata/programs' });
    expect(noToken.statusCode).toBe(401);
  });

  it('issues a session cookie usable for refresh', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'admin-test-password' },
    });
    expect(login.statusCode).toBe(200);
    const cookie = login.cookies.find((c) => c.name === 'dodo_session');
    expect(cookie?.httpOnly).toBe(true);

    const refresh = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      cookies: { dodo_session: cookie!.value },
    });
    expect(refresh.statusCode).toBe(200);
    expect(refresh.json().user.permissions).toContain('system:admin');

    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${refresh.json().accessToken}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().username).toBe('admin');
  });

  it('enforces permissions for non-admin users', async () => {
    // viewer role: metadata:read but not metadata:write
    const roles = await get('/api/metadata/roles');
    const viewer = roles.body.find((r: { code: string }) => r.code === 'VIEWER');
    await post('/api/metadata/users', {
      username: 'viewer.user',
      displayName: 'Viewer',
      password: 'viewer-password-1',
      roleIds: [viewer.id],
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'viewer.user', password: 'viewer-password-1' },
    });
    const viewerToken = login.json().accessToken;

    const read = await app.inject({
      method: 'GET',
      url: '/api/metadata/programs',
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(read.statusCode).toBe(200);

    const write = await app.inject({
      method: 'POST',
      url: '/api/metadata/programs',
      payload: { name: 'Nope', code: 'NOPE' },
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    expect(write.statusCode).toBe(403);
  });
});

describe('programs crud', () => {
  it('creates, versions, soft-deletes', async () => {
    const created = await post('/api/metadata/programs', {
      name: 'WASH',
      code: 'WASH',
    });
    expect(created.status).toBe(201);
    expect(created.body.version).toBe(1);

    const updated = await patch(`/api/metadata/programs/${created.body.id}`, {
      description: 'Water, sanitation and hygiene',
    });
    expect(updated.body.version).toBe(2);

    const dup = await post('/api/metadata/programs', { name: 'X', code: 'WASH' });
    expect(dup.status).toBe(409);

    expect(await del(`/api/metadata/programs/${created.body.id}`)).toEqual({
      status: 204,
    });
    const listed = await get('/api/metadata/programs');
    expect(listed.body).toHaveLength(0);

    // code reusable after soft delete
    const again = await post('/api/metadata/programs', { name: 'WASH2', code: 'WASH' });
    expect(again.status).toBe(201);
  });

  it('rejects invalid input with zod issues', async () => {
    const res = await post('/api/metadata/programs', { name: '', code: '!' });
    expect(res.status).toBe(400);
    expect(res.body.issues.length).toBeGreaterThan(0);
  });
});

describe('program custom fields (spec §16.2)', () => {
  it('expands program with status, currency, dates, metadata', async () => {
    const created = await post('/api/metadata/programs', {
      name: 'Health Project',
      code: 'HEALTHPRJ',
      status: 'draft',
      currency: 'EUR',
      fiscalYearStart: 7,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      metadata: { donor: 'BMGF' },
    });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('draft');
    expect(created.body.currency).toBe('EUR');
    expect(created.body.fiscalYearStart).toBe(7);
    expect(created.body.metadata).toEqual({ donor: 'BMGF' });

    const bad = await post('/api/metadata/programs', {
      name: 'X',
      code: 'BADSTAT',
      status: 'archived',
    });
    expect(bad.status).toBe(400);
  });

  it('CRUDs field definitions and values', async () => {
    const prog = await post('/api/metadata/programs', {
      name: 'Field Test',
      code: 'FIELDTEST',
    });
    const programId = prog.body.id;

    const def = await post('/api/metadata/program-fields', {
      programId,
      fieldName: 'Region office',
      fieldType: 'dropdown',
      isRequired: true,
      options: ['North', 'South'],
    });
    expect(def.status).toBe(201);
    expect(def.body.fieldType).toBe('dropdown');
    expect(def.body.options).toEqual(['North', 'South']);

    const val = await post('/api/metadata/program-field-values', {
      programId,
      fieldDefId: def.body.id,
      value: 'North',
    });
    expect(val.status).toBe(201);
    expect(val.body.value).toBe('North');

    const defs = await get('/api/metadata/program-fields');
    expect(defs.body.some((d: { id: string }) => d.id === def.body.id)).toBe(true);

    const badType = await post('/api/metadata/program-fields', {
      programId,
      fieldName: 'X',
      fieldType: 'currency',
    });
    expect(badType.status).toBe(400);
  });
});

describe('org units', () => {
  let countryId: string;
  let regionId: string;

  it('builds a tree with levels and paths', async () => {
    const country = await post('/api/metadata/org-units', {
      name: 'Testland',
      shortName: 'TL',
      code: 'TL',
    });
    expect(country.status).toBe(201);
    expect(country.body.level).toBe(1);
    countryId = country.body.id;

    const region = await post('/api/metadata/org-units', {
      name: 'North Region',
      shortName: 'North',
      code: 'TL-N',
      parentId: countryId,
    });
    expect(region.body.level).toBe(2);
    expect(region.body.path.startsWith(country.body.path + '.')).toBe(true);
    regionId = region.body.id;
  });

  it('stores and returns GeoJSON geometry', async () => {
    const site = await post('/api/metadata/org-units', {
      name: 'Borehole site',
      shortName: 'BH-1',
      code: 'TL-BH1',
      parentId: regionId,
      geometry: { type: 'Point', coordinates: [38.74, 9.03] },
    });
    expect(site.status).toBe(201);
    expect(site.body.geometry.type).toBe('Point');
    expect(site.body.geometry.coordinates[0]).toBeCloseTo(38.74);
  });

  it('reparents a subtree and rewrites paths/levels', async () => {
    const south = await post('/api/metadata/org-units', {
      name: 'South Region',
      shortName: 'South',
      code: 'TL-S',
      parentId: countryId,
    });
    const district = await post('/api/metadata/org-units', {
      name: 'District X',
      shortName: 'DX',
      code: 'TL-N-DX',
      parentId: regionId,
    });

    const moved = await patch(`/api/metadata/org-units/${district.body.id}`, {
      parentId: south.body.id,
    });
    expect(moved.body.parentId).toBe(south.body.id);
    expect(moved.body.level).toBe(3);
    expect(moved.body.path.startsWith(south.body.path + '.')).toBe(true);
  });

  it('blocks cyclic reparenting and deleting parents', async () => {
    const cyc = await patch(`/api/metadata/org-units/${countryId}`, {
      parentId: regionId,
    });
    expect(cyc.status).toBe(400);

    expect((await del(`/api/metadata/org-units/${countryId}`)).status).toBe(400);
  });

  it('imports CSV with dry-run then applies', async () => {
    const csv = [
      'code,name,short_name,parent_code,opening_date,latitude,longitude',
      'CSV-1,Csv Country,CsvC,,2020-01-01,,',
      'CSV-1-A,Csv Region A,CsvA,CSV-1,,9.1,38.7',
      'BADROW,Bad Row,Bad,NOPE,,,',
    ].join('\n');

    const dry = await post('/api/metadata/org-units/import-csv', {
      csv,
      dryRun: true,
    });
    expect(dry.body.created).toBe(2);
    expect(dry.body.errors).toBe(1);

    // nothing was applied during dry run / error rollback
    const before = await get('/api/metadata/org-units');
    expect(
      before.body.filter((o: { code: string }) => o.code.startsWith('CSV-')),
    ).toHaveLength(0);

    const okCsv = csv.split('\n').slice(0, 3).join('\n');
    const applied = await post('/api/metadata/org-units/import-csv', {
      csv: okCsv,
      dryRun: false,
    });
    expect(applied.body.created).toBe(2);
    expect(applied.body.errors).toBe(0);

    const after = await get('/api/metadata/org-units');
    const a = after.body.find((o: { code: string }) => o.code === 'CSV-1-A');
    expect(a.level).toBe(2);
    expect(a.geometry.type).toBe('Point');
  });

  it('imports geometry from GeoJSON matched by code', async () => {
    const res = await post('/api/metadata/org-units/import-geojson', {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [1, 2] },
          properties: { code: 'TL-N' },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [3, 4] },
          properties: { code: 'MISSING' },
        },
      ],
    });
    expect(res.body.matched).toBe(1);
    expect(res.body.unmatched).toEqual(['MISSING']);
  });
});

describe('disaggregation', () => {
  let sexId: string;
  let ageId: string;
  let comboId: string;

  it('materialises category option combos', async () => {
    const sex = await post('/api/metadata/categories', { name: 'Sex', code: 'SEX' });
    sexId = sex.body.id;
    const age = await post('/api/metadata/categories', { name: 'Age', code: 'AGE' });
    ageId = age.body.id;

    for (const [categoryId, name, code, sortOrder] of [
      [sexId, 'Female', 'SEX-F', 0],
      [sexId, 'Male', 'SEX-M', 1],
      [ageId, '0–17', 'AGE-0', 0],
      [ageId, '18+', 'AGE-18', 1],
    ] as const) {
      const res = await post('/api/metadata/category-options', {
        categoryId,
        name,
        code,
        sortOrder,
      });
      expect(res.status).toBe(201);
    }

    const combo = await post('/api/metadata/category-combos', {
      name: 'Sex / Age',
      code: 'SEX_AGE',
      categoryIds: [sexId, ageId],
    });
    expect(combo.status).toBe(201);
    comboId = combo.body.id;

    const cocs = await get(`/api/metadata/category-combos/${comboId}/option-combos`);
    expect(cocs.body).toHaveLength(4);
    expect(cocs.body.map((c: { name: string }) => c.name).sort()).toEqual([
      'Female, 0–17',
      'Female, 18+',
      'Male, 0–17',
      'Male, 18+',
    ]);
  });

  it('re-materialises when a category option is added', async () => {
    const res = await post('/api/metadata/category-options', {
      categoryId: ageId,
      name: '60+',
      code: 'A60',
      sortOrder: 2,
    });
    expect(res.status).toBe(201);
    const cocs = await get(`/api/metadata/category-combos/${comboId}/option-combos`);
    expect(cocs.body).toHaveLength(6);
  });

  it('keeps stable COC ids across re-materialisation', async () => {
    const before = await get(`/api/metadata/category-combos/${comboId}/option-combos`);
    const femaleYoung = before.body.find(
      (c: { name: string }) => c.name === 'Female, 0–17',
    );
    await post('/api/metadata/category-options', {
      categoryId: sexId,
      name: 'Unknown',
      code: 'SEX-U',
      sortOrder: 2,
    });
    const after = await get(`/api/metadata/category-combos/${comboId}/option-combos`);
    expect(after.body).toHaveLength(9);
    const same = after.body.find((c: { name: string }) => c.name === 'Female, 0–17');
    expect(same.id).toBe(femaleYoung.id);
  });

  it('persists nested disaggregation parent_id (spec §16.1)', async () => {
    // SDG 6.1.1 shape: "Safely managed" → "National" child option.
    const svc = await post('/api/metadata/categories', {
      name: 'Service level',
      code: 'SVCLVL',
    });
    const svcId = svc.body.id;

    const parent = await post('/api/metadata/category-options', {
      categoryId: svcId,
      name: 'Safely managed',
      code: 'SVC-SAFE',
    });
    expect(parent.status).toBe(201);
    expect(parent.body.parentId).toBeNull();

    const child = await post('/api/metadata/category-options', {
      categoryId: svcId,
      parentId: parent.body.id,
      name: 'Safely managed — National',
      code: 'SVC-SAFE-NAT',
    });
    expect(child.status).toBe(201);
    expect(child.body.parentId).toBe(parent.body.id);

    // round-trips through get (indexed for the entry-grid tree fetch)
    const fetched = await get(`/api/metadata/category-options/${child.body.id}`);
    expect(fetched.body.parentId).toBe(parent.body.id);
  });

  it('seeded the reserved default combo', async () => {
    const cocs = await get(
      `/api/metadata/category-combos/${DEFAULT_CATEGORY_COMBO_ID}/option-combos`,
    );
    expect(cocs.body).toHaveLength(1);
    expect(cocs.body[0].name).toBe('default');
  });
});

describe('data elements and datasets', () => {
  let deId: string;

  it('creates a data element; OPTION type requires an option set', async () => {
    const bad = await post('/api/metadata/data-elements', {
      name: 'Water source type',
      shortName: 'Source',
      code: 'DE-SRC',
      valueType: 'OPTION',
    });
    expect(bad.status).toBe(400);

    const de = await post('/api/metadata/data-elements', {
      name: 'Boreholes rehabilitated',
      shortName: 'Boreholes',
      code: 'DE-BH',
      valueType: 'INTEGER_ZERO_OR_POSITIVE',
      unitOfMeasure: 'boreholes',
    });
    expect(de.status).toBe(201);
    deId = de.body.id;
  });

  it('round-trips a dataset with sections and org units', async () => {
    const ou = await get('/api/metadata/org-units');
    const ouId = ou.body[0].id;

    const ds = await post('/api/metadata/datasets', {
      name: 'Monthly WASH report',
      code: 'DS-WASH-M',
      frequency: 'MONTHLY',
      elements: [{ dataElementId: deId, sortOrder: 0, section: 'Water', required: true }],
      orgUnitIds: [ouId],
    });
    expect(ds.status).toBe(201);
    expect(ds.body.elements).toHaveLength(1);
    expect(ds.body.orgUnitIds).toEqual([ouId]);

    const fetched = await get(`/api/metadata/datasets/${ds.body.id}`);
    expect(fetched.body.elements[0].section).toBe('Water');

    const unknownDe = await post('/api/metadata/datasets', {
      name: 'Bad',
      code: 'DS-BAD',
      frequency: 'MONTHLY',
      elements: [
        {
          dataElementId: '00000000-0000-7000-8000-000000000000',
          sortOrder: 0,
          section: '',
          required: false,
        },
      ],
    });
    expect(unknownDe.status).toBe(400);
  });

  it('attaches an evidence requirement to a data element (spec §16.3)', async () => {
    const req = await post('/api/metadata/evidence-requirements', {
      dataElementId: deId,
      evidenceType: 'photo',
      isRequired: true,
      maxCount: 3,
      allowedFormats: ['jpg', 'png'],
      instructions: 'Photograph the rehabilitated borehole',
    });
    expect(req.status).toBe(201);
    expect(req.body.evidenceType).toBe('photo');
    expect(req.body.isRequired).toBe(true);
    expect(req.body.allowedFormats).toEqual(['jpg', 'png']);

    const listed = await get('/api/metadata/evidence-requirements');
    expect(listed.body.some((r: { id: string }) => r.id === req.body.id)).toBe(true);

    const bad = await post('/api/metadata/evidence-requirements', {
      dataElementId: deId,
      evidenceType: 'hologram',
    });
    expect(bad.status).toBe(400);
  });
});

describe('users and roles', () => {
  it('creates a user with hashed password and role links', async () => {
    const roles = await get('/api/metadata/roles');
    const dataEntry = roles.body.find((r: { code: string }) => r.code === 'DATA_ENTRY');
    expect(dataEntry).toBeDefined();

    const ou = await get('/api/metadata/org-units');
    const created = await post('/api/metadata/users', {
      username: 'field.user',
      displayName: 'Field User',
      password: 'correct-horse-battery',
      roleIds: [dataEntry.id],
      orgUnits: [{ orgUnitId: ou.body[0].id, scope: 'data_entry' }],
    });
    expect(created.status).toBe(201);
    expect(created.body.passwordHash).toBeUndefined();
    expect(created.body.roleIds).toEqual([dataEntry.id]);

    const { rows } = await pool.query('select password_hash from "user" limit 1');
    expect(rows[0].password_hash).toMatch(/^\$argon2id\$/);
  });
});

describe('metadata bundle', () => {
  it('export → import is idempotent (pure update, no creates)', async () => {
    const exported = await get('/api/metadata/bundle');
    expect(exported.body.orgUnits.length).toBeGreaterThan(0);
    expect(exported.body.dataElements.length).toBeGreaterThan(0);

    const imported = await post('/api/metadata/bundle', exported.body);
    expect(imported.status).toBe(200);
    expect(imported.body.created).toEqual({});
    expect(Object.keys(imported.body.updated).length).toBeGreaterThan(0);

    // COCs survive re-import with identical content
    const combos = await get('/api/metadata/category-combos');
    const sexAge = combos.body.find((c: { code: string }) => c.code === 'SEX_AGE');
    const cocs = await get(`/api/metadata/category-combos/${sexAge.id}/option-combos`);
    expect(cocs.body.length).toBe(9);
  });
});
