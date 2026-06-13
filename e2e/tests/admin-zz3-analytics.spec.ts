import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// M4 UI path: indicator builder with test-evaluate, Explore pivot/chart,
// results framework with a target. Self-contained fixtures.

test.describe.configure({ mode: 'serial' });

const BASE = 'http://127.0.0.1:3100';
let adminToken: string;

async function adminApi(
  request: APIRequestContext,
  method: 'get' | 'post',
  path: string,
  data?: unknown,
) {
  const res = await request[method](`${BASE}${path}`, {
    data,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  expect(res.ok(), `${method} ${path}: ${res.status()}`).toBe(true);
  return res.json();
}

test.beforeAll(async ({ request }) => {
  const login = await request.post(`${BASE}/api/auth/login`, {
    data: { username: 'admin', password: 'admin' },
  });
  adminToken = (await login.json()).accessToken;

  const ou = await adminApi(request, 'post', '/api/metadata/org-units', {
    name: 'ZZ3 Site',
    shortName: 'ZZ3',
    code: 'ZZ3-OU',
  });
  const de = await adminApi(request, 'post', '/api/metadata/data-elements', {
    name: 'ZZ3 counter',
    shortName: 'ZZ3C',
    code: 'ZZ3-DE',
    valueType: 'INTEGER_ZERO_OR_POSITIVE',
  });
  // entry windows (spec §7.3) require a dataset collecting the element
  await adminApi(request, 'post', '/api/metadata/datasets', {
    name: 'ZZ3 monthly',
    code: 'ZZ3-DS',
    frequency: 'MONTHLY',
    elements: [{ dataElementId: de.id, sortOrder: 0, section: '', required: false }],
    orgUnitIds: [ou.id],
  });
  // 10 per month for three months — used by test-evaluate and Explore
  const uuid = () => crypto.randomUUID();
  const ops = ['2026-01', '2026-02', '2026-03'].map((pe) => ({
    opId: uuid(),
    kind: 'dataValue.upsert',
    clientTs: new Date().toISOString(),
    payload: {
      id: uuid(),
      dataElementId: de.id,
      orgUnitId: ou.id,
      period: pe,
      categoryOptionComboId: '019754a0-0000-7000-8000-00000000c0c1',
      value: '10',
    },
  }));
  const push = await adminApi(request, 'post', '/api/sync/push', {
    deviceId: uuid(),
    ops,
  });
  for (const r of push.results) expect(r.status).toBe('applied');
});

async function loginAdmin(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password').fill('admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/enter$/);
}

test('build indicator with live test-evaluate', async ({ page }) => {
  await loginAdmin(page);
  await page.goto('/configure/indicators');
  await page.getByRole('button', { name: 'New indicator' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('ZZ3 monthly total');
  await dialog.getByLabel('Code', { exact: true }).fill('IND-ZZ3-TOTAL');
  await dialog.getByLabel(/^Numerator/).fill('#{ZZ3-DE}');

  // live test evaluation against real data (10 every month at the site)
  await dialog.getByLabel('Org unit (subtree)').selectOption({ label: 'ZZ3 Site' });
  await dialog.getByLabel('Period').fill('2026-01');
  await dialog.getByRole('button', { name: 'Evaluate' }).click();
  await expect(dialog.getByTestId('test-evaluate-result')).toContainText('= 10');

  await dialog.getByRole('button', { name: 'Create indicator' }).click();
  await expect(page.getByRole('cell', { name: 'ZZ3 monthly total' })).toBeVisible();
});

test('explore pivots data elements and indicators', async ({ page }) => {
  await loginAdmin(page);
  await page.goto('/explore');
  await page.getByRole('checkbox', { name: '◆ ZZ3 monthly total' }).check();
  await page.getByRole('checkbox', { name: 'ZZ3 Site' }).check();
  await page.getByLabel('From', { exact: true }).fill('2026-01');
  await page.getByLabel('To', { exact: true }).fill('2026-03');
  await page.getByRole('button', { name: 'Run query' }).click();

  const pivot = page.getByTestId('explore-pivot');
  await expect(pivot).toBeVisible();
  const row = pivot.getByRole('row').filter({ hasText: 'ZZ3 monthly total' });
  await expect(row).toContainText('10'); // each month
  await expect(row).toContainText('30'); // TOTAL = 3 months × 10
  await expect(page.getByTestId('explore-chart')).toBeVisible();
});

test('framework tree with linked indicator and target', async ({ page }) => {
  await loginAdmin(page);
  await page.goto('/framework');
  await page.getByPlaceholder('New framework name').fill('WASH Results');
  await page.getByPlaceholder('Code').fill('RF-WASH');
  await page.getByRole('button', { name: 'Create', exact: true }).click();

  await page.getByRole('button', { name: 'Add goal' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Title').fill('Improved access to safe water');
  await dialog.getByRole('checkbox', { name: 'ZZ3 monthly total' }).check();
  await dialog.getByRole('button', { name: 'Add node' }).click();
  await expect(page.getByTestId('framework-tree')).toContainText(
    'Improved access to safe water',
  );

  // child node
  await page.getByRole('button', { name: 'Add child' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Title').fill('Water points rehabilitated');
  await dialog.getByRole('button', { name: 'Add node' }).click();
  await expect(page.getByTestId('framework-tree')).toContainText(
    'Water points rehabilitated',
  );

  // target on the linked indicator
  await page.getByRole('button', { name: '◆ ZZ3 monthly total' }).first().click();
  await page.getByRole('combobox').filter({ hasText: 'org unit…' }).selectOption({
    label: 'ZZ3 Site',
  });
  await page.getByPlaceholder('value').fill('120');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('● target')).toBeVisible();
  await expect(page.getByText('120', { exact: true })).toBeVisible();
});
