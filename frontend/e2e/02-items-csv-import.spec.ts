import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { AdminApi, signIn } from './support/api';
import { adminCredentials } from './support/env';

const fixture = (name: string) => join(__dirname, 'fixtures', name);

/**
 * E2E 2 (frontend §9): item CSV import with errors. Saves nothing (all or nothing), so the base catalogs stay as they
 * are; the import of a valid file is not tested end to end because it would add items to them.
 */
test.describe('Importación CSV de artículos', () => {
  test('un archivo con errores no guarda nada y muestra los errores por fila', async ({
    page,
    baseURL,
  }) => {
    await signIn(page, adminCredentials());
    await page.goto('/catalogos/articulos/importar');

    await page.locator('input[type="file"]').setInputFiles(fixture('articulos-con-errores.csv'));
    await expect(
      page.getByRole('status').filter({ hasText: '4 filas en el archivo' }),
    ).toBeVisible();
    await expect(page.getByRole('table', { name: 'Vista previa del archivo' })).toContainText(
      'E2E-MALO-1',
    );

    await page.getByRole('button', { name: 'Importar' }).click();
    const errors = page.getByRole('alert').filter({ hasText: 'El archivo tiene' });
    await expect(errors).toContainText('No se guardó nada');
    await expect(errors).toContainText("Tipo 'pastel' no válido");
    await expect(errors).toContainText("La categoría 'No Existe' no existe");
    await expect(errors).toContainText('Solo los productos terminados tienen presentación');

    const api = await AdminApi.create(baseURL!);
    const found = await api.get<{ items: unknown[] }>('items?q=E2E-MALO&includeInactive=true');
    await api.dispose();
    expect(found.items).toHaveLength(0);
  });
});
