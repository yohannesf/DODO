import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// M2 acceptance — spec §10 offline e2e #1 and #3:
//  #1 login → initial sync → offline → enter 50 values across 2 datasets →
//     reload offline → data intact → online → auto-sync → server has all
//     values exactly once.
//  #3 outbox replay after dropped responses mid-batch → no duplicates.

test.describe.configure({ mode: 'serial' });

const BASE = 'http://127.0.0.1:3100';
const PERIODS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'] as const;

let adminToken: string;
let fixtures: {
  orgUnitId: string;
  datasets: Array<{ id: string; name: string; deIds: string[] }>;
};

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

  // self-contained fixture config (independent of the wash-config spec)
  const ou = await adminApi(request, 'post', '/api/metadata/org-units', {
    name: 'Sync Test Site',
    shortName: 'SyncSite',
    code: 'SYNC-OU',
  });

  const datasets: typeof fixtures.datasets = [];
  for (const n of [1, 2]) {
    const deIds: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const de = await adminApi(request, 'post', '/api/metadata/data-elements', {
        name: `Sync DE ${n}.${i}`,
        shortName: `S${n}.${i}`,
        code: `SYNC-DE-${n}-${i}`,
        valueType: 'INTEGER_ZERO_OR_POSITIVE',
      });
      deIds.push(de.id);
    }
    const ds = await adminApi(request, 'post', '/api/metadata/datasets', {
      name: `Sync Dataset ${n}`,
      code: `SYNC-DS-${n}`,
      frequency: 'MONTHLY',
      elements: deIds.map((id, idx) => ({
        dataElementId: id,
        sortOrder: idx,
        section: '',
        required: false,
      })),
      orgUnitIds: [ou.id],
    });
    datasets.push({ id: ds.id, name: ds.name, deIds });
  }

  const roles = await adminApi(request, 'get', '/api/metadata/roles');
  const dataEntry = roles.find((r: { code: string }) => r.code === 'DATA_ENTRY');
  await adminApi(request, 'post', '/api/metadata/users', {
    username: 'sync.field',
    displayName: 'Sync Field User',
    password: 'sync-field-password',
    roleIds: [dataEntry.id],
    orgUnits: [
      { orgUnitId: ou.id, scope: 'data_entry' },
      { orgUnitId: ou.id, scope: 'data_view' },
    ],
  });

  fixtures = { orgUnitId: ou.id, datasets };
});

async function loginUi(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Username').fill('sync.field');
  await page.getByLabel('Password').fill('sync-field-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/enter$/);
}

async function waitSynced(page: Page) {
  await expect(page.getByTestId('sync-chip')).toHaveText('● synced', {
    timeout: 20_000,
  });
}

async function selectContext(page: Page, datasetName: string, period: string) {
  await page.getByLabel('Dataset').selectOption({ label: datasetName });
  await page.getByLabel('Org unit').selectOption({ label: 'Sync Test Site' });
  await page.locator('input[type="month"]').fill(period);
  await expect(page.getByTestId('entry-form')).toBeVisible();
}

async function fillDataset(page: Page, value: (i: number) => string) {
  const inputs = page.getByTestId('entry-form').getByRole('textbox');
  await expect(inputs).toHaveCount(5);
  for (let i = 0; i < 5; i++) {
    await inputs.nth(i).fill(value(i));
    await inputs.nth(i).press('Enter');
  }
}

/** pull everything as admin and return the dataValues rows */
async function serverValues(request: APIRequestContext) {
  const res = await adminApi(
    request,
    'get',
    '/api/sync/pull?cursor=0&collections=dataValues',
  );
  return (res.changes as Array<{ op: string; row?: { id: string; value: string } }>)
    .filter((c) => c.op === 'upsert')
    .map((c) => c.row!);
}

test('offline e2e #1: 50 values offline, reload, exactly-once sync', async ({
  page,
  context,
  request,
}) => {
  await loginUi(page);
  await waitSynced(page); // initial sync done

  // M3 acceptance: entry stays responsive on a throttled CPU (spec §12)
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  await context.setOffline(true);

  // 50 values: 2 datasets × 5 elements × 5 periods — entered fully offline
  for (const ds of fixtures.datasets) {
    for (const period of PERIODS) {
      await selectContext(page, ds.name, period);
      await fillDataset(page, (i) => String(10 + i));
    }
  }
  await expect(page.getByTestId('sync-chip')).toHaveText(/offline — 50 pending/);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  // cold reload while still offline — everything must come back from Dexie
  await page.reload();
  await expect(page.getByTestId('sync-chip')).toHaveText(/offline — 50 pending/, {
    timeout: 15_000,
  });
  await selectContext(page, fixtures.datasets[0]!.name, PERIODS[0]);
  const inputs = page.getByTestId('entry-form').getByRole('textbox');
  await expect(inputs.nth(0)).toHaveValue('10');
  await expect(inputs.nth(4)).toHaveValue('14');

  // back online → auto-sync drains the outbox
  await context.setOffline(false);
  await waitSynced(page);

  const values = await serverValues(request);
  expect(values).toHaveLength(50);
  expect(new Set(values.map((v) => v.id)).size).toBe(50);
});

test('offline e2e #3: replay after dropped responses creates no duplicates', async ({
  browser,
  request,
}) => {
  // SW-controlled pages bypass Playwright routing — use a SW-free context
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:3100',
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  // drop the response of the first two push attempts AFTER the server
  // processed them — the client must replay and the server must dedupe
  let drops = 2;
  await context.route('**/api/sync/push', async (route) => {
    if (drops > 0) {
      drops--;
      await route.fetch(); // server applies the batch…
      await route.abort('connectionfailed'); // …but the client never hears back
      return;
    }
    await route.continue();
  });

  await loginUi(page);
  await waitSynced(page);

  await selectContext(page, fixtures.datasets[0]!.name, '2026-06');
  await fillDataset(page, (i) => String(40 + i));

  await waitSynced(page);
  expect(drops).toBe(0); // both simulated drops actually happened

  const values = await serverValues(request);
  // 50 from test #1 + 5 new ones — replays must not duplicate anything
  expect(values).toHaveLength(55);
  expect(new Set(values.map((v) => v.id)).size).toBe(55);
  const june = values.filter((v) => (v as { period?: string }).period === '2026-06');
  expect(june).toHaveLength(5);
  await context.close();
});
