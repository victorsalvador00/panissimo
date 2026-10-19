import { expect, test } from '@playwright/test';
import { AdminApi, signIn } from './support/api';
import { adminCredentials } from './support/env';

/**
 * E2E 5 (frontend §9): direct transfer from the plant to a branch, dispatched and received short. Moves inventory in
 * the database it runs against: it first puts 3 pieces of E2E-TRASPASO in PLANTA-PT (correction), ships them to the
 * branch SUC-E2E and receives 2 (one is a transit loss). Desktop only; the receipt is also checked at 390 px.
 */
test('traspaso directo: despachar y recibir con faltante', async ({ page, baseURL, isMobile }) => {
  test.skip(isMobile, 'Un solo traspaso por corrida.');
  const api = await AdminApi.create(baseURL!);
  await api.ensureCategory('E2E');
  await api.ensureFleet();
  await api.ensureItem('E2E-TRASPASO', 'Artículo E2E para traspasos', 'E2E', 'pza', 'Supply');
  await api.ensureBranch('SUC-E2E', 'Sucursal E2E');
  await api.addStock('PLANTA-PT', 'E2E-TRASPASO', 3);
  const plant = await api.locationId('PLANTA');
  await api.dispose();

  await signIn(page, adminCredentials());
  await page.evaluate((id) => localStorage.setItem('pan.location', id!), plant);

  // Draft from the plant to the branch.
  await page.goto('/logistica/traspasos/nuevo');
  await page.getByRole('combobox', { name: 'Destino' }).click();
  await page.getByRole('option', { name: 'Sucursal E2E' }).click();
  await page.getByRole('combobox', { name: 'Producto o insumo' }).fill('E2E-TRASPASO');
  await page.getByRole('option', { name: /E2E-TRASPASO/ }).click();
  await page.getByLabel('Cantidad de la línea 1').fill('3');
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page.getByRole('heading', { name: /Traspaso TR-/ })).toBeVisible();
  const detailUrl = page.url();

  // Dispatch from the finished goods sub-warehouse.
  await page.getByRole('button', { name: 'Despachar' }).click();
  const dispatch = page.getByRole('dialog');
  const warehouse = dispatch.getByRole('combobox', { name: 'Sale del subalmacén' });
  // The plant keeps its stock in sub-warehouses; the field is there as soon as the dialog opens.
  const hasWarehouses = await warehouse
    .waitFor({ state: 'visible', timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  if (hasWarehouses) {
    await warehouse.click();
    await page.getByRole('option', { name: 'Producto terminado' }).click();
  }
  await dispatch.getByRole('combobox', { name: 'Vehículo' }).click();
  await page.getByRole('option', { name: /E2E-01/ }).click();
  await dispatch.getByRole('combobox', { name: 'Chofer' }).click();
  await page.getByRole('option', { name: 'Chofer E2E' }).click();
  await dispatch.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Despachar' }).click();
  await expect(page.getByText('En tránsito', { exact: true })).toBeVisible();

  // Receipt at 390 px: 2 of 3 arrive.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: 'Recibir' }).click();
  const card = page.locator('article').filter({ hasText: 'E2E-TRASPASO' });
  const received = card.getByLabel('Recibido');
  await expect(received).toHaveValue('3');
  await received.fill('2');
  await card.getByRole('combobox', { name: 'Motivo del faltante' }).click();
  await page.getByRole('option', { name: 'Faltante' }).click();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'scroll horizontal en px').toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: 'Confirmar recepción' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Recibir' }).click();

  await expect(page).toHaveURL(detailUrl);
  await expect(page.getByText('Recibido con diferencias')).toBeVisible();
  await expect(page.getByText('Pérdida en tránsito')).toBeVisible();
});
