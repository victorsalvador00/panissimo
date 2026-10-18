import { Locator, Page, test } from '@playwright/test';
import { join } from 'node:path';
import { AdminApi, signIn } from '../e2e/support/api';
import { adminCredentials } from '../e2e/support/env';

/**
 * Help videos of the capture screens (frontend §4.3). Each scene shows the usual capture slowly and **stops before
 * confirming**: nothing is posted. The count is cancelled and the production order is cancelled at the end.
 */

const output = (name: string) => join(__dirname, '..', 'public', 'help', name);

/** Types like a person, so the video can be followed (focus, not click: the video only needs the typing). */
async function type(field: Locator, text: string): Promise<void> {
  await field.focus();
  await field.pressSequentially(text, { delay: 110 });
}

const pause = (page: Page, ms = 900) => page.waitForTimeout(ms);

/** Closes the page and keeps its video under `public/help/`. */
async function save(page: Page, name: string): Promise<void> {
  const video = page.video();
  await page.close();
  await video?.saveAs(output(name));
}

function inDays(days: number): string {
  const date = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(date);
}

test('ajuste', async ({ page, baseURL }) => {
  const api = await AdminApi.create(baseURL!);
  await api.ensureCategory('E2E');
  await api.ensureItem('E2E-HARINA', 'Harina E2E', 'E2E', 'kg');
  await api.dispose();
  await signIn(page, adminCredentials());
  await page.goto('/inventario/ajustes/nuevo');
  await pause(page);
  const warehouse = page.getByRole('combobox', { name: 'Subalmacén' });
  if (await warehouse.isVisible()) {
    await warehouse.click();
    await pause(page, 500);
    await page.getByRole('option').first().click();
  }
  await page.getByRole('combobox', { name: 'Motivo' }).click();
  await pause(page, 500);
  await page.getByRole('option', { name: 'Merma', exact: true }).click();
  await type(page.getByRole('combobox', { name: 'Artículo' }), 'E2E-HAR');
  await pause(page, 700);
  await page.getByRole('option', { name: /E2E-HARINA/ }).click();
  await type(page.getByLabel('Cantidad de la línea 1'), '2');
  await pause(page);
  await page.getByRole('button', { name: 'Registrar ajuste' }).click();
  await pause(page, 2000);
  // The summary is shown, but nothing is posted.
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
  await pause(page);
  await save(page, 'ajuste.webm');
});

test('consumo', async ({ page, baseURL }) => {
  const api = await AdminApi.create(baseURL!);
  await api.ensureCategory('E2E');
  await api.ensureItem('E2E-INSUMO', 'Insumo E2E', 'E2E', 'pza', 'Supply');
  const branch = await api.ensureBranch('SUC-E2E', 'Sucursal E2E');
  await api.dispose();
  await signIn(page, adminCredentials());
  await page.evaluate((id) => localStorage.setItem('pan.location', id), branch);
  await page.goto('/inventario/consumos/nuevo');
  await pause(page);
  const item = page.getByRole('combobox', { name: 'Artículo' });
  const quantity = page.getByLabel('Cantidad', { exact: true });
  for (const qty of ['3', '2']) {
    await type(item, 'E2E-INS');
    await pause(page, 700);
    await page.getByRole('option', { name: /E2E-INSUMO/ }).click();
    await type(quantity, qty);
    await quantity.press('Enter');
    await pause(page);
  }
  await pause(page, 2000);
  await save(page, 'consumo.webm');
});

test('pedido de sucursal', async ({ page, baseURL }) => {
  const api = await AdminApi.create(baseURL!);
  await api.ensureCategory('E2E');
  await api.ensureItem('E2E-INSUMO', 'Insumo E2E', 'E2E', 'pza', 'Supply');
  const branch = await api.ensureBranch('SUC-E2E', 'Sucursal E2E');
  await api.dispose();
  await signIn(page, adminCredentials());
  await page.evaluate((id) => localStorage.setItem('pan.location', id), branch);
  await page.goto('/logistica/pedidos/nuevo');
  await pause(page);
  await type(page.getByRole('combobox', { name: 'Producto o insumo' }), 'E2E-INS');
  await pause(page, 700);
  await page.getByRole('option', { name: /E2E-INSUMO/ }).click();
  await type(page.getByLabel('Cantidad de la línea 1'), '6');
  await pause(page, 1500);
  const suggest = page.getByRole('button', { name: 'Sugerir por mín/máx' });
  if (await suggest.isVisible()) {
    await suggest.click();
    await pause(page, 2000);
  }
  await save(page, 'pedido-sucursal.webm');
});

test('conteo', async ({ page, baseURL }) => {
  const api = await AdminApi.create(baseURL!);
  await api.ensureCategory('E2E');
  const warehouse = await api.locationId('PLANTA-PT');
  if (warehouse) await api.cancelOpenCounts(warehouse);
  await api.dispose();
  await signIn(page, adminCredentials());
  await page.goto('/inventario/conteos');
  await page.getByRole('button', { name: 'Nuevo conteo' }).click();
  const dialog = page.getByRole('dialog');
  const subwarehouse = dialog.getByRole('combobox', { name: 'Subalmacén' });
  if (await subwarehouse.isVisible()) {
    await subwarehouse.click();
    await page.getByRole('option', { name: 'Producto terminado' }).click();
  }
  await dialog.getByRole('combobox', { name: 'Categoría (opcional)' }).click();
  await page.getByRole('option', { name: 'E2E', exact: true }).click();
  await dialog.getByRole('button', { name: 'Crear conteo' }).click();
  await page.getByRole('button', { name: 'Iniciar conteo' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Iniciar conteo' }).click();
  await pause(page);
  const inputs = page.locator('input.pan-qty-input');
  const count = Math.min(3, await inputs.count());
  for (let i = 0; i < count; i++) {
    await type(inputs.nth(i), String(4 + i * 3));
    await pause(page, 800);
  }
  await pause(page, 1500);
  await save(page, 'conteo.webm');

  // Nothing stays open: the count is cancelled.
  const cleanup = await AdminApi.create(baseURL!);
  if (warehouse) await cleanup.cancelOpenCounts(warehouse);
  await cleanup.dispose();
});

test('cierre de producción', async ({ page, baseURL }) => {
  const api = await AdminApi.create(baseURL!);
  await api.ensureCategory('E2E');
  await api.ensureItem('E2E-HARINA', 'Harina E2E', 'E2E', 'kg');
  await api.ensureItem('E2E-MASA', 'Masa E2E', 'E2E', 'kg', 'SemiFinished');
  const masa = await api.itemId('E2E-MASA');
  const order = await api.post<{ id: string; version: number }>('production-orders', {
    locationId: await api.locationId('PLANTA'),
    outputItemId: masa,
    plannedQty: 20,
    scheduledDate: inDays(0),
    productionAreaId: null,
    shift: 'Day',
    notes: 'Video de ayuda',
  });
  const released = await api.post<{ version: number }>(`production-orders/${order.id}/release`, {
    version: order.version,
  });
  await signIn(page, adminCredentials());
  await page.goto(`/produccion/ordenes/${order.id}/cerrar`);
  await pause(page, 1200);
  await type(page.getByLabel('Cantidad producida en este cierre'), '10');
  await pause(page, 2000);
  const actual = page.getByLabel('Consumo real', { exact: true }).first();
  // The consumption cards are below the quantity: bring them into the video.
  await page.getByRole('heading', { name: 'Consumo real por componente' }).scrollIntoViewIfNeeded();
  await pause(page, 1200);
  await actual.fill('');
  await type(actual, '6.5');
  await pause(page, 2500);
  await save(page, 'cierre.webm');

  // The order is cancelled: it had no closes.
  await api.post(`production-orders/${order.id}/cancel`, { version: released.version });
  await api.dispose();
});

/**
 * Result screen of the traceability (trazabilidad §6.4): it only reads. It needs a chain with lots in the database
 * (E2E 24 leaves one: the E2E-TZ-HARINA lots); without it the scene is skipped.
 */
test('trazabilidad', async ({ page, baseURL }) => {
  const api = await AdminApi.create(baseURL!);
  const sources = await api.get<{ type: string; label: string }[]>(
    'traceability/sources/lookup?q=TZ-',
  );
  await api.dispose();
  const lot = sources.find((s) => s.type === 'Lot' && s.label.includes('-A'));
  test.skip(!lot, 'Sin lotes de E2E-TZ-HARINA: corre antes la E2E 24.');
  await signIn(page, adminCredentials());
  await page.goto('/inventario/trazabilidad');
  await pause(page);
  await type(
    page.getByRole('combobox', { name: 'Lote, OC, OP, traspaso o remisión' }),
    lot!.label.split(' ')[0],
  );
  await pause(page, 700);
  await page.getByRole('option').first().click();
  await pause(page, 600);
  await page.getByRole('button', { name: 'Rastrear' }).click();
  await pause(page, 1500);
  // Select the lot: its chain is highlighted and its ficha opens beside the card.
  await page.locator('app-trace-card').first().getByRole('button').click();
  await pause(page, 2500);
  await page.locator('app-trace-graph .controls').getByRole('radio', { name: 'Destino' }).click();
  await pause(page, 2000);
  await page.keyboard.press('Escape');
  await pause(page, 800);
  await page.getByRole('tab', { name: 'Resumen' }).click();
  await pause(page, 2500);
  await page.getByRole('tab', { name: 'Bitácora' }).click();
  await pause(page, 2500);
  await save(page, 'trazabilidad.webm');
});
