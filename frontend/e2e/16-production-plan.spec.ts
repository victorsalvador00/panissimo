import { expect, test } from '@playwright/test';
import { AdminApi, signIn } from './support/api';
import { adminCredentials } from './support/env';

/** Business date of the plant (America/Mexico_City), as the API expects it. */
function inDays(days: number): string {
  const date = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(date);
}

/**
 * E2E 12 (frontend §9, RN-70, RN-71): a branch order sent for tomorrow makes E2E-PAN appear "por producir" in the
 * plan; generating its order links it to the order line. Does not move inventory; each run leaves a sent branch
 * order of SUC-E2E and a draft production order of E2E-PAN; it cancels the drafts of E2E-PAN of earlier runs first
 * (the recipe is created the first time).
 */
test('plan: pedido enviado, sugerido y OP ligada', async ({ page, baseURL, isMobile }) => {
  test.skip(isMobile, 'Cada corrida genera una OP.');
  const api = await AdminApi.create(baseURL!);
  await api.ensureCategory('E2E');
  await api.ensureItem('E2E-HARINA', 'Harina E2E', 'E2E', 'kg');
  await api.ensureItem('E2E-PAN', 'Pan E2E', 'E2E', 'pza', 'FinishedGood');
  const pan = await api.itemId('E2E-PAN');
  const recipes = await api.get<{ items: unknown[] }>(`recipes?outputItemId=${pan}`);
  if (recipes.items.length === 0)
    await api.post('recipes', {
      outputItemId: pan,
      yieldQty: 10,
      notes: 'E2E',
      lines: [{ componentItemId: await api.itemId('E2E-HARINA'), quantity: 0.5, wastePct: 0 }],
    });
  // Draft orders of E2E-PAN left by other runs would cover the demand: they are cancelled first.
  const drafts = await api.get<{ items: { id: string }[] }>(
    `production-orders?outputItemId=${pan}&status=Draft&pageSize=100`,
  );
  for (const draft of drafts.items) {
    const { version } = await api.get<{ version: number }>(`production-orders/${draft.id}`);
    await api.post(`production-orders/${draft.id}/cancel`, { version });
  }
  const branch = await api.ensureBranch('SUC-E2E', 'Sucursal E2E');
  const tomorrow = inDays(1);
  const order = await api.post<{ id: string; folio: string; version: number }>('branch-orders', {
    requestingLocationId: branch,
    requiredDate: tomorrow,
    notes: 'E2E 12',
    lines: [{ itemId: pan, requestedQty: 40 }],
  });
  await api.post(`branch-orders/${order.id}/submit`, { version: order.version });
  await api.dispose();

  await signIn(page, adminCredentials());
  await page.goto('/produccion/plan');
  await page.getByLabel('Buscar por SKU o producto').fill('E2E-PAN');
  const row = page
    .getByRole('row')
    .filter({ hasText: 'E2E-PAN' })
    .filter({ has: page.getByRole('checkbox') })
    .first();
  await expect(row).toBeVisible();

  // The order that originates the demand.
  await row.getByRole('button', { name: 'Pedidos de E2E-PAN' }).click();
  await expect(page.getByRole('link', { name: order.folio })).toBeVisible();

  await row.getByRole('checkbox', { name: 'Elegir E2E-PAN' }).check();
  const quantity = row.getByLabel('Cantidad a producir de E2E-PAN');
  await expect(quantity).not.toHaveValue('');
  // The order links the lines its quantity covers in required-date order; other runs leave E2E-PAN orders for the
  // same day, so it covers them all.
  await quantity.fill('1000');
  await page.getByRole('button', { name: 'Generar OP (1)' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Generar' }).click();

  const result = page.getByRole('status').filter({ hasText: 'Orden generada en borrador' });
  await expect(result).toBeVisible();
  await result.getByRole('link', { name: /^OP-/ }).click();

  // The order attends the branch order line.
  await expect(page.getByRole('heading', { name: /Orden OP-/ })).toBeVisible();
  await page.getByRole('tab', { name: /Pedidos/ }).click();
  await expect(page.getByRole('link', { name: order.folio })).toBeVisible();
});
