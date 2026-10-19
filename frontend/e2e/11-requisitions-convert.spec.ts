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
 * F-14 (frontend §11, RN-34): a requisition of flour made in the form (suggested supplier and amount), sent and approved, plus
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
  const flour = await api.itemId(base.flour);
  // The supplier of the base catalogs that sells it (the form takes the preferred one, or the first).
  const offer = await api.supplierOffer(base.flour);
  const plant = await api.requireLocation(base.plant);
  const viaApi = await api.post<{ id: string; folio: string; version: number }>('requisitions', {
    locationId: plant,
    neededBy: inDays(10),
    notes: 'E2E 11',
    lines: [{ itemId: flour, quantity: 4, suggestedSupplierId: offer.supplierId, notes: null }],
  });
  const submitted = await api.post<{ version: number }>(`requisitions/${viaApi.id}/submit`, {
    version: viaApi.version,
  });
  await api.post(`requisitions/${viaApi.id}/approve`, { version: submitted.version });
  await api.dispose();

  await signIn(page, adminCredentials());
  await page.goto('/compras/requisiciones/nueva');
  await page.getByRole('combobox', { name: 'Materia prima o insumo' }).fill(base.flour);
  await page.getByRole('option', { name: new RegExp(base.flour) }).click();
  await page.getByLabel('Cantidad de la línea 1').fill('6');
  await expect(page.getByRole('combobox', { name: 'Proveedor' })).toContainText(offer.supplierName);
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
