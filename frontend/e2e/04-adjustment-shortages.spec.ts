import { expect, test } from '@playwright/test';
import { adminCredentials, chooseOptions, login } from './support/session';

/**
 * Criterio de aceptación de F-06: un ajuste que dejaría existencia negativa muestra el diálogo de
 * faltantes (409 `insufficient_stock`) y no registra nada (RN-02).
 */
test('ajuste sin existencia muestra el diálogo de faltantes', async ({ page }) => {
  const admin = adminCredentials();
  await login(page, admin.email, admin.password);
  await page.goto('/inventario/ajustes/nuevo');

  await chooseOptions(page, 'Ubicación', [/^SUC-02 · /]);
  // Motivo por defecto: Merma (salida).
  await expect(page.getByRole('combobox', { name: 'Motivo' })).toContainText('Merma');

  await page.getByLabel('Artículo').fill('AZU-001');
  await page.getByRole('option', { name: /AZU-001 · Azúcar/ }).click();
  await page.getByLabel('A dar de baja').fill('99999');

  await page.getByRole('button', { name: 'Registrar ajuste' }).click();
  const confirm = page.getByRole('dialog');
  await expect(confirm.getByText('¿Registrar ajuste por merma?')).toBeVisible();
  await expect(confirm.getByRole('cell', { name: /-99,999 kg/ })).toBeVisible();
  await confirm.getByRole('button', { name: 'Registrar ajuste' }).click();

  const shortages = page.getByRole('dialog');
  await expect(shortages.getByRole('heading', { name: 'Existencia insuficiente' })).toBeVisible();
  const row = shortages.getByRole('row', { name: /AZU-001 · Azúcar/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText('99,999 kg');

  await shortages.getByRole('button', { name: 'Entendido' }).click();
  // Sigue en el formulario: no se registró nada.
  await expect(page).toHaveURL(/\/inventario\/ajustes\/nuevo$/);
});
