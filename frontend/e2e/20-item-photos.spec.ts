import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { AdminApi, signIn } from './support/api';
import { base } from './support/base-data';
import { adminCredentials } from './support/env';

const photo = readFileSync(join(__dirname, 'fixtures', 'foto-e2e.png'));

/**
 * F-23 (frontend §11): a photo uploaded from the item (900 × 600 px, resized by the browser) is seen in the item picker;
 * the bulk import matches a file named by SKU. Does not move inventory. Works on the donut and the salt of the base
 * catalogs only while they have no photo (it never replaces a real one) and removes both photos at the end.
 */
test('fotos: subir desde el artículo, verla en el selector e importar por SKU', async ({
  page,
  baseURL,
  isMobile,
}) => {
  test.skip(isMobile, 'Sube y quita fotos de artículos base.');
  const api = await AdminApi.create(baseURL!);
  const donut = await api.itemId(base.donut);
  const salt = await api.itemId(base.salt);
  const withPhoto = (await api.hasPhoto(donut)) || (await api.hasPhoto(salt));
  if (withPhoto) await api.dispose();
  test.skip(withPhoto, `${base.donut} o ${base.salt} ya tienen foto: la prueba no la reemplaza.`);

  await signIn(page, adminCredentials());
  await page.goto(`/catalogos/articulos/${donut}`);
  await page.getByRole('tab', { name: 'Foto' }).click();
  // The first file input is "Elegir foto"; the second asks for the camera.
  await page.locator('app-item-photo-editor input[type=file]').first().setInputFiles({
    name: 'dona.png',
    mimeType: 'image/png',
    buffer: photo,
  });
  await expect(page.getByText('Foto guardada.')).toBeVisible();
  const preview = page.getByRole('img', { name: `Foto de ${base.donut}` });
  await expect(preview).toBeVisible();
  // Resized to 512 px on the longer side before uploading.
  await expect
    .poll(() => preview.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]))
    .toEqual([512, 341]);

  // The picker shows it next to the item.
  await page.goto('/inventario/ajustes/nuevo');
  await page.getByLabel('Artículo').first().fill(base.donut);
  const option = page.getByRole('option', { name: new RegExp(base.donut) }).first();
  await expect(option.locator('app-item-photo img')).toBeVisible();

  // Bulk import: the file name is the SKU.
  await page.goto('/catalogos/articulos/fotos');
  await page.locator('input[type=file]').setInputFiles({
    name: `${base.salt.toLowerCase()}.png`,
    mimeType: 'image/png',
    buffer: photo,
  });
  const row = page.getByRole('row').filter({ hasText: `${base.salt.toLowerCase()}.png` });
  await expect(row).toContainText(base.salt);
  await page.getByRole('button', { name: 'Subir 1 foto' }).click();
  await expect(row).toContainText('Lista');
  await expect(page.getByText('1 foto subida.')).toBeVisible();

  // Cleanup: the base items stay without the test photo.
  await api.removePhoto(donut);
  await api.removePhoto(salt);
  await api.dispose();
});
