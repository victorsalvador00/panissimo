import { expect, test } from '@playwright/test';
import { AdminApi, signIn } from './support/api';
import { adminCredentials } from './support/env';

/**
 * F-22 (frontend §11): the recipe shows its cost per version (RN-51), and the consumption analysis (RN-52) applies a
 * suggested min/max. Does not move inventory; it restores the previous min/max of E2E-HARINA at the end.
 */
test('costos de receta y análisis de consumo', async ({ page, baseURL, isMobile }) => {
  test.skip(isMobile, 'Cambia el mín/máx de un artículo de prueba.');
  const api = await AdminApi.create(baseURL!);
  await api.ensureCategory('E2E');
  await api.ensureItem('E2E-HARINA', 'Harina E2E', 'E2E', 'kg');
  await api.ensureItem('E2E-PAN', 'Pan E2E', 'E2E', 'pza', 'FinishedGood');
  const pan = await api.itemId('E2E-PAN');
  const flour = await api.itemId('E2E-HARINA');
  const plant = (await api.locationId('PLANTA'))!;
  let recipes = await api.get<{ items: { id: string }[] }>(`recipes?outputItemId=${pan}&includeInactive=true`);
  if (recipes.items.length === 0) {
    await api.post('recipes', {
      factoryId: await api.factoryId(),
      outputItemId: pan,
      yieldQty: 10,
      notes: 'E2E',
      lines: [{ componentItemId: flour, quantity: 0.5, wastePct: 0 }],
    });
    recipes = await api.get(`recipes?outputItemId=${pan}&includeInactive=true`);
  }
  // Something leaves the plant in the analysis window: a past close of E2E-PAN's recipe or, failing that, the flour row
  // may be missing; the search then shows the empty state and the test only checks the costs.
  const settings = await api.get<{ locationId: string; minQty: number | null; maxQty: number | null }[]>(
    `items/${flour}/location-settings`,
  );
  const before = settings.find((s) => s.locationId === plant)!;

  await signIn(page, adminCredentials());
  await page.goto(`/produccion/recetas/${recipes.items[0].id}?tab=costos`);
  await expect(page.getByRole('tab', { name: 'Costos' })).toHaveAttribute('aria-selected', 'true');
  const versions = page.getByRole('heading', { name: /^Versión \d+$/ });
  await expect(versions).toHaveCount(recipes.items.length);
  await expect(page.getByText('Costo por pza').first()).toBeVisible();
  await expect(page.getByRole('table', { name: /^Costo de la versión/ }).first()).toContainText('E2E-HARINA');

  await page.goto('/inventario/analisis-consumo');
  await page.getByLabel('Buscar por SKU o artículo').fill('E2E-HARINA');
  const row = page.getByRole('row').filter({ hasText: 'E2E-HARINA' }).first();
  const empty = page.getByText(/No hubo salidas en esas semanas/);
  await expect(row.or(empty)).toBeVisible();
  if (await empty.isVisible()) {
    await api.dispose();
    return;
  }
  await row.getByRole('button', { name: 'Consumo por día de E2E-HARINA' }).click();
  await expect(page.getByRole('table', { name: /Promedio por día de la semana de E2E-HARINA/ })).toBeAttached();

  const applyButton = row.getByRole('button', { name: 'Aplicar sugerido a E2E-HARINA' });
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
