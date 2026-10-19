import { expect, test } from '@playwright/test';
import { AdminApi, signIn } from './support/api';
import { base } from './support/base-data';
import { adminCredentials } from './support/env';

/** Business date of the plant (America/Mexico_City), as the API expects it. */
function inDays(days: number): string {
  const date = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(date);
}

/**
 * E2E 11 (frontend §9): customer order confirmed → partial shipment from its screen → dispatch → the order is
 * partially shipped and the shipment prints on a letter sheet → delivery with one piece rejected that returns (RN-114,
 * F-27), pending again in the order. **Moves inventory** in the database it runs against:
 * it puts 5 packaged donuts (lot E2E-15) in PLANTA-PT (correction) and ships them to the customer OXXO-001.
 */
test('pedido de cliente: remisión parcial y despacho', async ({ page, baseURL, isMobile }) => {
  test.skip(isMobile, 'Cada corrida remisiona un pedido.');
  const api = await AdminApi.create(baseURL!);
  await api.fleet();
  await api.addStock(base.finishedGoods, base.packagedDonut, 5, 3, 'E2E-15');
  const customers = await api.get<{ id: string; code: string }[]>(
    `customers/lookup?q=${base.customer}`,
  );
  const customer = customers.find((c) => c.code === base.customer);
  expect(customer, `cliente base ${base.customer}`).toBeTruthy();
  const order = await api.post<{ id: string; folio: string; version: number }>('customer-orders', {
    customerId: customer!.id,
    deliveryPointId: null,
    requiredDate: inDays(2),
    customerReference: 'E2E 11',
    notes: null,
    lines: [{ itemId: await api.itemId(base.packagedDonut), quantity: 12, unitPrice: 4.5 }],
  });
  await api.post(`customer-orders/${order.id}/confirm`, { version: order.version });
  await api.dispose();

  await signIn(page, adminCredentials());
  await page.goto(`/ventas/pedidos/${order.id}`);
  await page.getByRole('button', { name: 'Nueva remisión' }).click();
  await expect(page.getByRole('heading', { name: /Remisión RM-/ })).toBeVisible();

  // Partial: 5 of 12, from finished goods.
  const quantity = page.getByLabel('Cantidad', { exact: true });
  await expect(quantity).toHaveValue('12');
  await quantity.fill('5');
  const warehouse = page.getByRole('combobox', { name: 'Sale del subalmacén' });
  if (await warehouse.isVisible()) {
    await warehouse.click();
    await page.getByRole('option', { name: 'Producto terminado', exact: true }).click();
  }
  await page.getByRole('combobox', { name: 'Vehículo' }).click();
  await page.getByRole('option', { name: new RegExp(base.vehicle) }).click();
  await page.getByRole('combobox', { name: 'Chofer' }).click();
  await page.getByRole('option', { name: base.driver }).click();
  await page.getByLabel('Recibe (opcional)').fill('Encargado de tienda');
  await page.getByRole('button', { name: 'Despachar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Despachar' }).click();
  await expect(page.locator('app-status-tag').getByText('Despachada')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Imprimir' })).toBeVisible();

  // Printed: the sheet without the shell, with the signatures.
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('heading', { name: /Remisión RM-/, level: 1 })).toBeVisible();
  await expect(page.getByText('Documento de entrega · no es factura')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Menú principal' })).toBeHidden();
  await page.screenshot({ path: test.info().outputPath('remision-impresa.png'), fullPage: true });
  await page.emulateMedia({ media: 'screen' });

  // RN-114: delivery with 1 piece rejected (damaged) that returns to Producto terminado.
  await page.getByRole('button', { name: 'Registrar entrega' }).click();
  const delivery = page.getByRole('dialog');
  await delivery.getByLabel('Rechazado').first().fill('1');
  await delivery.getByRole('combobox', { name: 'Motivo' }).click();
  await page.getByRole('option', { name: 'Dañado' }).click();
  const back = delivery.getByRole('combobox', { name: 'Regresa al subalmacén' });
  if (await back.isVisible()) {
    await back.click();
    await page.getByRole('option', { name: 'Producto terminado', exact: true }).click();
  }
  await delivery.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Registrar entrega' }).click();
  await expect(page.locator('app-status-tag').getByText('Entregada con diferencias')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Rechazos en la entrega' })).toBeVisible();

  // The rejected piece is pending again in the order.
  await page.getByRole('link', { name: 'Volver al pedido' }).click();
  await expect(page.locator('app-status-tag').getByText('Remisionado parcial')).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: base.packagedDonut })).toContainText(
    '8 pza',
  );
});
