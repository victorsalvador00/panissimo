import { expect, test } from '@playwright/test';
import { AdminApi, signIn } from './support/api';
import { adminCredentials } from './support/env';

/**
 * F-21 (frontend §9, E2E 13): the dashboard by role. Does not move inventory.
 * - The administrator at the plant sees the plant's cards, production of today and low stock per location; a card opens
 *   its list filtered by URL; the production summary loads.
 * - A branch manager sees the branch's cards (transfers to receive, orders in progress) and none of the plant's.
 */
test.describe('tablero por rol', () => {
  test('administrador en la Planta', async ({ page, isMobile }) => {
    await signIn(page, adminCredentials());
    await page.goto('/');
    const main = page.getByRole('main');
    for (const title of ['Bajo mínimo', 'Traspasos por despachar', 'Pedidos por aprobar', 'OC por aprobar', 'OP en proceso'])
      await expect(main.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Traspasos por recibir' })).toHaveCount(0);
    await expect(main.getByRole('heading', { name: 'Producción de hoy por área' })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Artículos bajo mínimo por ubicación' })).toBeVisible();
    // The chart's data, for screen readers.
    await expect(main.getByRole('table', { name: /Artículos bajo mínimo por ubicación/ })).toBeAttached();

    if (isMobile) {
      const quick = page.getByRole('navigation', { name: 'Acciones rápidas' });
      await expect(quick.getByRole('button')).toHaveCount(4);
      await quick.getByRole('button', { name: 'Cerrar producción' }).click();
      await expect(page).toHaveURL(/\/produccion\/ordenes\?tab=InProgress/);
      return;
    }
    await expect(page.getByRole('navigation', { name: 'Acciones rápidas' })).toBeHidden();

    // The low stock card opens the stock with "Solo bajo mínimo" on.
    await main.getByRole('link', { name: /Bajo mínimo/ }).first().click();
    await expect(page).toHaveURL(/\/inventario\/existencias\?bajoMinimo=1/);
    await expect(page.getByRole('switch', { name: 'Solo bajo mínimo' })).toBeChecked();

    await page.goto('/produccion/resumen');
    await expect(page.getByRole('heading', { name: 'Resumen de producción' })).toBeVisible();
    await expect(page.getByText('Costo producido', { exact: true }).first()).toBeVisible();
    await page.getByRole('radio', { name: 'Por día' }).click();
    await expect(
      page.getByRole('table', { name: 'Resumen de producción' }).getByRole('columnheader', { name: 'Día' }),
    ).toBeVisible();
  });

  test('encargado de sucursal', async ({ page, baseURL, isMobile }) => {
    const api = await AdminApi.create(baseURL!);
    await api.ensureBranch('SUC-E2E', 'Sucursal E2E');
    const manager = await api.ensureUser('e2e.tablero@panissimo.test', 'Tablero E2E', 'Encargado de sucursal', ['SUC-E2E']);
    await api.dispose();

    await signIn(page, manager);
    await page.goto('/');
    const main = page.getByRole('main');
    for (const title of ['Bajo mínimo', 'Lotes por caducar', 'Traspasos por recibir', 'Pedidos en curso'])
      await expect(main.getByRole('heading', { name: title, exact: true })).toBeVisible();
    for (const title of ['OC por aprobar', 'OP en proceso', 'Pedidos por aprobar', 'Producción de hoy por área'])
      await expect(main.getByRole('heading', { name: title })).toHaveCount(0);
    await expect(main.getByRole('heading', { name: 'Artículos bajo mínimo por ubicación' })).toHaveCount(0);

    if (isMobile) {
      const quick = page.getByRole('navigation', { name: 'Acciones rápidas' });
      await expect(quick.getByRole('button')).toHaveText([
        /Recibir traspaso/,
        /Contar inventario/,
        /Registrar consumo/,
        /Nuevo pedido/,
      ]);
    }
  });
});
