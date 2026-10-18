import { expect, test } from '@playwright/test';
import { AdminApi, signIn } from './support/api';
import { adminCredentials } from './support/env';

/**
 * F-17 (frontend §11): a customer with a delivery point and an item with its informative price; an order for that
 * point saved and confirmed at once. Does not move inventory; each run leaves a customer "Cliente E2E …" and a
 * confirmed order of E2E-PAN (demand of the production plan for tomorrow).
 */
test('alta de cliente con punto de entrega y pedido confirmado', async ({
  page,
  baseURL,
  isMobile,
}) => {
  test.skip(isMobile, 'Cada corrida crea un cliente.');
  const api = await AdminApi.create(baseURL!);
  await api.ensureCategory('E2E');
  await api.ensureItem('E2E-PAN', 'Pan E2E', 'E2E', 'pza', 'FinishedGood');
  await api.dispose();
  const code = `E2E-${Date.now().toString(36).toUpperCase()}`;

  await signIn(page, adminCredentials());

  // Customer with its delivery point and item.
  await page.goto('/ventas/clientes/nuevo');
  await page.getByLabel('Código').fill(code.toLowerCase());
  await page.getByLabel('Nombre').fill(`Cliente E2E ${code}`);
  await page.getByRole('button', { name: 'Crear cliente' }).click();
  await expect(page.getByRole('heading', { name: `${code} · Cliente E2E ${code}` })).toBeVisible();

  await page.getByRole('tab', { name: 'Puntos de entrega' }).click();
  await page.getByRole('button', { name: 'Agregar punto' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre').fill('Tienda centro');
  await dialog.getByLabel('Dirección').fill('Av. Juárez 100');
  await dialog.getByRole('button', { name: 'Agregar' }).click();
  await expect(page.getByText('Tienda centro')).toBeVisible();

  await page.getByRole('tab', { name: 'Artículos' }).click();
  await page.getByRole('button', { name: 'Agregar artículo' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Producto terminado' }).fill('E2E-PAN');
  await page.getByRole('option', { name: /E2E-PAN/ }).click();
  await dialog.getByLabel('Clave del cliente').fill('PAN-01');
  await dialog.getByLabel('Precio informativo (sin IVA)').fill('4.5');
  await dialog.getByRole('button', { name: 'Agregar' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'PAN-01' })).toContainText('$4.50');

  // Order for that point, saved and confirmed.
  await page.goto('/ventas/pedidos/nuevo');
  await page.getByRole('combobox', { name: 'Cliente' }).fill(code);
  await page.getByRole('option', { name: new RegExp(code) }).click();
  await page.getByRole('combobox', { name: 'Punto de entrega' }).click();
  await page.getByRole('option', { name: 'Tienda centro' }).click();
  await page.getByLabel('Referencia del cliente').fill('OC-CLIENTE-7');
  await page.getByRole('combobox', { name: 'Producto terminado' }).fill('E2E-PAN');
  await page.getByRole('option', { name: /E2E-PAN/ }).click();
  await expect(page.getByLabel('Precio de la línea 1')).toHaveValue('4.5');
  await expect(page.getByText('Clave del cliente: PAN-01')).toBeVisible();
  await page.getByLabel('Cantidad de la línea 1').fill('12');
  await page.getByRole('button', { name: 'Guardar y confirmar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar pedido' }).click();

  await expect(page.getByRole('heading', { name: /Pedido PC-/ })).toBeVisible();
  await expect(page.locator('app-status-tag').getByText('Confirmado')).toBeVisible();
  await expect(page.getByText('Tienda centro')).toBeVisible();
  await expect(page.getByText('Importe informativo')).toContainText('$54.00');
});
