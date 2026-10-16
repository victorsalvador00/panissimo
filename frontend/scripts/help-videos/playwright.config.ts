import { defineConfig, devices } from '@playwright/test';
import base from '../../playwright.config';

/**
 * Grabación de los videos del manual (`npm run help:record`). Requiere la API y el frontend en marcha, como los
 * E2E. Cada prueba de record.spec.ts graba una pantalla en public/help/<nombre>.webm.
 */
export default defineConfig({
  ...base,
  testDir: '.',
  reporter: [['list']],
  timeout: 180_000,
  projects: [{ name: 'grabacion', use: { ...devices['Desktop Chrome'] } }],
});
