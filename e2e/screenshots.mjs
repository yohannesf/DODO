// Generates README screenshots against a seeded local server.
// Usage: node screenshots.mjs (server on :3210 with the demo seed)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = 'http://127.0.0.1:3210';
const OUT = new URL('../docs/screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

await page.goto(`${BASE}/login`);
await page.getByLabel('Username').fill('admin');
await page.getByLabel('Password').fill('admin');
await page.getByRole('button', { name: 'Sign in' }).click();
await page.waitForURL(/\/enter$/);
await page.getByTestId('sync-chip').filter({ hasText: 'synced' }).waitFor({
  timeout: 30_000,
});

// entry grid with seeded data
const lastMonth = new Date(Date.now() - 35 * 86_400_000).toISOString().slice(0, 7);
await page.getByLabel('Dataset').selectOption({ label: 'Monthly water report' });
await page.getByLabel('Org unit').selectOption({ label: 'North Site 1' });
await page.locator('input[type="month"]').fill(lastMonth);
await page.getByTestId('entry-form').waitFor();
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}entry-grid.png` });
console.log('entry-grid.png');

// explore
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
await page.screenshot({ path: `${OUT}explore.png` });
console.log('explore.png');

// maps
await page.goto(`${BASE}/maps`);
await page
  .getByLabel('Indicator / data element')
  .selectOption({ label: '◆ People with safe water' });
await page.getByLabel('Period').selectOption('LAST_3_MONTHS');
await page.locator('.maplibregl-canvas').waitFor({ timeout: 20_000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}maps.png` });
console.log('maps.png');

await browser.close();
