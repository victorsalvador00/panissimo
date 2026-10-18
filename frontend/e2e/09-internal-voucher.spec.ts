import { expect, test } from '@playwright/test';
import { AdminApi, signIn } from './support/api';
import { adminCredentials } from './support/env';

interface StockRow {
  locationCode: string;
  onHand: number;
}

/**
 * F-25 (frontend §11, RN-47): internal voucher from PLANTA-MP to PLANTA-PT sent at desktop width and received short
 * at 390 px; the stock of each sub-warehouse changes. **Moves inventory** in the database it runs against: it puts
 * 3 kg of E2E-HARINA in PLANTA-MP (correction), sends them and receives 2 in PLANTA-PT (1 kg transit loss).
 */
test('vale interno: enviar y recibir con faltante entre subalmacenes', async ({
  page,
  baseURL,
  isMobile,
}) => {
  test.skip(isMobile, 'Recorre escritorio y 390 px en una sola corrida.');
  const api = await AdminApi.create(baseURL!);
  await api.ensureCategory('E2E');
  await api.ensureItem('E2E-HARINA', 'Harina E2E', 'E2E', 'kg');
  await api.addStock('PLANTA-MP', 'E2E-HARINA', 3, 18);
  const plant = (await api.locationId('PLANTA'))!;
  const harina = await api.itemId('E2E-HARINA');
  const stock = async () => {
    const page = await api.get<{ items: StockRow[] }>(
      `stock?locationId=${plant}&itemId=${harina}&pageSize=50`,
    );
    const of = (code: string) => page.items.find((r) => r.locationCode === code)?.onHand ?? 0;
    return { mp: of('PLANTA-MP'), pt: of('PLANTA-PT') };
  };
  const before = await stock();
  const warehouses = await api.get<{ code: string; name: string }[]>(`locations/${plant}/warehouses`);
  const name = (code: string) => warehouses.find((w) => w.code === code)!.name;

  await signIn(page, adminCredentials());
  await page.evaluate((id) => localStorage.setItem('pan.location', id), plant);

  // Draft and send at desktop width.
  await page.goto('/inventario/vales-internos/nuevo');
  await page.getByRole('combobox', { name: 'Sale de' }).click();
  await page.getByRole('option', { name: name('PLANTA-MP') }).click();
  await page.getByRole('combobox', { name: 'Entra a' }).click();
  await page.getByRole('option', { name: name('PLANTA-PT') }).click();
  await page.getByRole('combobox', { name: 'Artículo' }).fill('E2E-HARINA');
  await page.getByRole('option', { name: /E2E-HARINA/ }).click();
  await page.getByLabel('Cantidad de la línea 1').fill('3');
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page.getByRole('heading', { name: /Vale VI-/ })).toBeVisible();
  await page.getByRole('button', { name: 'Enviar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Enviar' }).click();
  await expect(page.locator('app-status-tag').getByText('En tránsito')).toBeVisible();

  // Receipt at 390 px: 2 of 3 kg arrive.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: 'Recibir' }).click();
  const card = page.locator('article').filter({ hasText: 'E2E-HARINA' });
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
  await expect(page).toHaveURL(/\/inventario\/vales-internos\/[^/]+$/);
  await expect(page.locator('app-status-tag').getByText('Recibido con diferencias')).toBeVisible();

  // The stock of each sub-warehouse changed: -3 in MP, +2 in PT.
  const after = await stock();
  await api.dispose();
  expect(after.mp).toBeCloseTo(before.mp - 3, 4);
  expect(after.pt).toBeCloseTo(before.pt + 2, 4);
});
