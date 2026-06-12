import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  // all admin specs share one server + database — never parallelise files
  workers: 1,
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
      // stateful: specs build on one shared database — retrying mid-suite
      // would re-create fixtures and fail on unique codes
      retries: 0,
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:3100' },
    },
  ],
  webServer: {
    // turbo so @dodo/shared builds first — a bare vite build cannot resolve it
    command: 'pnpm turbo build --filter=@dodo/web && pnpm --filter @dodo/web preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
