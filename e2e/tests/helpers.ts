import type { Page } from '@playwright/test';

/**
 * Wait until the service worker controls the page. Required before
 * `context.setOffline(true)` whenever the test will navigate or reload:
 * on cold CI runners the SW can still be precaching seconds after load,
 * and an uncontrolled offline navigation dies at the network layer.
 * The SW claims clients only after install (precache) completes, so a
 * non-null controller guarantees offline navigation works.
 */
export async function waitForServiceWorker(page: Page): Promise<void> {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 30_000,
  });
}
