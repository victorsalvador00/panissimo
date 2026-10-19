import { expect, test } from '@playwright/test';
import { signIn } from './support/api';
import { base } from './support/base-data';
import { adminCredentials } from './support/env';

/** More salt than any test ever puts in finished goods: the exit can never be covered. */
const quantity = '999999';

/**
 * E2E 3 (frontend §9): an exit adjustment larger than the stock shows the shortages dialog and saves nothing. Does not
 * move inventory (the backend rejects it).
 */
test('un ajuste de salida sin existencia muestra el diálogo de faltantes', async ({ page }) => {
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
    await page.getByRole('option', { name: 'Producto terminado', exact: true }).click();
  }
  await page.getByRole('combobox', { name: 'Motivo' }).click();
  await page.getByRole('option', { name: 'Merma', exact: true }).click();

  await page.getByRole('combobox', { name: 'Artículo' }).fill(base.salt);
  await page.getByRole('option', { name: new RegExp(base.salt) }).click();
  await page.getByLabel('Cantidad de la línea 1').fill(quantity);

  await page.getByRole('button', { name: 'Registrar ajuste' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Registrar ajuste' }).click();

  const dialog = page.getByRole('dialog').filter({ hasText: 'Existencia insuficiente' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('row').filter({ hasText: base.salt })).toContainText('999,999');
  await dialog.getByRole('button', { name: 'Entendido' }).click();

  // Nothing was saved: the form is still there to fix it.
  await expect(page).toHaveURL(/\/inventario\/ajustes\/nuevo$/);
});
