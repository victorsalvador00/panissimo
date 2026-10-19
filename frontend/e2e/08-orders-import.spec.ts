import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { AdminApi, signIn } from './support/api';
import { base } from './support/base-data';
import { adminCredentials } from './support/env';

const fixture = (name: string) => join(__dirname, 'fixtures', name);

/**
 * E2E 8 (frontend §9): production orders from Excel. A file with errors shows them by row and imports nothing; a valid
 * file with a warning (an unknown column; after the first run also "already imported") needs the acknowledgement and
 * creates 2 orders from 3 rows (RN-92), in draft. Does not move inventory; each run leaves 2 draft orders of the donut
 * PT-020-DONA of the base catalogs for 30 and 31/12/2030 (fixtures from scripts/e2e-fixtures.py).
 */
test('importar OP desde Excel: errores, avisos y órdenes creadas', async ({
  page,
  baseURL,
  isMobile,
}) => {
  test.skip(isMobile, 'Cada corrida crea órdenes.');
  const api = await AdminApi.create(baseURL!);
  const donut = await api.itemId(base.donut);
  const recipes = await api.get<{ items: { isActive: boolean }[] }>(
    `recipes?outputItemId=${donut}`,
  );
  expect(
    recipes.items.some((r) => r.isActive),
    `receta activa de ${base.donut}`,
  ).toBeTruthy();
  await api.dispose();

  await signIn(page, adminCredentials());
  await page.goto('/produccion/importar');
  const fileInput = page.locator('input[type=file]');

  // Errors: shown by row and column; nothing to import.
  await fileInput.setInputFiles(fixture('ordenes-con-errores.xlsx'));
  const errors = page.getByRole('table', { name: 'Errores del archivo' });
  await expect(errors).toBeVisible();
  await expect(errors.getByRole('row')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Importar órdenes' })).toHaveCount(0);

  // Valid with warnings: 3 rows → 2 orders; importing waits for the acknowledgement.
  await page.getByRole('button', { name: 'Elegir otro archivo' }).click();
  await fileInput.setInputFiles(fixture('ordenes-validas.xlsx'));
  await expect(page.getByText('3 filas →')).toBeVisible();
  await expect(page.getByRole('table', { name: 'Órdenes a crear' }).getByRole('row')).toHaveCount(
    3,
  );
  const importButton = page.getByRole('button', { name: 'Importar órdenes' });
  await expect(importButton).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Entiendo los avisos y quiero continuar' }).check();
  await importButton.click();

  await expect(page.getByText(/Importación IMP-\d+: 2 órdenes creadas en borrador/)).toBeVisible();
  await page.getByRole('link', { name: 'Ver órdenes' }).click();
  await expect(page.getByRole('button', { name: 'Solo de una importación' })).toBeVisible();
  await expect(page.getByRole('link', { name: /^OP-/ })).toHaveCount(2);
});
