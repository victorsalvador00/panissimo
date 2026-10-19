import { expect, test } from '@playwright/test';
import { AdminApi, signIn } from './support/api';
import { base } from './support/base-data';
import { adminCredentials } from './support/env';

/**
 * F-17 (frontend §11): an order of the customer of the base catalogs for its delivery point, with a manual price,
 * saved and confirmed at once. The customer screens are not tested here: creating customers, points or customer items
 * would add records to the base catalogs. Does not move inventory; each run leaves a confirmed order of the packaged
 * donut (demand of the production plan).
 */
test('pedido de cliente confirmado para su punto de entrega', async ({
  page,
  baseURL,
  isMobile,
}) => {
  test.skip(isMobile, 'Cada corrida crea un pedido.');
  const api = await AdminApi.create(baseURL!);
  await api.itemId(base.packagedDonut);
  await api.dispose();

  await signIn(page, adminCredentials());

  await page.goto('/ventas/pedidos/nuevo');
  await page.getByRole('combobox', { name: 'Cliente' }).fill(base.customer);
  await page.getByRole('option', { name: new RegExp(base.customer) }).click();
  await page.getByRole('combobox', { name: 'Punto de entrega' }).click();
  await page.getByRole('option', { name: base.deliveryPoint }).click();
  await page.getByLabel('Referencia del cliente').fill('OC-CLIENTE-7');
  await page
    .getByRole('combobox', { name: 'Producto terminado', exact: true })
    .fill(base.packagedDonut);
  await page.getByRole('option', { name: new RegExp(base.packagedDonut) }).click();
  await page.getByLabel('Precio de la línea 1').fill('4.5');
  await page.getByLabel('Cantidad de la línea 1').fill('12');
  await page.getByRole('button', { name: 'Guardar y confirmar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar pedido' }).click();

  await expect(page.getByRole('heading', { name: /Pedido PC-/ })).toBeVisible();
  await expect(page.locator('app-status-tag').getByText('Confirmado')).toBeVisible();
  await expect(page.getByText(base.deliveryPoint)).toBeVisible();
  await expect(page.getByText('Importe informativo')).toContainText('$54.00');
});
