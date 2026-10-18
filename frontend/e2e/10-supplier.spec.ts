import { expect, test } from '@playwright/test';
import { AdminApi, signIn } from './support/api';
import { adminCredentials } from './support/env';

/** A valid company RFC that does not repeat between runs: EEE + YYMMDD + 3 random characters (RN-35). */
function uniqueRfc(): string {
  const date = new Date();
  const yymmdd = [date.getFullYear() % 100, date.getMonth() + 1, date.getDate()]
    .map((n) => String(n).padStart(2, '0'))
    .join('');
  const homoclave = Math.random().toString(36).slice(2, 5).toUpperCase().padEnd(3, '0');
  return `EEE${yymmdd}${homoclave}`;
}

/**
 * F-13 (frontend §11): a supplier with its RFC and a preferred price. Does not move inventory; each run leaves a
 * supplier "Proveedor E2E …" that sells E2E-HARINA as preferred (it takes the preference from the previous one).
 */
test('alta de proveedor con RFC y precio preferido', async ({ page, baseURL, isMobile }) => {
  test.skip(isMobile, 'Cada corrida crea un proveedor.');
  const api = await AdminApi.create(baseURL!);
  await api.ensureCategory('E2E');
  await api.ensureItem('E2E-HARINA', 'Harina E2E', 'E2E', 'kg');
  await api.dispose();
  const rfc = uniqueRfc();

  await signIn(page, adminCredentials());
  await page.goto('/compras/proveedores/nuevo');
  const taxId = page.getByLabel('RFC');
  await taxId.fill('ABC991399XY1');
  await page.getByLabel('Razón social').fill(`Proveedor E2E ${rfc}`);
  await page.getByRole('button', { name: 'Crear proveedor' }).click();
  await expect(page.getByText('El RFC no es válido')).toBeVisible();

  await taxId.fill(rfc.toLowerCase());
  await page.getByLabel('Días de crédito').fill('30');
  await page.getByRole('button', { name: 'Crear proveedor' }).click();
  await expect(page.getByRole('heading', { name: `Proveedor E2E ${rfc}` })).toBeVisible();
  await expect(taxId).toHaveValue(rfc);

  await page.getByRole('tab', { name: 'Artículos' }).click();
  await page.getByRole('button', { name: 'Agregar artículo' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Materia prima o insumo' }).fill('E2E-HARINA');
  await page.getByRole('option', { name: /E2E-HARINA/ }).click();
  await dialog.getByLabel('Precio por unidad de compra (sin IVA)').fill('18.5');
  await dialog.getByLabel('Días de entrega').fill('2');
  await dialog.getByRole('switch', { name: 'Proveedor preferido de este artículo' }).click();
  await dialog.getByRole('button', { name: 'Agregar' }).click();

  const row = page.getByRole('row').filter({ hasText: 'E2E-HARINA' });
  await expect(row).toContainText('$18.50');
  await expect(row).toContainText('Preferido');
});
