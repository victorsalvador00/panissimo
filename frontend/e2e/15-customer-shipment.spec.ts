import { expect, test } from '@playwright/test';
import { AdminApi, signIn } from './support/api';
import { adminCredentials } from './support/env';

/** Business date of the plant (America/Mexico_City), as the API expects it. */
function inDays(days: number): string {
  const date = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(date);
}

/**
 * E2E 11 (frontend §9): customer order confirmed → partial shipment from its screen → dispatch → the order is
 * partially shipped and the shipment prints on a letter sheet. **Moves inventory** in the database it runs against:
 * it puts 5 pieces of E2E-PAN in PLANTA-PT (correction) and ships them to a customer.
 */
test('pedido de cliente: remisión parcial y despacho', async ({ page, baseURL, isMobile }) => {
  test.skip(isMobile, 'Cada corrida remisiona un pedido.');
  const api = await AdminApi.create(baseURL!);
  await api.ensureCategory('E2E');
  await api.ensureItem('E2E-PAN', 'Pan E2E', 'E2E', 'pza', 'FinishedGood');
  await api.addStock('PLANTA-PT', 'E2E-PAN', 5, 3);
  const customers = await api.get<{ id: string }[]>('customers/lookup?q=E2E-BASE');
  const customer =
    customers[0] ??
    (await api.post<{ id: string }>('customers', {
      code: 'E2E-BASE',
      name: 'Cliente E2E base',
      taxId: null,
      contactName: null,
      phone: null,
      email: null,
      notes: null,
    }));
  const order = await api.post<{ id: string; folio: string; version: number }>('customer-orders', {
    customerId: customer.id,
    deliveryPointId: null,
    requiredDate: inDays(2),
    customerReference: 'E2E 11',
    notes: null,
    lines: [{ itemId: await api.itemId('E2E-PAN'), quantity: 12, unitPrice: 4.5 }],
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
    await page.getByRole('option', { name: 'Producto terminado' }).click();
  }
  await page.getByLabel('Vehículo').fill('Camioneta E2E');
  await page.getByLabel('Chofer').fill('Chofer E2E');
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

  await page.getByRole('link', { name: 'Volver al pedido' }).click();
  await expect(page.locator('app-status-tag').getByText('Remisionado parcial')).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'E2E-PAN' })).toContainText('7 pza');
});
