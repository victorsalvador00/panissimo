import { expect, test } from '@playwright/test';
import { ensurePreferredSupplier } from './support/purchasing';
import {
  adminApi,
  adminCredentials,
  chooseOptions,
  expectNoHorizontalScroll,
  login,
} from './support/session';

/**
 * F-12: requisición en COM con HAR-001 (proveedor preferido sugerido), guardar y enviar, aprobar y
 * convertir a OC desde la lista con selección múltiple (RN-34). No mueve inventario; cada corrida
 * deja una OC en borrador.
 */
let preferred: string;

test.beforeAll(async ({ baseURL }) => {
  const api = await adminApi(baseURL!);
  preferred = await ensurePreferredSupplier(api, 'HAR-001');
  await api.dispose();
});

test('requisición: enviar, aprobar y convertir a OC', async ({ page }) => {
  const admin = adminCredentials();
  await login(page, admin.email, admin.password);

  await page.goto('/compras/requisiciones/nueva');
  await expect(page.getByRole('heading', { name: 'Nueva requisición' })).toBeVisible();
  // Si la ubicación activa no compra (ej. una sucursal), se elige el comisariato.
  const location = page.getByRole('combobox', { name: 'Ubicación que compra' });
  if (await location.isVisible()) {
    await chooseOptions(page, 'Ubicación que compra', [/^COM · /]);
  }

  await page.getByRole('combobox', { name: 'Artículo' }).fill('HAR-001');
  await page.getByRole('option', { name: /^HAR-001 · / }).click();
  // El preferido queda sugerido con su precio.
  await expect(page.getByRole('combobox', { name: 'Proveedor' })).toContainText(
    `${preferred} (preferido)`,
  );
  await page.getByLabel('Cantidad', { exact: true }).fill('4');
  await expect(page.getByText('Total estimado sin IVA')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Guardar y enviar' }).click();

  const heading = page.getByRole('heading', { name: /^Requisición REQ-\d+$/ });
  await expect(heading).toBeVisible();
  const folio = (await heading.textContent())!.replace('Requisición', '').trim();
  await expect(page.locator('app-status-tag', { hasText: 'Enviada' }).first()).toBeVisible();
  await expect(page.getByText(preferred).first()).toBeVisible();

  // Aprobar (el administrador tiene purchasing.po.approve).
  await page.getByRole('button', { name: 'Aprobar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Aprobar' }).click();
  await expect(page.locator('app-status-tag', { hasText: 'Aprobada' }).first()).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Convertir desde la lista con selección múltiple.
  await page.goto('/compras/requisiciones');
  await page.getByRole('searchbox', { name: 'Buscar por folio' }).fill(folio);
  await page.getByRole('checkbox', { name: `Seleccionar ${folio}` }).check();
  await page.getByRole('button', { name: /Convertir a OC \(1\)/ }).click();
  const confirm = page.getByRole('dialog');
  await expect(confirm.getByText(`¿Convertir ${folio} en orden de compra?`)).toBeVisible();
  await confirm.getByRole('button', { name: 'Convertir a OC' }).click();

  const result = page.getByRole('dialog');
  await expect(result.getByText('Se creó 1 orden de compra en borrador')).toBeVisible();
  const poFolio = (await result.getByText(/^OC-\d+$/).textContent())!.trim();
  await expect(result.getByText(preferred)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await result.getByRole('button', { name: 'Entendido' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Ya convertida ya no se puede elegir; el detalle muestra la OC.
  await expect(page.getByRole('checkbox', { name: `Seleccionar ${folio}` })).toHaveCount(0);
  await page.getByText(folio, { exact: true }).first().click();
  await expect(
    page.locator('app-status-tag', { hasText: 'Convertida a OC' }).first(),
  ).toBeVisible();
  await expect(page.getByText(poFolio)).toBeVisible();
});
