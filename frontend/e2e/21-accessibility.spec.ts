import AxeBuilder from '@axe-core/playwright';
import { Page, expect, test } from '@playwright/test';
import { AdminApi, signIn } from './support/api';
import { adminCredentials } from './support/env';

/**
 * E2E 14 (frontend §9): axe with WCAG 2.1 A/AA, failing on serious or critical issues, in light and dark, on the login,
 * the dashboard, lists and capture screens. Does not move inventory (the capture screens are only opened).
 */

const SCREENS: readonly { name: string; url: string; ready: string }[] = [
  { name: 'tablero', url: '/', ready: 'Inicio' },
  { name: 'existencias', url: '/inventario/existencias', ready: 'Existencias' },
  { name: 'órdenes de producción', url: '/produccion/ordenes', ready: 'Órdenes de producción' },
  { name: 'plan', url: '/produccion/plan', ready: 'Plan de producción' },
  { name: 'resumen de producción', url: '/produccion/resumen', ready: 'Resumen de producción' },
  { name: 'traspasos', url: '/logistica/traspasos', ready: 'Traspasos' },
  { name: 'órdenes de compra', url: '/compras/ordenes', ready: 'Órdenes de compra' },
  { name: 'artículos', url: '/catalogos/articulos', ready: 'Artículos' },
  { name: 'nuevo ajuste', url: '/inventario/ajustes/nuevo', ready: 'Nuevo ajuste' },
  { name: 'nuevo pedido de cliente', url: '/ventas/pedidos/nuevo', ready: 'Nuevo pedido de cliente' },
  { name: 'análisis de consumo', url: '/inventario/analisis-consumo', ready: 'Análisis de consumo' },
];

async function audit(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // Chart canvases are decorative (aria-hidden); their data is in a hidden table.
    .exclude('canvas')
    .analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const report = serious
    .map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).slice(0, 5).join('\n  ')}`)
    .join('\n');
  expect(serious, `${label}\n${report}`).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`accesibilidad en tema ${theme === 'light' ? 'claro' : 'oscuro'}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((mode) => localStorage.setItem('pan.theme', mode), theme);
    });

    test('inicio de sesión', async ({ page }) => {
      await page.goto('/login');
      await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
      await audit(page, 'login');
    });

    test('pantallas del sistema', async ({ page, baseURL, isMobile }) => {
      test.skip(isMobile, 'Las mismas pantallas; el celular lo cubre la revisión de 360 px.');
      test.setTimeout(120_000);
      const api = await AdminApi.create(baseURL!);
      await api.ensureCategory('E2E');
      await api.dispose();
      await signIn(page, adminCredentials());
      for (const screen of SCREENS) {
        await page.goto(screen.url);
        await expect(page.getByRole('heading', { name: screen.ready, exact: true }).first()).toBeVisible();
        // Lists and charts finish loading.
        await page.waitForLoadState('networkidle');
        await audit(page, `${screen.name} (${theme})`);
      }
    });
  });
}
