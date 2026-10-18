import { expect, test } from '@playwright/test';
import { AdminApi, signIn } from './support/api';
import { adminCredentials } from './support/env';

interface StockRow {
  locationCode: string;
  onHand: number;
}

/**
 * E2E 9 (frontend §9): purchase order → approve → receive at 390 px → the stock grows. **Moves inventory** in the
 * database it runs against: it receives 5 kg of E2E-HARINA in PLANTA-MP per run (and leaves a received order).
 */
test('compra: OC, aprobar, recibir y la existencia aumenta', async ({ page, baseURL, isMobile }) => {
  test.skip(isMobile, 'Recorre escritorio y 390 px en una sola corrida.');
  const api = await AdminApi.create(baseURL!);
  await api.ensureCategory('E2E');
  await api.ensureItem('E2E-HARINA', 'Harina E2E', 'E2E', 'kg');
  const offer = await api.ensureSupplierOffer('E2E-HARINA');
  const plant = (await api.locationId('PLANTA'))!;
  const harina = await api.itemId('E2E-HARINA');
  const stockInMp = async () => {
    const rows = await api.get<{ items: StockRow[] }>(
      `stock?locationId=${plant}&itemId=${harina}&pageSize=50`,
    );
    return rows.items.find((r) => r.locationCode === 'PLANTA-MP')?.onHand ?? 0;
  };
  const before = await stockInMp();
  const warehouses = await api.get<{ code: string; name: string }[]>(`locations/${plant}/warehouses`);
  const rawMaterials = warehouses.find((w) => w.code === 'PLANTA-MP')?.name;

  await signIn(page, adminCredentials());
  await page.evaluate((id) => localStorage.setItem('pan.location', id), plant);

  // Purchase order with the catalog price and live totals.
  await page.goto('/compras/ordenes/nueva');
  await page.getByRole('combobox', { name: 'Proveedor' }).fill(offer.supplierName);
  await page.getByRole('option', { name: new RegExp(offer.supplierName) }).first().click();
  await page.getByRole('combobox', { name: 'Artículo del catálogo' }).click();
  await page.getByRole('option', { name: /E2E-HARINA/ }).click();
  await page.getByLabel('Cantidad de la línea 1').fill('5');
  await expect(page.getByText('Total', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page.getByRole('heading', { name: /Orden de compra OC-/ })).toBeVisible();

  // Send; with the approval threshold it waits for approval (RN-31).
  await page.getByRole('button', { name: 'Enviar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Enviar' }).click();
  const status = page.locator('app-status-tag');
  await expect(status.getByText(/Por aprobar|Aprobada/)).toBeVisible();
  if (await status.getByText('Por aprobar').isVisible()) {
    await page.getByRole('button', { name: 'Aprobar' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Aprobar' }).click();
  }
  await expect(page.locator('app-status-tag').getByText('Aprobada')).toBeVisible();

  // Receipt at 390 px, filled with what is pending.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: 'Recibir' }).click();
  const card = page.locator('article').filter({ hasText: 'E2E-HARINA' });
  await expect(card.getByLabel('Recibido')).toHaveValue('5');
  if (rawMaterials) {
    const warehouse = page.getByRole('combobox', { name: 'Entra al subalmacén' });
    if ((await warehouse.textContent())?.includes(rawMaterials) !== true) {
      await warehouse.click();
      await page.getByRole('option', { name: rawMaterials }).click();
    }
  }
  await page.getByLabel('Factura del proveedor').fill('f-e2e-9');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'scroll horizontal en px').toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: 'Registrar recepción' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Registrar' }).click();
  await expect(page.getByRole('heading', { name: /Recepción / })).toBeVisible();
  await expect(page.getByText('F-E2E-9')).toBeVisible();
  await expect(page.locator('app-status-tag').getByText('Recibida')).toBeVisible();

  // The stock of the raw materials sub-warehouse grew by what was received.
  const after = await stockInMp();
  await api.dispose();
  expect(after).toBeCloseTo(before + 5, 4);
});
