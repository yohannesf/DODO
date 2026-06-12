import { expect, test } from '@playwright/test';

// M0 signature test (spec §12): the app installs as a PWA and the app shell
// renders fully offline after the first load. Runs against the static
// preview (no API), so the unauthenticated shell = the login screen.
test('app shell installs and renders offline after first load', async ({
  page,
  context,
}) => {
  // First load online: registers the service worker and precaches the shell.
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();

  // Installability surface: manifest is linked and resolvable.
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toBeTruthy();
  const manifest = await page.request.get(new URL(manifestHref!, page.url()).href);
  expect(manifest.ok()).toBe(true);
  expect((await manifest.json()).icons.length).toBeGreaterThanOrEqual(2);

  // Wait until the SW controls this page. The SW claims clients only after
  // install (precache) completed, so a controller guarantees offline works.
  // Keep the predicate synchronous: waitForFunction does not reliably await
  // async predicates — a pending Promise is truthy.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  // Go offline and cold-reload: the shell must come entirely from the SW.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByLabel('Username')).toBeVisible();

  await context.setOffline(false);
});
