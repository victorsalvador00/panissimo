import { defineConfig, devices } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * E2E contra el backend real (spec frontend §9). Requisitos: API de desarrollo en marcha
 * (`API_PORT=8090 docker compose -f deploy/docker-compose.dev.yml up -d`).
 *
 * Credenciales del administrador: `SGO_E2E_ADMIN_EMAIL` / `SGO_E2E_ADMIN_PASSWORD`; si no están
 * definidas se toman del `deploy/.env` local (`SGO__Seed__AdminEmail` / `SGO__Seed__AdminPassword`),
 * que no se versiona.
 */
loadLocalAdminCredentials();

const baseURL = process.env['SGO_E2E_BASE_URL'] ?? 'http://localhost:4200';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    locale: 'es-MX',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] } },
    { name: 'celular', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: 'npm start',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

function loadLocalAdminCredentials(): void {
  if (process.env['SGO_E2E_ADMIN_EMAIL'] && process.env['SGO_E2E_ADMIN_PASSWORD']) {
    return;
  }
  const envFile = join(__dirname, '..', 'deploy', '.env');
  if (!existsSync(envFile)) {
    return;
  }
  const values = Object.fromEntries(
    readFileSync(envFile, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.includes('=') && !line.trimStart().startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      }),
  );
  process.env['SGO_E2E_ADMIN_EMAIL'] ??= values['SGO__Seed__AdminEmail'];
  process.env['SGO_E2E_ADMIN_PASSWORD'] ??= values['SGO__Seed__AdminPassword'];
}
