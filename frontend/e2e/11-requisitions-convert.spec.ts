import { expect, test } from '@playwright/test';
import { AdminApi, signIn } from './support/api';
import { adminCredentials } from './support/env';

/** Business date of the plant (America/Mexico_City), as the API expects it. */
function inDays(days: number): string {
  const date = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(date);
}

/**
 * F-14 (frontend §11, RN-34): a requisition made in the form (preferred supplier and amount), sent and approved, plus
 * another approved by API; both are selected and converted, and the generated purchase order is shown with both
 * requisitions. Does not move inventory; each run leaves 2 converted requisitions and a draft purchase order.
 */
test('convertir varias requisiciones muestra las OC generadas', async ({
  page,
  baseURL,
  isMobile,
}) => {
  test.skip(isMobile, 'Cada corrida crea requisiciones.');
  const api = await AdminApi.create(baseURL!);
  await api.ensureCategory('E2E');
  await api.ensureItem('E2E-HARINA', 'Harina E2E', 'E2E', 'kg');
  const harina = await api.itemId('E2E-HARINA');
  // A supplier that sells it (the preferred one is taken by the form).
  let offers = await api.get<{ supplierId: string }[]>(`items/${harina}/supplier-offers`);
  if (offers.length === 0) {
    const supplier = await api.post<{ id: string }>('suppliers', {
      taxId: 'EEE010101AAA',
      name: 'Proveedor E2E base',
      contactName: null,
      phone: null,
      email: null,
      paymentTermsDays: 0,
    });
    await api.post(`suppliers/${supplier.id}/items`, {
      itemId: harina,
      supplierSku: null,
      price: 18,
      leadTimeDays: 1,
      isPreferred: true,
    });
    offers = await api.get<{ supplierId: string }[]>(`items/${harina}/supplier-offers`);
  }
  const plant = await api.locationId('PLANTA');
  const viaApi = await api.post<{ id: string; folio: string; version: number }>('requisitions', {
    locationId: plant,
    neededBy: inDays(10),
    notes: 'E2E 11',
    lines: [{ itemId: harina, quantity: 4, suggestedSupplierId: offers[0].supplierId, notes: null }],
  });
  const submitted = await api.post<{ version: number }>(`requisitions/${viaApi.id}/submit`, {
    version: viaApi.version,
  });
  await api.post(`requisitions/${viaApi.id}/approve`, { version: submitted.version });
  await api.dispose();

  await signIn(page, adminCredentials());
  await page.goto('/compras/requisiciones/nueva');
  await page.getByRole('combobox', { name: 'Materia prima o insumo' }).fill('E2E-HARINA');
  await page.getByRole('option', { name: /E2E-HARINA/ }).click();
  await page.getByLabel('Cantidad de la línea 1').fill('6');
  await expect(page.getByRole('combobox', { name: 'Proveedor' })).toContainText('(preferido)');
  await expect(page.getByText('Subtotal estimado')).not.toContainText('$0.00');
  await page.getByRole('button', { name: 'Guardar borrador' }).click();

  const heading = page.getByRole('heading', { name: /Requisición REQ-/ });
  await expect(heading).toBeVisible();
  const folio = (await heading.textContent())!.replace('Requisición', '').trim();
  await page.getByRole('button', { name: 'Enviar a aprobación' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Enviar' }).click();
  await page.getByRole('button', { name: 'Aprobar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Aprobar' }).click();
  await expect(page.locator('app-status-tag').getByText('Aprobada')).toBeVisible();

  // Both approved requisitions in one conversion.
  await page.goto('/compras/requisiciones');
  for (const f of [folio, viaApi.folio]) {
    const row = page.getByRole('row').filter({ hasText: f });
    await row.getByRole('checkbox').check();
  }
  await page.getByRole('button', { name: 'Convertir a OC (2)' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Convertir (2)' }).click();

  const result = page.getByRole('table', { name: 'Órdenes de compra generadas' });
  await expect(result).toBeVisible();
  await expect(result).toContainText(folio);
  await expect(result).toContainText(viaApi.folio);
});
