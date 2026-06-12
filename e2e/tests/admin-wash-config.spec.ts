import { expect, test, type Page } from '@playwright/test';

// M1 acceptance (spec §12): the full WASH demo configuration is creatable
// via the UI only. Runs against a real server + fresh PostGIS database.

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password').fill('admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/enter$/);
});

async function openConfigure(page: Page, section: string) {
  await page.goto('/configure');
  await page
    .getByRole('navigation', { name: 'Configure sections' })
    .getByRole('link', { name: section, exact: true })
    .click();
}

test('create program', async ({ page }) => {
  await openConfigure(page, 'Programs');
  await page.getByRole('button', { name: 'New program' }).click();
  await page.getByLabel('Name').fill('WASH');
  await page.getByLabel('Code').fill('WASH');
  await page.getByLabel('Description').fill('Water, sanitation and hygiene');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(
    page.getByRole('row').filter({ hasText: 'Water, sanitation and hygiene' }),
  ).toContainText('● active');
});

test('import org units via csv and name levels', async ({ page }) => {
  await openConfigure(page, 'Org units');

  await page.getByRole('button', { name: 'Import CSV…' }).click();
  const csv = [
    'code,name,short_name,parent_code,opening_date,latitude,longitude',
    'TL,Testland,Testland,,2020-01-01,,',
    'TL-N,North Region,North,TL,,,',
    'TL-S,South Region,South,TL,,,',
    'TL-N-BH1,Borehole site 1,BH1,TL-N,,9.03,38.74',
    'TL-S-BH2,Borehole site 2,BH2,TL-S,,8.55,39.27',
  ].join('\n');
  await page.getByRole('textbox', { name: /^CSV/ }).fill(csv);
  await page.getByRole('button', { name: 'Dry run' }).click();
  await expect(page.getByTestId('csv-report')).toContainText('5 to create');
  await expect(page.getByTestId('csv-report')).toContainText('0 errors');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByTestId('org-unit-tree')).toContainText('Borehole site 1');

  // level names
  for (const name of ['Country', 'Region', 'Site']) {
    await page.getByPlaceholder(/Name for level/).fill(name);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByTestId('level-names')).toContainText(name);
  }
});

test('build disaggregation with live preview', async ({ page }) => {
  await openConfigure(page, 'Disaggregation');

  // category + options
  await page.getByPlaceholder('New category (e.g. Sex)').fill('Sex');
  await page.getByPlaceholder('Category code').fill('SEX');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: /^Sex/ }).click();

  for (const [name, code] of [
    ['Female', 'SEX-F'],
    ['Male', 'SEX-M'],
  ] as const) {
    await page.getByPlaceholder('Option name').fill(name);
    await page.getByPlaceholder('Option code').fill(code);
    await page.getByRole('button', { name: 'Add', exact: true }).first().click();
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }

  // combo with preview
  await page.getByRole('button', { name: 'New combo' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Sex');
  await dialog.getByLabel('Code').fill('SEX_COMBO');
  await dialog.getByRole('button', { name: 'Sex', exact: true }).click();
  await expect(dialog.getByTestId('combo-preview')).toContainText('2 combinations');
  await expect(dialog.getByTestId('combo-preview')).toContainText('Female');
  await dialog.getByRole('button', { name: 'Create combo' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('button', { name: /^Sex SEX_COMBO$/ })).toBeVisible();
});

test('create option set', async ({ page }) => {
  await openConfigure(page, 'Option sets');
  await page.getByPlaceholder('New option set name').fill('Water point type');
  await page.getByPlaceholder('Set code').fill('WPT');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: /Water point type/ }).click();
  for (const [name, code] of [
    ['Borehole', 'WPT-BH'],
    ['Dug well', 'WPT-DW'],
  ] as const) {
    await page.getByPlaceholder('Option name').fill(name);
    await page.getByPlaceholder('Option code').fill(code);
    await page.getByRole('button', { name: 'Add', exact: true }).first().click();
    await expect(page.getByText(name)).toBeVisible();
  }
});

test('create data elements', async ({ page }) => {
  await openConfigure(page, 'Data elements');

  await page.getByRole('button', { name: 'New data element' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill('Boreholes rehabilitated');
  await dialog.getByLabel('Short name').fill('Boreholes');
  await dialog.getByLabel('Code').fill('DE-BOREHOLES');
  await dialog.getByLabel('Unit of measure').fill('boreholes');
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('cell', { name: 'Boreholes rehabilitated' })).toBeVisible();

  await page.getByRole('button', { name: 'New data element' }).click();
  dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Name', { exact: true })
    .fill('People gaining access to safe water');
  await dialog.getByLabel('Short name').fill('People served');
  await dialog.getByLabel('Code').fill('DE-PEOPLE');
  await dialog.getByLabel('Disaggregation').selectOption({ label: 'Sex' });
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(
    page.getByRole('cell', { name: 'People gaining access to safe water' }),
  ).toBeVisible();
});

test('design dataset with sections and org units', async ({ page }) => {
  await openConfigure(page, 'Datasets');
  await page.getByRole('button', { name: 'New dataset' }).click();

  await page.getByLabel('Name').fill('Monthly WASH report');
  await page.getByLabel('Code').fill('DS-WASH-M');
  await page.getByLabel('Frequency').selectOption('MONTHLY');
  await page.getByLabel('Program').selectOption({ label: 'WASH' });

  await page
    .getByLabel('Add data element')
    .selectOption({ label: 'Boreholes rehabilitated' });
  await page.getByLabel('Add data element').selectOption({
    label: 'People gaining access to safe water',
  });
  const rows = page.getByRole('row');
  await rows
    .filter({ hasText: 'Boreholes rehabilitated' })
    .getByPlaceholder('e.g. Water')
    .fill('Water');
  await rows.filter({ hasText: 'Boreholes rehabilitated' }).getByRole('checkbox').check();

  // subtree select from the root assigns all 5 units
  await page
    .locator('li', { hasText: 'Testland' })
    .first()
    .getByRole('button', { name: 'subtree' })
    .click();
  await expect(page.getByText('assigned org units (5)')).toBeVisible();

  await page.getByRole('button', { name: 'Create dataset' }).click();
  const row = page.getByRole('row').filter({ hasText: 'Monthly WASH report' });
  await expect(row).toContainText('monthly');
  await expect(row).toContainText('2');
  await expect(row).toContainText('5');
});

test('create field user with role and scope', async ({ page }) => {
  await openConfigure(page, 'Users & roles');
  await page.getByRole('button', { name: 'New user' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Username').fill('field.user');
  await dialog.getByLabel('Display name').fill('Field User');
  await dialog.getByLabel('Password').fill('correct-horse-battery');
  await dialog.getByRole('checkbox', { name: 'Data Entry' }).check();
  await dialog.getByRole('button', { name: 'Add scope' }).click();
  await dialog.getByRole('button', { name: 'Create user' }).click();
  const row = page.getByRole('row').filter({ hasText: 'field.user' });
  await expect(row).toContainText('Data Entry');
  await expect(row).toContainText('● active');
});

test('export metadata bundle', async ({ page }) => {
  await page.goto('/configure');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export bundle' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('metadata.json');

  // overview reflects the configured instance
  const table = page.getByRole('table');
  await expect(table.getByRole('row').filter({ hasText: 'Org units' })).toContainText(
    '● configured',
  );
  await expect(table.getByRole('row').filter({ hasText: 'Datasets' })).toContainText(
    '● configured',
  );
});
