import { expect, test } from '@playwright/test';
import { AdminApi, signIn } from './support/api';
import { adminCredentials } from './support/env';

/**
 * E2E 3 (frontend §9): an exit adjustment without stock shows the shortages dialog and saves nothing. Does not move
 * inventory (the backend rejects it); it creates the item E2E-SIN-EXISTENCIA the first time, which never gets stock.
 */
test('un ajuste de salida sin existencia muestra el diálogo de faltantes', async ({ page, baseURL }) => {
  const api = await AdminApi.create(baseURL!);
  await api.ensureCategory('E2E');
  await api.ensureItem('E2E-SIN-EXISTENCIA', 'Artículo E2E sin existencia', 'E2E', 'pza');
  await api.dispose();

  await signIn(page, adminCredentials());
  await page.goto('/inventario/ajustes/nuevo');

  // The plant keeps its stock in sub-warehouses: the adjustment goes to one of them.
  // The field appears once the sub-warehouses load; a plant without them keeps the stock itself.
  const warehouse = page.getByRole('combobox', { name: 'Subalmacén' });
  const hasWarehouses = await warehouse
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (hasWarehouses) {
    await warehouse.click();
    await page.getByRole('option', { name: 'Producto terminado' }).click();
  }
  await page.getByRole('combobox', { name: 'Motivo' }).click();
  await page.getByRole('option', { name: 'Merma', exact: true }).click();

  await page.getByRole('combobox', { name: 'Artículo' }).fill('E2E-SIN-EXISTENCIA');
  await page.getByRole('option', { name: /E2E-SIN-EXISTENCIA/ }).click();
  await page.getByLabel('Cantidad de la línea 1').fill('3');

  await page.getByRole('button', { name: 'Registrar ajuste' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Registrar ajuste' }).click();

  const dialog = page.getByRole('dialog').filter({ hasText: 'Existencia insuficiente' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('row').filter({ hasText: 'E2E-SIN-EXISTENCIA' })).toContainText('3');
  await dialog.getByRole('button', { name: 'Entendido' }).click();

  // Nothing was saved: the form is still there to fix it.
  await expect(page).toHaveURL(/\/inventario\/ajustes\/nuevo$/);
});
