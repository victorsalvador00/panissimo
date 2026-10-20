import { expect, test } from '@playwright/test';
import { AdminApi, signIn } from './support/api';
import { base } from './support/base-data';
import { adminCredentials } from './support/env';

interface RecipeRow {
  id: string;
  recipeVersion: number;
  isActive: boolean;
  isUsed: boolean;
  version: number;
}

/** Business date of the plant (America/Mexico_City), as the API expects it. */
function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());
}

/**
 * E2E 6 (frontend §9): editing a recipe already used by a production order saves version N+1 and leaves the previous
 * one inactive. Does not move inventory. Works on the recipe of the packaged donut of the base catalogs, so each run
 * leaves one more version of it; to mark the recipe as used it creates a draft order and cancels it at once.
 */
test('receta: editar una receta usada crea la versión N+1', async ({ page, baseURL, isMobile }) => {
  test.skip(isMobile, 'Una versión nueva por corrida.');
  const product = base.packagedDonut;
  const api = await AdminApi.create(baseURL!);
  const output = await api.itemId(product);
  const recipe = (
    await api.get<{ items: RecipeRow[] }>(`recipes?outputItemId=${output}`)
  ).items.find((r) => r.isActive);
  expect(recipe, `receta activa de ${product}`).toBeTruthy();
  if (!recipe!.isUsed) {
    const order = await api.post<{ id: string; version: number }>('production-orders', {
      locationId: await api.requireLocation(base.plant),
      outputItemId: output,
      plannedQty: 20,
      scheduledDate: today(),
      shift: null,
      notes: 'E2E: marca la receta como usada',
    });
    await api.post(`production-orders/${order.id}/cancel`, { version: order.version });
  }
  await api.dispose();
  const current = recipe!.recipeVersion;

  await signIn(page, adminCredentials());
  await page.goto('/produccion/recetas');
  await page.getByLabel('Buscar por SKU o nombre del producto').fill(product);
  await page.getByRole('link', { name: product, exact: true }).click();

  await expect(
    page.getByRole('heading', { name: `Receta de ${product} · v${current}` }),
  ).toBeVisible();
  await expect(page.getByText(`creará la versión ${current + 1}`)).toBeVisible();
  const waste = page.getByLabel('Merma del componente 1');
  await waste.fill(String(current % 10));
  await page.getByRole('button', { name: `Guardar versión ${current + 1}` }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: `Crear versión ${current + 1}` })
    .click();

  await expect(
    page.getByRole('heading', { name: `Receta de ${product} · v${current + 1}` }),
  ).toBeVisible();
  await expect(page.getByText('Activa', { exact: true })).toBeVisible();

  // The previous version stays for its orders, inactive and read-only.
  await page.getByRole('link', { name: `v${current}`, exact: true }).click();
  await expect(
    page.getByRole('heading', { name: `Receta de ${product} · v${current}` }),
  ).toBeVisible();
  await expect(page.getByText('Esta versión está inactiva')).toBeVisible();
  await expect(page.getByLabel('Merma del componente 1')).toBeDisabled();
});
