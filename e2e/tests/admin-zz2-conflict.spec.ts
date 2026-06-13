import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

// M3 acceptance — spec §10 offline e2e #2: two clients edit the same value
// offline → first sync wins → second gets the conflict UI → resolved in both
// directions (take server, keep mine).

const BASE = 'http://127.0.0.1:3100';
const THIS_MONTH = new Date().toISOString().slice(0, 7);

let adminToken: string;
let datasetName: string;
let conflictDeId: string;

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
    name: 'Conflict Site',
    shortName: 'ConfSite',
    code: 'CONF-OU',
  });
  const de = await adminApi(request, 'post', '/api/metadata/data-elements', {
    name: 'Conflict counter',
    shortName: 'ConfCount',
    code: 'CONF-DE',
    valueType: 'INTEGER_ZERO_OR_POSITIVE',
  });
  conflictDeId = de.id;
  datasetName = 'Conflict Dataset';
  await adminApi(request, 'post', '/api/metadata/datasets', {
    name: datasetName,
    code: 'CONF-DS',
    frequency: 'MONTHLY',
    elements: [{ dataElementId: de.id, sortOrder: 0, section: '', required: false }],
    orgUnitIds: [ou.id],
  });
  const roles = await adminApi(request, 'get', '/api/metadata/roles');
  const dataEntry = roles.find((r: { code: string }) => r.code === 'DATA_ENTRY');
  await adminApi(request, 'post', '/api/metadata/users', {
    username: 'conf.field',
    displayName: 'Conflict Field User',
    password: 'conf-field-password',
    roleIds: [dataEntry.id],
    orgUnits: [
      { orgUnitId: ou.id, scope: 'data_entry' },
      { orgUnitId: ou.id, scope: 'data_view' },
    ],
  });
});

async function openClient(browser: Browser): Promise<{
  context: BrowserContext;
  page: Page;
}> {
  const context = await browser.newContext({ baseURL: BASE, serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel('Username').fill('conf.field');
  await page.getByLabel('Password').fill('conf-field-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/enter$/);
  await expect(page.getByTestId('sync-chip')).toHaveText('● synced', {
    timeout: 20_000,
  });
  await page.getByLabel('Dataset').selectOption({ label: datasetName });
  await page.getByLabel('Org unit').selectOption({ label: 'Conflict Site' });
  // current month — future periods are no longer enterable (spec §7.3)
  await page.getByLabel('Period', { exact: true }).selectOption(THIS_MONTH);
  await expect(page.getByTestId('entry-form')).toBeVisible();
  return { context, page };
}

const cell = (page: Page) => page.getByRole('textbox', { name: 'Conflict counter' });

async function synced(page: Page) {
  await expect(page.getByTestId('sync-chip')).toHaveText('● synced', {
    timeout: 20_000,
  });
}

test('offline e2e #2: conflict surfaces and resolves in both directions', async ({
  browser,
  request,
}) => {
  test.setTimeout(120_000);
  const a = await openClient(browser);
  const b = await openClient(browser);

  // both edit the same empty cell while offline
  await a.context.setOffline(true);
  await b.context.setOffline(true);
  await cell(a.page).fill('100');
  await cell(a.page).press('Enter');
  await expect(cell(a.page)).toHaveValue('100');
  await cell(b.page).fill('200');
  await cell(b.page).press('Enter');
  await expect(cell(b.page)).toHaveValue('200');

  // both queued locally, neither synced — catches offline-emulation leaks
  await expect(a.page.getByTestId('sync-chip')).toHaveText(/offline — 1 pending/, {
    timeout: 15_000,
  });
  await expect(b.page.getByTestId('sync-chip')).toHaveText(/offline — 1 pending/, {
    timeout: 15_000,
  });

  // first sync wins
  await a.context.setOffline(false);
  await synced(a.page);
  await expect
    .poll(
      async () => {
        const pull = await adminApi(
          request,
          'get',
          '/api/sync/pull?cursor=0&collections=dataValues',
        );
        return (
          pull.changes as Array<{
            op: string;
            row?: { period: string; value: string; dataElementId: string };
          }>
        )
          .filter((c) => c.op === 'upsert')
          .map((c) => c.row!)
          .find((r) => r.period === THIS_MONTH && r.dataElementId === conflictDeId)
          ?.value;
      },
      { timeout: 20_000 },
    )
    .toBe('100');

  // second gets the conflict UI — never silent last-write-wins
  await b.context.setOffline(false);
  await expect(b.page.getByTestId('sync-chip')).toHaveText(/1 conflict/, {
    timeout: 20_000,
  });
  await b.page.getByRole('button', { name: 'conflict — click to resolve' }).click();
  const dialogB = b.page.getByRole('dialog');
  await expect(dialogB).toContainText('mine (this device)');
  await expect(dialogB).toContainText('200');
  await expect(dialogB).toContainText('100');

  // direction 1: B takes the server value
  await dialogB.getByRole('button', { name: 'Take server' }).click();
  await synced(b.page);
  await expect(cell(b.page)).toHaveValue('100');

  // direction 2: B edits online (v2), A edits the same cell offline from v1
  await cell(b.page).fill('120');
  await cell(b.page).press('Enter');
  await expect(cell(b.page)).toHaveValue('120');
  // the chip can read "synced" before the new op even enqueues — wait until
  // the server actually holds B's value before A edits from its stale base
  await expect
    .poll(
      async () => {
        const pull = await adminApi(
          request,
          'get',
          '/api/sync/pull?cursor=0&collections=dataValues',
        );
        const row = (
          pull.changes as Array<{
            op: string;
            row?: { period: string; value: string; dataElementId: string };
          }>
        )
          .filter((c) => c.op === 'upsert')
          .map((c) => c.row!)
          .find((r) => r.period === THIS_MONTH && r.dataElementId === conflictDeId);
        return row?.value;
      },
      { timeout: 20_000 },
    )
    .toBe('120');

  await a.context.setOffline(true);
  await cell(a.page).fill('110');
  await cell(a.page).press('Enter');
  await expect(cell(a.page)).toHaveValue('110');
  await a.context.setOffline(false);
  await expect(a.page.getByTestId('sync-chip')).toHaveText(/1 conflict/, {
    timeout: 20_000,
  });
  await a.page.getByRole('button', { name: 'conflict — click to resolve' }).click();
  const dialogA = a.page.getByRole('dialog');
  await expect(dialogA).toContainText('120'); // server side shows B's value

  // A keeps mine → re-pushed with the new base version
  await dialogA.getByRole('button', { name: 'Keep mine' }).click();
  await synced(a.page);
  await expect(cell(a.page)).toHaveValue('110');

  // server agrees, exactly one row for the cell
  const pull = await adminApi(
    request,
    'get',
    '/api/sync/pull?cursor=0&collections=dataValues',
  );
  const values = (
    pull.changes as Array<{
      op: string;
      row?: { value: string; period: string; dataElementId: string };
    }>
  )
    .filter((c) => c.op === 'upsert')
    .map((c) => c.row!)
    .filter((r) => r.period === THIS_MONTH && r.dataElementId === conflictDeId);
  expect(values).toHaveLength(1);
  expect(values[0]!.value).toBe('110');

  await a.context.close();
  await b.context.close();
});
