import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// M6 acceptance — approval chain e2e: a completed submission walks a
// two-level approval chain in the Review & Approve UI; rejection ends the
// chain with a reason.

test.describe.configure({ mode: 'serial' });

const BASE = 'http://127.0.0.1:3100';
let adminToken: string;
let fieldToken: string;
let fixtures: { ouId: string; deId: string; dsId: string };

async function adminApi(
  request: APIRequestContext,
  method: 'get' | 'post',
  path: string,
  data?: unknown,
  token = adminToken,
) {
  const res = await request[method](`${BASE}${path}`, {
    data,
    headers: { authorization: `Bearer ${token}` },
  });
  expect(res.ok(), `${method} ${path}: ${res.status()}`).toBe(true);
  return res.json();
}

const uuid = () => crypto.randomUUID();

async function completeSubmission(request: APIRequestContext, period: string) {
  // a value first, then completion — as the field user
  const pushValue = await adminApi(
    request,
    'post',
    '/api/sync/push',
    {
      deviceId: uuid(),
      ops: [
        {
          opId: uuid(),
          kind: 'dataValue.upsert',
          clientTs: new Date().toISOString(),
          payload: {
            id: uuid(),
            dataElementId: fixtures.deId,
            orgUnitId: fixtures.ouId,
            period,
            categoryOptionComboId: '019754a0-0000-7000-8000-00000000c0c1',
            value: '3',
          },
        },
      ],
    },
    fieldToken,
  );
  expect(pushValue.results[0].status).toBe('applied');
  const subId = uuid();
  const complete = await adminApi(
    request,
    'post',
    '/api/sync/push',
    {
      deviceId: uuid(),
      ops: [
        {
          opId: uuid(),
          kind: 'submission.complete',
          clientTs: new Date().toISOString(),
          payload: {
            id: subId,
            datasetId: fixtures.dsId,
            orgUnitId: fixtures.ouId,
            period,
            note: 'field complete',
          },
        },
      ],
    },
    fieldToken,
  );
  expect(complete.results[0].status).toBe('applied');
  return subId;
}

test.beforeAll(async ({ request }) => {
  const login = await request.post(`${BASE}/api/auth/login`, {
    data: { username: 'admin', password: 'admin' },
  });
  adminToken = (await login.json()).accessToken;

  const ou = await adminApi(request, 'post', '/api/metadata/org-units', {
    name: 'ZZ5 District',
    shortName: 'ZZ5',
    code: 'ZZ5-OU',
  });
  const de = await adminApi(request, 'post', '/api/metadata/data-elements', {
    name: 'ZZ5 latrines built',
    shortName: 'ZZ5L',
    code: 'ZZ5-DE',
    valueType: 'INTEGER_ZERO_OR_POSITIVE',
  });
  const ds = await adminApi(request, 'post', '/api/metadata/datasets', {
    name: 'ZZ5 sanitation report',
    code: 'ZZ5-DS',
    frequency: 'MONTHLY',
    requiresApproval: true,
    approvalLevels: 2,
    elements: [{ dataElementId: de.id, sortOrder: 0, section: '', required: false }],
    orgUnitIds: [ou.id],
  });
  const roles = await adminApi(request, 'get', '/api/metadata/roles');
  const dataEntry = roles.find((r: { code: string }) => r.code === 'DATA_ENTRY');
  await adminApi(request, 'post', '/api/metadata/users', {
    username: 'zz5.field',
    displayName: 'ZZ5 Field',
    password: 'zz5-field-password',
    roleIds: [dataEntry.id],
    orgUnits: [
      { orgUnitId: ou.id, scope: 'data_entry' },
      { orgUnitId: ou.id, scope: 'data_view' },
    ],
  });
  const fieldLogin = await request.post(`${BASE}/api/auth/login`, {
    data: { username: 'zz5.field', password: 'zz5-field-password' },
  });
  fieldToken = (await fieldLogin.json()).accessToken;
  fixtures = { ouId: ou.id, deId: de.id, dsId: ds.id };
});

async function loginAdmin(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password').fill('admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/enter$/);
}

test('two-level approval chain approves through the UI', async ({ page, request }) => {
  const subId = await completeSubmission(request, '2026-04');

  await loginAdmin(page);
  await page.goto('/review');
  const row = page.getByRole('row').filter({ hasText: 'ZZ5 sanitation report' });
  await expect(row).toContainText('2026-04');
  await expect(row).toContainText('level 1/2');

  await row.getByRole('button', { name: 'Approve…' }).click();
  await page.getByLabel('Comment').fill('numbers check out');
  await page.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
  await expect(row).toContainText('level 2/2');

  await row.getByRole('button', { name: 'Approve…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
  await expect(
    page.getByRole('row').filter({ hasText: 'ZZ5 sanitation report' }),
  ).toHaveCount(0);

  // server agrees
  await expect
    .poll(
      async () => {
        const pull = await adminApi(
          request,
          'get',
          '/api/sync/pull?cursor=0&collections=submissions',
        );
        return (pull.changes as Array<{ rowId: string; row?: { status: string } }>).find(
          (c) => c.rowId === subId,
        )?.row?.status;
      },
      { timeout: 10_000 },
    )
    .toBe('approved');
});

test('rejection ends the chain with a reason', async ({ page, request }) => {
  const subId = await completeSubmission(request, '2026-03');

  await loginAdmin(page);
  await page.goto('/review');
  const row = page.getByRole('row').filter({ hasText: '2026-03' });
  await row.getByRole('button', { name: 'Reject…' }).click();
  await page.getByLabel('Reason (required)').fill('totals look wrong');
  await page.getByRole('dialog').getByRole('button', { name: 'Reject' }).click();
  await expect(page.getByRole('row').filter({ hasText: '2026-03' })).toHaveCount(0);

  await expect
    .poll(
      async () => {
        const pull = await adminApi(
          request,
          'get',
          '/api/sync/pull?cursor=0&collections=submissions',
        );
        return (pull.changes as Array<{ rowId: string; row?: { status: string } }>).find(
          (c) => c.rowId === subId,
        )?.row?.status;
      },
      { timeout: 10_000 },
    )
    .toBe('rejected');
});
