import { defineConfig } from '@playwright/test';

/**
 * Help videos (frontend §4.3, `npm run help:record`): each scene of `help-recording/` records one capture screen at
 * 1024 × 640 and saves it in `public/help/`. Nothing is saved in the system: the scenes stop before confirming, and the
 * documents they need (a count, a production order) are cancelled at the end.
 */
export default defineConfig({
  testDir: './help-recording',
  testMatch: '**/*.rec.ts',
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 90_000,
  use: {
    baseURL: process.env['PAN_E2E_BASE_URL'] ?? 'http://localhost:4200',
    channel: 'chrome',
    locale: 'es-MX',
    viewport: { width: 1024, height: 640 },
    video: { mode: 'on', size: { width: 1024, height: 640 } },
    colorScheme: 'light',
  },
  webServer: {
    command: 'npm start',
    url: 'http://localhost:4200',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
