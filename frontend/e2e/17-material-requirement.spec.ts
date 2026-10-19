import { expect, test } from '@playwright/test';
import { AdminApi, signIn } from './support/api';
import { adminCredentials } from './support/env';

/** Business date of the plant (America/Mexico_City), as the API expects it. */
function inDays(days: number): string {
  const date = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(date);
}

/**
 * F-20 (frontend §11, RN-50): a draft production order of 50,000 kg of E2E-MASA leaves E2E-HARINA "por comprar"; the
 * suggested requisition of that row is a draft with its preferred supplier. Does not move inventory; it cancels the
 * order and the requisition at the end, so they do not cover the requirement of the next runs.
 */
test('requerimiento: faltante de harina y requisición sugerida', async ({
  page,
  baseURL,
  isMobile,
}) => {
  test.skip(isMobile, 'Cada corrida crea una OP y una requisición.');
  const api = await AdminApi.create(baseURL!);
  await api.ensureCategory('E2E');
  await api.ensureItem('E2E-HARINA', 'Harina E2E', 'E2E', 'kg');
  await api.ensureItem('E2E-MASA', 'Masa E2E', 'E2E', 'kg', 'SemiFinished');
  const offer = await api.ensureSupplierOffer('E2E-HARINA');
  const masa = await api.itemId('E2E-MASA');
  const recipes = await api.get<{ items: unknown[] }>(`recipes?outputItemId=${masa}`);
  if (recipes.items.length === 0)
    await api.post('recipes', {
      factoryId: await api.factoryId(),
      outputItemId: masa,
      yieldQty: 10,
      notes: 'E2E',
      lines: [{ componentItemId: await api.itemId('E2E-HARINA'), quantity: 6, wastePct: 0 }],
    });
  const order = await api.post<{ id: string; version: number }>('production-orders', {
    locationId: await api.locationId('PLANTA'),
    outputItemId: masa,
    plannedQty: 50000,
    scheduledDate: inDays(1),
    productionAreaId: null,
    shift: null,
    notes: 'E2E requerimiento',
  });

  await signIn(page, adminCredentials());
  await page.goto('/compras/requerimiento');
  const row = page.getByRole('row').filter({ hasText: 'E2E-HARINA' });
  await expect(row).toBeVisible();
  await expect(row).toContainText(offer.supplierName);
  await row.getByRole('checkbox', { name: 'Elegir E2E-HARINA' }).check();
  await page.getByRole('button', { name: /Crear requisición sugerida \(1\)/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Crear requisición' }).click();

  // The suggested requisition is a draft with the flour and its preferred supplier.
  await expect(page.getByRole('heading', { name: /Requisición REQ-/ })).toBeVisible();
  await expect(page.locator('app-status-tag').getByText('Borrador')).toBeVisible();
  const line = page.getByRole('row').filter({ hasText: 'E2E-HARINA' });
  await expect(line).toContainText(offer.supplierName);

  // Cleanup: neither the order nor the requisition stay open.
  const requisitionId = page.url().split('/').pop()!;
  const requisition = await api.get<{ version: number }>(`requisitions/${requisitionId}`);
  await api.post(`requisitions/${requisitionId}/cancel`, { version: requisition.version });
  await api.post(`production-orders/${order.id}/cancel`, { version: order.version });
  await api.dispose();
});
