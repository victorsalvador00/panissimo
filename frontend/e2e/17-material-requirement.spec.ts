import { expect, test } from '@playwright/test';
import { AdminApi, signIn } from './support/api';
import { base } from './support/base-data';
import { adminCredentials } from './support/env';

/** Business date of the plant (America/Mexico_City), as the API expects it. */
function inDays(days: number): string {
  const date = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(date);
}

/**
 * F-20 (frontend §11, RN-50): a draft production order of 10,000,000 donuts (500,000 kg of flour, more than any stock)
 * leaves MP-001 "por comprar" (none of its offers is preferred: "Sin proveedor preferido"); the suggested requisition
 * of that row is a draft with the flour. Does
 * not move inventory; it cancels the order and the requisition at the end, so they do not stay open.
 */
test('requerimiento: faltante de harina y requisición sugerida', async ({
  page,
  baseURL,
  isMobile,
}) => {
  test.skip(isMobile, 'Cada corrida crea una OP y una requisición.');
  const api = await AdminApi.create(baseURL!);
  const donut = await api.itemId(base.donut);
  const order = await api.post<{ id: string; version: number }>('production-orders', {
    locationId: await api.requireLocation(base.plant),
    outputItemId: donut,
    plannedQty: 10000000,
    scheduledDate: inDays(1),
    shift: null,
    notes: 'E2E requerimiento',
  });

  let requisitionId: string | null = null;
  try {
    await signIn(page, adminCredentials());
    await page.goto('/compras/requerimiento');
    const row = page.getByRole('row').filter({ hasText: base.flour });
    await expect(row).toBeVisible();
    await expect(row).toContainText('Sin proveedor preferido');
    await row.getByRole('checkbox', { name: `Elegir ${base.flour}` }).check();
    await page.getByRole('button', { name: /Crear requisición sugerida \(1\)/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Crear requisición' }).click();

    // The suggested requisition is a draft with the flour.
    await expect(page.getByRole('heading', { name: /Requisición REQ-/ })).toBeVisible();
    requisitionId = page.url().split('/').pop()!;
    await expect(page.locator('app-status-tag').getByText('Borrador')).toBeVisible();
    const line = page.getByRole('row').filter({ hasText: base.flour });
    await expect(line).toBeVisible();
  } finally {
    // Cleanup, also when the test fails: neither the order nor the requisition stay open.
    if (requisitionId) await api.cancelQuietly(`requisitions/${requisitionId}`);
    await api.cancelQuietly(`production-orders/${order.id}`);
    await api.dispose();
  }
});
