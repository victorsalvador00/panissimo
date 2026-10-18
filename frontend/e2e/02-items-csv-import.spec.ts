import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { AdminApi, signIn } from './support/api';
import { adminCredentials } from './support/env';

const fixture = (name: string) => join(__dirname, 'fixtures', name);

/**
 * E2E 2 (frontend §9): item CSV import with errors, then a valid file with a bulk item and its linked packaged
 * version. Does not move inventory. Creates the category "E2E" if missing; the valid file creates the items
 * E2E-GRANEL and E2E-PAQ the first time and updates them afterwards (same SKUs), so it can run again.
 */
test.describe('Importación CSV de artículos', () => {
  test.beforeEach(async ({ baseURL }) => {
    const api = await AdminApi.create(baseURL!);
    await api.ensureCategory('E2E');
    await api.dispose();
  });

  test('un archivo con errores no guarda nada y muestra los errores por fila', async ({ page, baseURL }) => {
    await signIn(page, adminCredentials());
    await page.goto('/catalogos/articulos/importar');

    await page.locator('input[type="file"]').setInputFiles(fixture('articulos-con-errores.csv'));
    await expect(page.getByRole('status').filter({ hasText: '4 filas en el archivo' })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Vista previa del archivo' })).toContainText('E2E-MALO-1');

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

  test('un archivo válido da de alta el granel y su empaquetado ligado', async ({ page }) => {
    await signIn(page, adminCredentials());
    await page.goto('/catalogos/articulos/importar');

    await page.locator('input[type="file"]').setInputFiles(fixture('articulos-validos.csv'));
    await page.getByRole('button', { name: 'Importar' }).click();
    const result = page.getByRole('status').filter({ hasText: 'Importación terminada' });
    await expect(result).toBeVisible();
    // First run creates both; the next ones update them (same SKUs).
    await expect(result).toContainText(/(2 artículos creados y 0 actualizados|0 artículos creados y 2 actualizados)/);

    await page.goto('/catalogos/articulos');
    await page.getByLabel('Buscar por SKU o nombre').fill('E2E-GRANEL');
    await page.getByRole('link', { name: 'E2E-GRANEL' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('E2E-GRANEL · Concha E2E a granel');

    await page.getByRole('tab', { name: 'Versiones empaquetadas' }).click();
    const versions = page.getByRole('table', { name: 'Versiones empaquetadas' });
    const versionCards = page.getByRole('list', { name: 'Versiones empaquetadas' });
    await expect(versions.or(versionCards)).toContainText('E2E-PAQ');
  });
});
