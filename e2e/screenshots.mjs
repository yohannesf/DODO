// Generates README screenshots against a seeded local server.
// Usage: BASE=http://127.0.0.1:3210 node screenshots.mjs (server with demo seed)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3210';
const OUT = new URL('../docs/screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

async function shoot(name) {
  await page.screenshot({ path: `${OUT}${name}.png` });
  console.log(`${name}.png`);
}

await page.goto(`${BASE}/login`);
await page.getByLabel('Username').fill('admin');
await page.getByLabel('Password').fill('admin');
await page.getByRole('button', { name: 'Sign in' }).click();
await page.waitForURL(/\/enter$/);
await page.getByTestId('sync-chip').filter({ hasText: 'synced' }).waitFor({
  timeout: 30_000,
});

const lastMonth = new Date(Date.now() - 35 * 86_400_000).toISOString().slice(0, 7);

// 1. Enter Data — spreadsheet-style entry grid with seeded data
await page.getByLabel('Dataset').selectOption({ label: 'Monthly water report' });
await page.getByRole('button', { name: 'Org unit' }).click();
await page.getByPlaceholder('Search org units…').fill('North Site 1');
await page.getByRole('option', { name: 'North Site 1' }).click();
// period is a bounded stepper select (newest first); index 1 = last full month
await page.getByLabel('Period', { exact: true }).selectOption({ index: 1 });
await page.getByTestId('entry-form').waitFor();
await page.waitForTimeout(800);
await shoot('entry-grid');

// 2. Review & Approve — submission queue and approval chain
await page.goto(`${BASE}/review`);
await page
  .getByRole('heading', { name: 'Review & Approve' })
  .waitFor({ timeout: 20_000 });
await page.waitForTimeout(900);
await shoot('review');

// 3. Dashboards — KPI / chart / map / pivot grid, cached for offline
await page.goto(`${BASE}/dashboards`);
await page.getByRole('heading', { name: 'Dashboards' }).waitFor({ timeout: 20_000 });
await page.waitForTimeout(2000);
await shoot('dashboard');

// 4. Maps — choropleth + facility points coloured against targets
await page.goto(`${BASE}/maps`);
await page
  .getByLabel('Indicator / data element')
  .selectOption({ label: '◆ People with safe water' });
await page.getByLabel('Period').selectOption('LAST_3_MONTHS');
await page.locator('.maplibregl-canvas').waitFor({ timeout: 20_000 });
await page.waitForTimeout(2500);
await shoot('maps');

// 5. Explore — ad-hoc pivot + chart builder
await page.goto(`${BASE}/explore`);
await page.getByRole('checkbox', { name: '◆ % female (water)' }).check();
await page.getByRole('checkbox', { name: '◆ People with safe water' }).check();
await page.getByRole('checkbox', { name: /^Demoland$/ }).check();
const from = new Date(Date.now() - 300 * 86_400_000).toISOString().slice(0, 7);
await page.getByLabel('From', { exact: true }).fill(from);
await page.getByLabel('To', { exact: true }).fill(lastMonth);
await page.getByRole('button', { name: 'Run query' }).click();
await page.getByTestId('explore-pivot').waitFor({ timeout: 20_000 });
await page.waitForTimeout(1200);
await shoot('explore');

// 6. Framework — results framework with linked indicators, targets, baselines
await page.goto(`${BASE}/framework`);
await page.getByRole('heading', { name: 'Framework' }).waitFor({ timeout: 20_000 });
await page.waitForTimeout(1000);
await shoot('framework');

// 7. Configure — the metadata hub (indicators, disaggregations, org units, …)
await page.goto(`${BASE}/configure`);
await page.getByRole('heading', { name: 'Configuration' }).waitFor({ timeout: 20_000 });
await page.waitForTimeout(900);
await shoot('configure');

await browser.close();
