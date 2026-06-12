import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  globalSetup: './global-setup.ts',
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'offline',
      testMatch: /tests\/offline-[^/]*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4173' },
    },
    {
      name: 'admin',
      testMatch: /admin-.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:3100' },
    },
  ],
  webServer: {
    command: 'pnpm --filter @dodo/web build && pnpm --filter @dodo/web preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
