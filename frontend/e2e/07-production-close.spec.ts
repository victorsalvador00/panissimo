import { Page, expect, test } from '@playwright/test';
import { AdminApi, signIn } from './support/api';
import { base } from './support/base-data';
import { adminCredentials } from './support/env';

/** Business date of the plant (America/Mexico_City), as the API expects it. */
function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());
}

/**
 * Every component of the donut recipe in the sub-warehouse that supplies it (RN-111): the release reserves them and the
 * ingredients vouchers take them to the factory. Lots for the components that track them.
 */
const components: { sku: string; warehouse: string; quantity: number; lot: boolean }[] = [
  { sku: 'IN-001', warehouse: base.supplies, quantity: 1, lot: false },
  { sku: 'MP-001', warehouse: base.rawMaterials, quantity: 2, lot: true },
  { sku: 'MP-002', warehouse: base.rawMaterials, quantity: 1, lot: false },
  { sku: 'MP-003', warehouse: base.rawMaterials, quantity: 1, lot: true },
  { sku: 'MP-004', warehouse: base.rawMaterials, quantity: 1, lot: true },
  { sku: 'MP-005', warehouse: base.rawMaterials, quantity: 1, lot: true },
  { sku: 'MP-006', warehouse: base.rawMaterials, quantity: 1, lot: true },
  { sku: 'MP-007', warehouse: base.rawMaterials, quantity: 1, lot: true },
];

/**
 * E2E 7 (frontend §9): release → partial close at tablet width → partial close at 390 px → final close short of the
 * plan → the lots of each close in Existencias. **Moves inventory** in the database it runs against: it puts the
 * ingredients of 20 donuts in their sub-warehouses (correction; lot E2E-7) and produces 18 PT-020-DONA (three lots) at
 * FABRICA-PT from the recipe of the base catalogs (20 pza: 1 kg of flour).
 */
test('OP: liberar, cierres parciales y cierre final con faltante', async ({
  page,
  baseURL,
  isMobile,
}) => {
  test.skip(isMobile, 'Recorre tableta, 390 px y escritorio en una sola corrida.');
  test.setTimeout(90_000);
  const api = await AdminApi.create(baseURL!);
  const donut = await api.itemId(base.donut);
  for (const c of components)
    await api.addStock(c.warehouse, c.sku, c.quantity, 18, c.lot ? 'E2E-7' : null);
  const plant = await api.requireLocation(base.plant);
  // RN-49: the close consumes from the factory of the recipe and leaves the product there.
  await api.requireLocation(base.factory);
  const order = await api.post<{ id: string; folio: string }>('production-orders', {
    locationId: plant,
    outputItemId: donut,
    plannedQty: 20,
    scheduledDate: today(),
    productionAreaId: null,
    shift: 'Day',
    notes: 'E2E 7',
  });
  await api.dispose();
  /** The real consumption of the flour (1 kg per 20 pza). */
  const flour = (p: Page) =>
    p
      .locator('article')
      .filter({ hasText: base.flour })
      .getByLabel('Consumo real', { exact: true });

  await signIn(page, adminCredentials());
  await page.goto(`/produccion/ordenes/${order.id}`);
  await page.getByRole('button', { name: 'Liberar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Liberar' }).click();
  await expect(page.locator('app-status-tag').getByText('Liberada')).toBeVisible();
  // RN-112: the ingredients reach the factory with their vouchers before producing.
  const vouchers = await AdminApi.create(baseURL!);
  await vouchers.sendIngredients(order.id);
  await vouchers.dispose();

  // Partial close on the tablet: 10 pza consume the theoretical 0.5 kg of flour.
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.getByRole('link', { name: 'Cierre parcial' }).click();
  await page.getByLabel('Cantidad producida en este cierre').fill('10');
  await expect(flour(page)).toHaveValue('0.5');
  await page.getByRole('button', { name: 'Registrar cierre parcial' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Registrar cierre parcial' }).click();
  await expect(page).toHaveURL(new RegExp(`/produccion/ordenes/${order.id}$`));
  await expect(page.locator('app-status-tag').getByText('En proceso')).toBeVisible();

  // Second partial close at 390 px: the sub-warehouses come back from the previous close.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: 'Cierre parcial' }).click();
  await page.getByLabel('Cantidad producida en este cierre').fill('5');
  await expect(flour(page)).toHaveValue('0.25');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'scroll horizontal en px').toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: 'Registrar cierre parcial' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Registrar cierre parcial' }).click();
  await expect(page).toHaveURL(new RegExp(`/produccion/ordenes/${order.id}$`));

  // Final close below the plan (18 of 20): the reason is required.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('link', { name: 'Cierre final' }).click();
  const produced = page.getByLabel('Cantidad producida en este cierre');
  await expect(produced).toHaveValue('5');
  await produced.fill('3');
  await page.getByRole('combobox', { name: 'Motivo del faltante' }).click();
  await page.getByRole('option', { name: 'Falta de insumo' }).click();
  await page.getByRole('button', { name: 'Cerrar orden' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar orden' }).click();
  await expect(page.locator('app-status-tag').getByText('Terminada')).toBeVisible();
  await expect(page.getByText('Falta de insumo')).toBeVisible();
  await page.getByRole('tab', { name: 'Cierres (3)' }).click();
  await expect(page.getByText(`lote ${order.folio}-03`)).toBeVisible();

  // Each close entered its own lot.
  await page.goto('/inventario/existencias');
  await page.getByLabel('Buscar por SKU o nombre').fill(base.donut);
  const row = page
    .getByRole('row')
    .filter({ hasText: base.factory })
    .filter({ hasText: base.donut, hasNotText: base.packagedDonut });
  await row.getByRole('button', { name: 'Ver detalle' }).click();
  const lots = page.getByRole('table', { name: `Lotes de ${base.donutName}` });
  for (const sequence of ['01', '02', '03'])
    await expect(lots).toContainText(`${order.folio}-${sequence}`);
});
