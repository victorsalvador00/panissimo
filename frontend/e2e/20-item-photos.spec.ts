import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { AdminApi, signIn } from './support/api';
import { adminCredentials } from './support/env';

const photo = readFileSync(join(__dirname, 'fixtures', 'foto-e2e.png'));

/**
 * F-23 (frontend §11): a photo uploaded from the item (900 × 600 px, resized by the browser) is seen in the item picker;
 * the bulk import matches a file named by SKU. Does not move inventory; the photos stay (they only identify the items).
 */
test('fotos: subir desde el artículo, verla en el selector e importar por SKU', async ({
  page,
  baseURL,
  isMobile,
}) => {
  test.skip(isMobile, 'Reemplaza las fotos de artículos de prueba.');
  const api = await AdminApi.create(baseURL!);
  await api.ensureCategory('E2E');
  await api.ensureItem('E2E-PAN', 'Pan E2E', 'E2E', 'pza', 'FinishedGood');
  await api.ensureItem('E2E-HARINA', 'Harina E2E', 'E2E', 'kg');
  const pan = await api.itemId('E2E-PAN');
  await api.dispose();

  await signIn(page, adminCredentials());
  await page.goto(`/catalogos/articulos/${pan}`);
  await page.getByRole('tab', { name: 'Foto' }).click();
  // The first file input is "Elegir foto"; the second asks for the camera.
  await page.locator('app-item-photo-editor input[type=file]').first().setInputFiles({
    name: 'pan.png',
    mimeType: 'image/png',
    buffer: photo,
  });
  await expect(page.getByText('Foto guardada.')).toBeVisible();
  const preview = page.getByRole('img', { name: 'Foto de E2E-PAN' });
  await expect(preview).toBeVisible();
  // Resized to 512 px on the longer side before uploading.
  await expect
    .poll(() => preview.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]))
    .toEqual([512, 341]);

  // The picker shows it next to the item.
  await page.goto('/inventario/ajustes/nuevo');
  await page.getByLabel('Artículo').first().fill('E2E-PAN');
  const option = page.getByRole('option', { name: /E2E-PAN/ }).first();
  await expect(option.locator('app-item-photo img')).toBeVisible();

  // Bulk import: the file name is the SKU.
  await page.goto('/catalogos/articulos/fotos');
  await page.locator('input[type=file]').setInputFiles({
    name: 'e2e-harina.png',
    mimeType: 'image/png',
    buffer: photo,
  });
  const row = page.getByRole('row').filter({ hasText: 'e2e-harina.png' });
  await expect(row).toContainText('E2E-HARINA');
  await page.getByRole('button', { name: 'Subir 1 foto' }).click();
  await expect(row).toContainText('Lista');
  await expect(page.getByText('1 foto subida.')).toBeVisible();
});
