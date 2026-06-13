import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { waitForServiceWorker } from './helpers';

// M5 acceptance — spec §12: a dashboard renders offline with a "data as of"
// stamp; the map renders offline in the scoped bbox (org unit geometry +
// cached analytics from Dexie).

test.describe.configure({ mode: 'serial' });

const BASE = 'http://127.0.0.1:3100';
let adminToken: string;

const thisMonth = new Date().toISOString().slice(0, 7);

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
    name: 'ZZ4 Site',
    shortName: 'ZZ4',
    code: 'ZZ4-OU',
    geometry: { type: 'Point', coordinates: [38.74, 9.03] },
  });
  const de = await adminApi(request, 'post', '/api/metadata/data-elements', {
    name: 'ZZ4 households reached',
    shortName: 'ZZ4H',
    code: 'ZZ4-DE',
    valueType: 'INTEGER_ZERO_OR_POSITIVE',
  });
  // entry windows (spec §7.3) require a dataset collecting the element
  await adminApi(request, 'post', '/api/metadata/datasets', {
    name: 'ZZ4 monthly',
    code: 'ZZ4-DS',
    frequency: 'MONTHLY',
    elements: [{ dataElementId: de.id, sortOrder: 0, section: '', required: false }],
    orgUnitIds: [ou.id],
  });
  const uuid = () => crypto.randomUUID();
  const push = await adminApi(request, 'post', '/api/sync/push', {
    deviceId: uuid(),
    ops: [
      {
        opId: uuid(),
        kind: 'dataValue.upsert',
        clientTs: new Date().toISOString(),
        payload: {
          id: uuid(),
          dataElementId: de.id,
          orgUnitId: ou.id,
          period: thisMonth,
          categoryOptionComboId: '019754a0-0000-7000-8000-00000000c0c1',
          value: '7',
        },
      },
    ],
  });
  expect(push.results[0].status).toBe('applied');
});

async function loginAdmin(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password').fill('admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/enter$/);
  await expect(page.getByTestId('sync-chip')).toHaveText('● synced', {
    timeout: 20_000,
  });
}

test('dashboard renders offline with data-as-of stamp', async ({ page, context }) => {
  await loginAdmin(page);

  // build the dashboard via the UI
  await page.goto('/dashboards');
  await page.getByPlaceholder('New dashboard name').fill('Field Ops');
  await page.getByPlaceholder('Code').fill('DASH-OPS');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('button', { name: 'Edit layout' }).click();
  await page.getByRole('button', { name: '+ kpi' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Title').fill('Households this month');
  await dialog.getByRole('checkbox', { name: 'ZZ4 households reached' }).check();
  await dialog.getByRole('checkbox', { name: /ZZ4 Site/ }).check();
  await dialog.getByLabel('Period').selectOption('THIS_MONTH');
  await dialog.getByRole('button', { name: 'Save widget' }).click();

  // widget renders live (no stamp online)
  const grid = page.getByTestId('dashboard-grid');
  await expect(grid).toContainText('Households this month');
  await expect(grid.getByText('7', { exact: true })).toBeVisible({ timeout: 15_000 });

  // dashboard metadata must reach the Dexie mirror before going offline
  await page.goto('/sync');
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(page.getByTestId('sync-chip')).toHaveText('● synced', {
    timeout: 20_000,
  });

  // offline cold reload → mirror + widget cache render with the stamp
  await waitForServiceWorker(page);
  await context.setOffline(true);
  await page.goto('/dashboards');
  const offlineGrid = page.getByTestId('dashboard-grid');
  await expect(offlineGrid).toContainText('Households this month', {
    timeout: 15_000,
  });
  await expect(offlineGrid.getByText('7', { exact: true })).toBeVisible();
  await expect(page.getByTestId('widget-stamp')).toContainText('data as of');

  await context.setOffline(false);
});

test('map renders offline in the scoped bbox', async ({ page, context }) => {
  await loginAdmin(page);

  // online first: loads values into the widget cache
  await page.goto('/maps');
  await page
    .getByLabel('Indicator / data element')
    .selectOption({ label: 'ZZ4 households reached' });
  await page.getByLabel('Period').selectOption('THIS_MONTH');
  await expect(page.getByTestId('map-canvas')).toBeVisible();
  // maplibre canvas appears once the map initialises
  await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  // values must be fetched AND cached before the offline phase
  await expect(page.getByTestId('map-live')).toBeVisible({ timeout: 15_000 });

  // offline reload: geometry from Dexie + cached analytics + stamp
  await waitForServiceWorker(page);
  await context.setOffline(true);
  await page.reload();
  await page
    .getByLabel('Indicator / data element')
    .selectOption({ label: 'ZZ4 households reached' });
  await page.getByLabel('Period').selectOption('THIS_MONTH');
  await expect(page.getByTestId('map-stamp')).toContainText('data as of', {
    timeout: 15_000,
  });
  await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });

  await context.setOffline(false);
});
