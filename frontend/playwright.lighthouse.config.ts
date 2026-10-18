import { defineConfig } from '@playwright/test';

/** `npm run lighthouse` (frontend §9): accessibility with mobile emulation on the key screens, at least 90. */
export default defineConfig({
  testDir: './lighthouse',
  testMatch: '**/*.lh.ts',
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env['PAN_E2E_BASE_URL'] ?? 'http://localhost:4200',
    channel: 'chrome',
    locale: 'es-MX',
  },
  webServer: {
    command: 'npm start',
    url: 'http://localhost:4200',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
