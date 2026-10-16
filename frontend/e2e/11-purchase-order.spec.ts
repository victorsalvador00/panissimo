import { APIRequestContext, expect, test } from '@playwright/test';
import { itemId, locationId } from './support/production';
import { ensurePreferredSupplier } from './support/purchasing';
import {
  adminApi,
  adminCredentials,
  chooseOptions,
  expectNoHorizontalScroll,
  login,
} from './support/session';

/**
 * E2E #2 (F-13): OC en COM con HAR-001 → enviar → aprobar → recibir con lote → la existencia de
 * HAR-001 en COM aumenta. **Mueve inventario:** cada corrida suma 2 unidades de compra a COM.
 */
async function onHand(api: APIRequestContext, location: string, item: string): Promise<number> {
  const response = await api.get(`/api/v1/stock?locationId=${location}&itemId=${item}`);
  const page = (await response.json()) as { items: { onHand: number }[] };
  return page.items[0]?.onHand ?? 0;
}

let supplier: string;
let factor: number;

test.beforeAll(async ({ baseURL }) => {
  const api = await adminApi(baseURL!);
  supplier = await ensurePreferredSupplier(api, 'HAR-001');
  const flour = await itemId(api, 'HAR-001');
  const offers = await (await api.get(`/api/v1/items/${flour}/supplier-offers`)).json();
  factor = offers.purchaseToBaseFactor;
  await api.dispose();
});

test('OC → aprobar → recibir → la existencia aumenta', async ({ page, baseURL }) => {
  const api = await adminApi(baseURL!);
  const com = await locationId(api, 'COM');
  const flour = await itemId(api, 'HAR-001');
  const before = await onHand(api, com, flour);

  const admin = adminCredentials();
  await login(page, admin.email, admin.password);
  await chooseOptions(page, 'Ubicación activa', [/^COM · /]);

  // Captura: proveedor, artículo de su catálogo con precio sugerido, y enviar.
  await page.goto('/compras/ordenes/nueva');
  await page.getByRole('combobox', { name: 'Proveedor' }).fill(supplier);
  await page.getByRole('option', { name: new RegExp(`^${supplier}`) }).click();
  await page.getByRole('combobox', { name: 'Artículo' }).fill('HAR-001');
  await page.getByRole('option', { name: /^HAR-001 · / }).click();
  await expect(page.getByLabel('Precio', { exact: true })).not.toHaveValue('');
  await page.getByLabel('Cantidad', { exact: true }).fill('2');
  await expect(page.getByLabel('Totales')).toContainText('Total');
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Guardar y enviar' }).click();

  const heading = page.getByRole('heading', { name: /^Orden de compra OC-\d+$/ });
  await expect(heading).toBeVisible();
  const folio = (await heading.textContent())!.replace('Orden de compra', '').trim();
  const status = page.locator('app-page-header app-status-tag');
  await expect(status).toHaveText('Por aprobar');

  // Aprobar (el administrador tiene purchasing.po.approve).
  await page.getByRole('button', { name: 'Aprobar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Aprobar' }).click();
  await expect(status).toHaveText('Aprobada');

  // Recibir con lote: prellenado con lo pendiente.
  await page.getByRole('link', { name: 'Recibir' }).click();
  await expect(page.getByRole('heading', { name: `Recibir ${folio}` })).toBeVisible();
  await expect(page.getByLabel('Recibido de HAR-001')).toHaveValue('2');
  const lot = `E2E-OC-${Date.now().toString(36).toUpperCase()}`;
  await page.getByLabel('Lote', { exact: true }).fill(lot);
  await page.getByLabel('Factura del proveedor').fill('F-E2E-1');
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Registrar recepción' }).click();
  const confirm = page.getByRole('dialog');
  await expect(confirm.getByText(`¿Registrar la recepción de ${folio}?`)).toBeVisible();
  await expect(confirm.getByText(lot)).toBeVisible();
  await confirm.getByRole('button', { name: 'Registrar recepción' }).click();

  await expect(page.getByRole('heading', { name: /^Recepción REC-\d+$/ })).toBeVisible();
  await expect(page.locator('app-status-tag')).toHaveText('Recibida');
  await expect(page.getByText(`Lote ${lot}`)).toBeVisible();
  await expectNoHorizontalScroll(page);

  // La existencia de HAR-001 en COM aumentó 2 unidades de compra.
  await expect.poll(() => onHand(api, com, flour)).toBe(before + 2 * factor);
  await page.goto('/inventario/existencias');
  await page.getByLabel('Buscar por SKU o nombre').fill('HAR-001');
  await page.locator('app-data-table').getByText('HAR-001').first().click();
  await expect(page.getByText(lot).first()).toBeVisible();
  await api.dispose();
});
