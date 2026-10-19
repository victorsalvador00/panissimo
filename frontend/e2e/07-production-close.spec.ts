import { Page, expect, test } from '@playwright/test';
import { AdminApi, signIn } from './support/api';
import { adminCredentials } from './support/env';

/** Business date of the plant (America/Mexico_City), as the API expects it. */
function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());
}

async function chooseWarehouse(page: Page, label: string, name: string): Promise<void> {
  const select = page.getByRole('combobox', { name: label });
  await select.click();
  await page.getByRole('option', { name }).click();
}

/**
 * E2E 7 (frontend §9): release → partial close at tablet width → partial close at 390 px → final close short of the
 * plan → the lots of each close in Existencias. **Moves inventory** in the database it runs against: it puts 20 kg of
 * E2E-HARINA in PLANTA-MP (correction) and produces 18 kg of E2E-MASA-L (three lots) consuming 10.8 kg.
 */
test('OP: liberar, cierres parciales y cierre final con faltante', async ({ page, baseURL, isMobile }) => {
  test.skip(isMobile, 'Recorre tableta, 390 px y escritorio en una sola corrida.');
  test.setTimeout(90_000);
  const api = await AdminApi.create(baseURL!);
  await api.ensureCategory('E2E');
  await api.ensureItem('E2E-HARINA', 'Harina E2E', 'E2E', 'kg');
  await api.ensureItem('E2E-MASA-L', 'Masa E2E con lotes', 'E2E', 'kg', 'SemiFinished', {
    tracksLots: true,
    shelfLifeDays: 3,
  });
  const masa = await api.itemId('E2E-MASA-L');
  const harina = await api.itemId('E2E-HARINA');
  const recipes = await api.get<{ items: { id: string }[] }>(`recipes?outputItemId=${masa}`);
  if (recipes.items.length === 0) {
    await api.post('recipes', {
      factoryId: await api.factoryId(),
      outputItemId: masa,
      yieldQty: 10,
      notes: 'E2E',
      lines: [{ componentItemId: harina, quantity: 6, wastePct: 0 }],
    });
  }
  await api.addStock('PLANTA-MP', 'E2E-HARINA', 20, 18);
  const plant = (await api.locationId('PLANTA'))!;
  const warehouses = await api.get<{ id: string; code: string; name: string }[]>(`locations/${plant}/warehouses`);
  const rawMaterials = warehouses.find((w) => w.code === 'PLANTA-MP')!.name;
  const semiFinished = warehouses.find((w) => w.code === 'PLANTA-SEMI')!.name;
  // RN-49: with a factory, the close consumes from it and leaves the product there.
  const factory = await api.factoryId();
  const outputCode = factory ? warehouses.find((w) => w.id === factory)!.code : 'PLANTA-SEMI';
  const order = await api.post<{ id: string; folio: string }>('production-orders', {
    locationId: plant,
    outputItemId: masa,
    plannedQty: 20,
    scheduledDate: today(),
    productionAreaId: null,
    shift: 'Day',
    notes: 'E2E 7',
  });
  await api.dispose();

  await signIn(page, adminCredentials());
  await page.goto(`/produccion/ordenes/${order.id}`);
  await page.getByRole('button', { name: 'Liberar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Liberar' }).click();
  await expect(page.locator('app-status-tag').getByText('Liberada')).toBeVisible();
  if (factory) {
    // RN-112: the ingredients reach the factory with their vouchers before producing.
    const vouchers = await AdminApi.create(baseURL!);
    await vouchers.sendIngredients(order.id);
    await vouchers.dispose();
  }

  // Partial close on the tablet: 10 kg consume the theoretical 6 kg.
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.getByRole('link', { name: 'Cierre parcial' }).click();
  await page.getByLabel('Cantidad producida en este cierre').fill('10');
  await expect(page.getByLabel('Consumo real', { exact: true })).toHaveValue('6');
  if (!factory) {
    await chooseWarehouse(page, 'Consume del subalmacén', rawMaterials);
    await chooseWarehouse(page, 'El producto entra a', semiFinished);
  }
  await page.getByRole('button', { name: 'Registrar cierre parcial' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Registrar cierre parcial' }).click();
  await expect(page).toHaveURL(new RegExp(`/produccion/ordenes/${order.id}$`));
  await expect(page.locator('app-status-tag').getByText('En proceso')).toBeVisible();

  // Second partial close at 390 px: the sub-warehouses come back from the previous close.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: 'Cierre parcial' }).click();
  await page.getByLabel('Cantidad producida en este cierre').fill('5');
  await expect(page.getByLabel('Consumo real', { exact: true })).toHaveValue('3');
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
  await page.getByLabel('Buscar por SKU o nombre').fill('E2E-MASA-L');
  const row = page.getByRole('row').filter({ hasText: outputCode }).filter({ hasText: 'E2E-MASA-L' });
  await row.getByRole('button', { name: 'Ver detalle' }).click();
  const lots = page.getByRole('table', { name: 'Lotes de Masa E2E con lotes' });
  for (const sequence of ['01', '02', '03']) await expect(lots).toContainText(`${order.folio}-${sequence}`);
});
