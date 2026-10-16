import { expect, test } from '@playwright/test';
import { uniqueTaxId } from './support/purchasing';
import { adminCredentials, expectNoHorizontalScroll, login } from './support/session';

/**
 * F-11: alta de proveedor, ligar HAR-001 como artículo preferido y editar su precio (escritorio y
 * celular). No mueve inventario, pero cada corrida deja un proveedor nuevo (RFC único) que queda como
 * preferido de HAR-001: sirve de dato para requisiciones y órdenes de compra (F-12, F-13).
 */
test('alta de proveedor con artículo preferido y cambio de precio', async ({ page }) => {
  const admin = adminCredentials();
  await login(page, admin.email, admin.password);
  const taxId = uniqueTaxId();
  const name = `Proveedor E2E ${taxId}`;

  await page.goto('/compras/proveedores');
  await expect(page.getByRole('heading', { name: 'Proveedores' })).toBeVisible();
  await page.getByRole('link', { name: 'Nuevo proveedor' }).click();

  // El RFC se escribe en minúsculas: se guarda en mayúsculas.
  await page.getByLabel('RFC', { exact: true }).fill(taxId.toLowerCase());
  await page.getByLabel('Razón social').fill(name);
  await page.getByLabel('Contacto').fill('Laura Pérez');
  await page.getByLabel('Teléfono').fill('6691234567');
  await page.getByLabel('Correo').fill('ventas@proveedor-e2e.test');
  await page.getByLabel('Días de crédito').fill('30');
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Crear proveedor' }).click();

  await expect(page.getByRole('heading', { name })).toBeVisible();
  await expect(page.getByLabel('RFC', { exact: true })).toHaveValue(taxId);

  // Artículos: HAR-001 como preferido.
  await page.getByRole('tab', { name: 'Artículos' }).click();
  await expect(page.getByText('Este proveedor todavía no tiene artículos.')).toBeVisible();
  await page.getByRole('button', { name: 'Agregar artículo' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Artículo' }).fill('HAR-001');
  await page.getByRole('option', { name: /^HAR-001 · / }).click();
  await dialog.getByLabel('Clave del proveedor').fill('E2E-HAR-25');
  await dialog.getByLabel('Precio sin IVA').fill('412.5');
  await dialog.getByLabel('Días de entrega').fill('3');
  await dialog.getByRole('switch', { name: 'Proveedor preferido' }).click();
  await dialog.getByRole('button', { name: 'Guardar' }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('HAR-001 agregado al proveedor.')).toBeVisible();
  await expect(page.getByText('$412.50').first()).toBeVisible();
  await expect(page.getByText('Preferido').first()).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Cambio de precio.
  const itemsTab = page.getByRole('tabpanel', { name: 'Artículos' });
  await itemsTab.getByText('HAR-001').first().click();
  const edit = page.getByRole('dialog');
  await expect(edit.getByText(/^HAR-001 · /)).toBeVisible();
  await edit.getByLabel('Precio sin IVA').fill('450');
  await edit.getByRole('button', { name: 'Guardar' }).click();
  await expect(edit).toHaveCount(0);
  await expect(itemsTab.getByText('$450.00').first()).toBeVisible();
  await expect(itemsTab.getByText('$412.50')).toHaveCount(0);

  // La lista lo encuentra por RFC.
  await page
    .getByRole('navigation', { name: 'Ruta de navegación' })
    .getByRole('link', { name: 'Proveedores' })
    .click();
  await page.getByRole('searchbox', { name: 'Buscar por razón social o RFC' }).fill(taxId);
  await expect(page.getByText(name)).toBeVisible();
  await expect(page.getByText('30 días').first()).toBeVisible();
  await expectNoHorizontalScroll(page);
});
