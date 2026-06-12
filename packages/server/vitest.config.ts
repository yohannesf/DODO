import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30_000,
    // first run may pull the postgis image
    hookTimeout: 180_000,
  },
});
