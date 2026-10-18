import { expect, test } from '@playwright/test';
import { AdminApi, signIn } from './support/api';
import { adminCredentials } from './support/env';

/**
 * E2E 10 (frontend §9): branch order made on the phone → the plant approves less than requested → dispatches its
 * transfer → the branch receives short on the phone; the order ends fulfilled. **Moves inventory** in the database it
 * runs against: it puts 4 pieces of E2E-INSUMO in PLANTA-PT (correction), ships 3 to SUC-E2E and receives 2.
 */
test('pedido de sucursal: aprobar, despachar y recibir con faltante', async ({
  page,
  baseURL,
  isMobile,
}) => {
  test.skip(isMobile, 'Recorre 390 px y escritorio en una sola corrida.');
  test.setTimeout(90_000);
  const api = await AdminApi.create(baseURL!);
  await api.ensureCategory('E2E');
  await api.ensureItem('E2E-INSUMO', 'Insumo E2E', 'E2E', 'pza', 'Supply');
  await api.addStock('PLANTA-PT', 'E2E-INSUMO', 4);
  const branch = await api.ensureBranch('SUC-E2E', 'Sucursal E2E');
  await api.dispose();

  await signIn(page, adminCredentials());
  await page.evaluate((id) => localStorage.setItem('pan.location', id), branch);

  // The branch orders 4 on the phone.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/logistica/pedidos/nuevo');
  await page.getByRole('combobox', { name: 'Producto o insumo' }).fill('E2E-INSUMO');
  await page.getByRole('option', { name: /E2E-INSUMO/ }).click();
  await page.getByLabel('Cantidad de la línea 1').fill('4');
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page.getByRole('heading', { name: /Pedido PED-/ })).toBeVisible();
  await page.getByRole('button', { name: 'Enviar a la Planta' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Enviar' }).click();
  await expect(page.locator('app-status-tag').getByText('Enviado')).toBeVisible();

  // The plant approves 3 of 4 on the same screen.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('button', { name: 'Aprobar' }).click();
  await page.getByLabel('Aprobar de E2E-INSUMO').fill('3');
  await page.getByRole('button', { name: 'Confirmar aprobación' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Aprobar' }).click();
  await expect(page.locator('app-status-tag').getByText('Aprobado')).toBeVisible();

  // Dispatch of its transfer.
  await page.getByRole('link', { name: 'Ir a despachar' }).click();
  await page.getByRole('button', { name: 'Despachar' }).click();
  const dispatch = page.getByRole('dialog');
  const warehouse = dispatch.getByRole('combobox', { name: 'Sale del subalmacén' });
  const hasWarehouses = await warehouse
    .waitFor({ state: 'visible', timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  if (hasWarehouses) {
    await warehouse.click();
    await page.getByRole('option', { name: 'Producto terminado' }).click();
  }
  await dispatch.getByLabel('Vehículo').fill('Camioneta E2E');
  await dispatch.getByLabel('Chofer').fill('Chofer E2E');
  await dispatch.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Despachar' }).click();
  await expect(page.locator('app-status-tag').getByText('En tránsito')).toBeVisible();

  // The branch receives 2 of 3 on the phone.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: 'Recibir' }).click();
  const card = page.locator('article').filter({ hasText: 'E2E-INSUMO' });
  await expect(card.getByLabel('Recibido')).toHaveValue('3');
  await card.getByLabel('Recibido').fill('2');
  await card.getByRole('combobox', { name: 'Motivo del faltante' }).click();
  await page.getByRole('option', { name: 'Faltante' }).click();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'scroll horizontal en px').toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: 'Confirmar recepción' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Recibir' }).click();
  await expect(page.locator('app-status-tag').getByText('Recibido con diferencias')).toBeVisible();
});
