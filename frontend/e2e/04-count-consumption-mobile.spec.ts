import { Page, expect, test } from '@playwright/test';
import { AdminApi, signIn } from './support/api';
import { base } from './support/base-data';
import { adminCredentials } from './support/env';

/** The page never scrolls sideways at the phone width (frontend §4.3). */
async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'scroll horizontal en px').toBeLessThanOrEqual(0);
}

/**
 * E2E 4 (frontend §9): physical count and branch consumption at 390 px without horizontal scroll. Does not move
 * inventory: the count is cancelled and the consumption is captured but not posted. Cancels open counts of the
 * finished goods sub-warehouse before starting.
 */
test.describe('Conteo y consumo en celular', () => {
  test.skip(({ isMobile }) => !isMobile, 'Solo en el proyecto de 390 px.');

  test('conteo a ciegas con autoguardado, sin scroll horizontal', async ({ page, baseURL }) => {
    const api = await AdminApi.create(baseURL!);
    const warehouse = await api.locationId(base.finishedGoods);
    if (warehouse) await api.cancelOpenCounts(warehouse);
    await api.dispose();

    await signIn(page, adminCredentials());
    await page.goto('/inventario/conteos');
    await page.getByRole('button', { name: 'Nuevo conteo' }).click();
    const dialog = page.getByRole('dialog');
    const subwarehouse = dialog.getByRole('combobox', { name: 'Subalmacén' });
    if (await subwarehouse.isVisible()) {
      await subwarehouse.click();
      await page.getByRole('option', { name: 'Producto terminado', exact: true }).click();
    }
    await dialog.getByRole('combobox', { name: 'Categoría (opcional)' }).click();
    await page.getByRole('option', { name: 'Reposteria', exact: true }).click();
    await dialog.getByRole('button', { name: 'Crear conteo' }).click();

    await page.getByRole('button', { name: 'Iniciar conteo' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Iniciar conteo' }).click();

    // Blind capture: the expected quantity is not on the screen.
    const first = page.locator('input.pan-qty-input').first();
    await expect(first).toBeVisible();
    await expect(page.getByText('Al iniciar')).toHaveCount(0);
    await first.fill('7');
    await expect(page.getByRole('status').filter({ hasText: 'Guardado' })).toBeVisible();
    await expect(page.getByRole('radio', { name: /Contadas \(1\)/ })).toBeVisible();
    await expectNoHorizontalScroll(page);

    // The capture survives reloading the page.
    await page.reload();
    await expect(page.locator('input.pan-qty-input').first()).toHaveValue('7');

    await page.getByRole('button', { name: 'Revisar diferencias' }).click();
    await expect(page.getByRole('button', { name: /Faltan \d+|Cerrar conteo/ })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.getByRole('button', { name: 'Cancelar conteo' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar conteo' }).click();
    await expect(page.getByRole('heading', { name: 'Conteo cancelado' })).toBeVisible();
  });

  test('consumo de sucursal: captura rápida que suma el mismo artículo, sin scroll horizontal', async ({
    page,
    baseURL,
  }) => {
    const api = await AdminApi.create(baseURL!);
    const branch = await api.requireLocation(base.branch);
    await api.dispose();

    await signIn(page, adminCredentials());
    // The active location is per device: make the branch the active one.
    await page.evaluate((id) => localStorage.setItem('pan.location', id), branch);
    await page.goto('/inventario/consumos/nuevo');
    await expect(page.getByRole('heading', { name: base.branchName })).toBeVisible();

    const item = page.getByRole('combobox', { name: 'Artículo' });
    const quantity = page.getByLabel('Cantidad', { exact: true });
    for (const qty of ['2', '3']) {
      await item.fill(base.bag);
      await page.getByRole('option', { name: new RegExp(base.bag) }).click();
      await quantity.fill(qty);
      await quantity.press('Enter');
    }
    await expect(page.getByRole('heading', { name: 'Artículos (1)' })).toBeVisible();
    await expect(page.getByLabel(`Cantidad de ${base.bag}`)).toHaveValue('5');
    await expectNoHorizontalScroll(page);
  });
});
