import { expect, test } from '@playwright/test';
import { AdminApi, signIn } from './support/api';
import { base } from './support/base-data';
import { adminCredentials } from './support/env';

/**
 * E2E 10 (frontend §9): branch order made on the phone → the plant approves less than requested → dispatches its
 * transfer → the branch receives short on the phone; the order ends fulfilled. **Moves inventory** in the database it
 * runs against: it puts 4 bags (IN-002) in PLANTA-PT (correction), ships 3 to SUC-001 and receives 2.
 */
test('pedido de sucursal: aprobar, despachar y recibir con faltante', async ({
  page,
  baseURL,
  isMobile,
}) => {
  test.skip(isMobile, 'Recorre 390 px y escritorio en una sola corrida.');
  test.setTimeout(90_000);
  const api = await AdminApi.create(baseURL!);
  await api.fleet();
  await api.addStock(base.finishedGoods, base.bag, 4);
  const branch = await api.requireLocation(base.branch);
  await api.dispose();

  await signIn(page, adminCredentials());
  await page.evaluate((id) => localStorage.setItem('pan.location', id), branch);

  // The branch orders 4 on the phone.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/logistica/pedidos/nuevo');
  await page.getByRole('combobox', { name: 'Producto o insumo' }).fill(base.bag);
  await page.getByRole('option', { name: new RegExp(base.bag) }).click();
  await page.getByLabel('Cantidad de la línea 1').fill('4');
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page.getByRole('heading', { name: /Pedido PED-/ })).toBeVisible();
  await page.getByRole('button', { name: 'Enviar a la Planta' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Enviar' }).click();
  await expect(page.locator('app-status-tag').getByText('Enviado')).toBeVisible();

  // The plant approves 3 of 4 on the same screen.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('button', { name: 'Aprobar' }).click();
  await page.getByLabel(`Aprobar de ${base.bag}`).fill('3');
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
    await page.getByRole('option', { name: 'Producto terminado', exact: true }).click();
  }
  await dispatch.getByRole('combobox', { name: 'Vehículo' }).click();
  await page.getByRole('option', { name: new RegExp(base.vehicle) }).click();
  await dispatch.getByRole('combobox', { name: 'Chofer' }).click();
  await page.getByRole('option', { name: base.driver }).click();
  await dispatch.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Despachar' }).click();
  await expect(page.locator('app-status-tag').getByText('En tránsito')).toBeVisible();

  // The branch receives 2 of 3 on the phone.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: 'Recibir' }).click();
  const card = page.locator('article').filter({ hasText: base.bag });
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
