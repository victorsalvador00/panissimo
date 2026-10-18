import { defineConfig, devices } from '@playwright/test';

/**
 * E2E (frontend §9) against the backend with the development seed. Uses the installed Chrome (no browser download);
 * `npm start` serves the app with the proxy to PAN_API_URL (default http://localhost:8090).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 30_000,
  use: {
    baseURL: process.env['PAN_E2E_BASE_URL'] ?? 'http://localhost:4200',
    channel: 'chrome',
    locale: 'es-MX',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    {
      name: 'celular',
      use: {
        channel: 'chrome',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      },
    },
  ],
  webServer: {
    command: 'npm start',
    url: 'http://localhost:4200',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
