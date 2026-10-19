import { expect, test } from '@playwright/test';
import { AdminApi, signIn } from './support/api';
import { base } from './support/base-data';
import { adminCredentials } from './support/env';

/**
 * F-22 (frontend §11): the recipe shows its cost per version (RN-51), and the consumption analysis (RN-52) applies a
 * suggested min/max. Does not move inventory; it works on the donut recipe and the flour of the base catalogs and
 * restores the previous min/max of the flour at the end.
 */
test('costos de receta y análisis de consumo', async ({ page, baseURL, isMobile }) => {
  test.skip(isMobile, 'Cambia el mín/máx de la harina y lo restaura.');
  const api = await AdminApi.create(baseURL!);
  const donut = await api.itemId(base.donut);
  const flour = await api.itemId(base.flour);
  const plant = await api.requireLocation(base.plant);
  const recipes = await api.get<{ items: { id: string }[] }>(
    `recipes?outputItemId=${donut}&includeInactive=true`,
  );
  expect(recipes.items.length, `recetas de ${base.donut}`).toBeGreaterThan(0);
  // Something leaves the plant in the analysis window: a past close of the donut or, failing that, the flour row
  // may be missing; the search then shows the empty state and the test only checks the costs.
  const settings = await api.get<
    { locationId: string; minQty: number | null; maxQty: number | null }[]
  >(`items/${flour}/location-settings`);
  const before = settings.find((s) => s.locationId === plant)!;

  await signIn(page, adminCredentials());
  await page.goto(`/produccion/recetas/${recipes.items[0].id}?tab=costos`);
  await expect(page.getByRole('tab', { name: 'Costos' })).toHaveAttribute('aria-selected', 'true');
  const versions = page.getByRole('heading', { name: /^Versión \d+$/ });
  await expect(versions).toHaveCount(recipes.items.length);
  await expect(page.getByText('Costo por pza').first()).toBeVisible();
  await expect(page.getByRole('table', { name: /^Costo de la versión/ }).first()).toContainText(
    base.flour,
  );

  await page.goto('/inventario/analisis-consumo');
  await page.getByLabel('Buscar por SKU o artículo').fill(base.flour);
  const row = page.getByRole('row').filter({ hasText: base.flour }).first();
  const empty = page.getByText(/No hubo salidas en esas semanas/);
  await expect(row.or(empty)).toBeVisible();
  if (await empty.isVisible()) {
    await api.dispose();
    return;
  }
  await row.getByRole('button', { name: `Consumo por día de ${base.flour}` }).click();
  await expect(
    page.getByRole('table', { name: new RegExp(`Promedio por día de la semana de ${base.flour}`) }),
  ).toBeAttached();

  const applyButton = row.getByRole('button', { name: `Aplicar sugerido a ${base.flour}` });
  if (await applyButton.count()) {
    await applyButton.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Aplicar' }).click();
    await expect(row.getByText('Aplicado')).toBeVisible();
  }

  // Restore what the plant had.
  await api.put(`items/${flour}/location-settings`, {
    settings: [{ locationId: plant, minQty: before.minQty, maxQty: before.maxQty }],
  });
  await api.dispose();
});
