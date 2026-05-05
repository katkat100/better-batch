import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:4173',
    headless: true,
    trace: 'on-first-retry'
  },
  webServer: {
    command: '~/.bun/bin/bun run build && ~/.bun/bin/bun run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: { BB_DATA_DIR: './tests/e2e/.tmp-data' }
  }
});
