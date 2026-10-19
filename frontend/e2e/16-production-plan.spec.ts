import { expect, test } from '@playwright/test';
import { AdminApi, signIn } from './support/api';
import { base } from './support/base-data';
import { adminCredentials } from './support/env';

/** Business date of the plant (America/Mexico_City), as the API expects it. */
function inDays(days: number): string {
  const date = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(date);
}

/** More than any stock or open order of the donut: the plan always has something to produce for tomorrow. */
const requested = 100000;

/**
 * E2E 12 (frontend §9, RN-70, RN-71): a branch order of SUC-001 sent for tomorrow makes the donut appear "por
 * producir" in the plan; generating its order links it to the order line. Does not move inventory: it cancels the
 * generated order and the branch order at the end, so they do not stay as demand of the plan.
 */
test('plan: pedido enviado, sugerido y OP ligada', async ({ page, baseURL, isMobile }) => {
  test.skip(isMobile, 'Cada corrida genera una OP.');
  const api = await AdminApi.create(baseURL!);
  const donut = await api.itemId(base.donut);
  const branch = await api.requireLocation(base.branch);
  const tomorrow = inDays(1);
  const order = await api.post<{ id: string; folio: string; version: number }>('branch-orders', {
    requestingLocationId: branch,
    requiredDate: tomorrow,
    notes: 'E2E 12',
    lines: [{ itemId: donut, requestedQty: requested }],
  });
  await api.post(`branch-orders/${order.id}/submit`, { version: order.version });

  let generatedId: string | null = null;
  try {
    await signIn(page, adminCredentials());
    await page.goto('/produccion/plan');
    await page.getByLabel('Buscar por SKU o producto').fill(base.donut);
    // The plan goes by date and the default range is today and tomorrow: the order for tomorrow is in the last row of the
    // donut (the packaged one has its own rows).
    const row = page
      .getByRole('row')
      .filter({ hasText: base.donut, hasNotText: base.packagedDonut })
      .filter({ has: page.getByRole('checkbox') })
      .last();
    await expect(row).toBeVisible();

    // The order that originates the demand.
    await row.getByRole('button', { name: `Pedidos de ${base.donut}` }).click();
    await expect(page.getByRole('link', { name: order.folio })).toBeVisible();

    await row.getByRole('checkbox', { name: `Elegir ${base.donut}` }).check();
    const quantity = row.getByLabel(`Cantidad a producir de ${base.donut}`);
    await expect(quantity).not.toHaveValue('');
    // The order links the lines its quantity covers in required-date order: enough for every order of that day.
    await quantity.fill(String(requested * 10));
    await page.getByRole('button', { name: 'Generar OP (1)' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Generar' }).click();

    const result = page.getByRole('status').filter({ hasText: 'Orden generada en borrador' });
    await expect(result).toBeVisible();
    await result.getByRole('link', { name: /^OP-/ }).click();
    await expect(page).toHaveURL(/\/produccion\/ordenes\/[0-9a-f-]+$/);
    generatedId = page.url().split('/').pop()!;

    // The order attends the branch order line.
    await expect(page.getByRole('heading', { name: /Orden OP-/ })).toBeVisible();
    await page.getByRole('tab', { name: /Pedidos/ }).click();
    await expect(page.getByRole('link', { name: order.folio })).toBeVisible();
  } finally {
    // Cleanup, also when the test fails: neither the generated order nor the branch order stay as demand.
    if (generatedId) await api.cancelQuietly(`production-orders/${generatedId}`);
    await api.cancelQuietly(`branch-orders/${order.id}`);
    await api.dispose();
  }
});
