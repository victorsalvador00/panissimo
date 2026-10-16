import { expect, Page, test } from '@playwright/test';
import {
  adminApi,
  adminCredentials,
  chooseOptions,
  expectNoHorizontalScroll,
  login,
} from './support/session';
import { expectNoA11yViolations } from './support/a11y';

/**
 * Criterio de aceptación de F-07: conteo físico y consumo completos en 390 px sin scroll horizontal.
 * El conteo se cancela al final y el consumo se detiene en el resumen: no mueve inventario en la
 * base de desarrollo.
 */

/** Deja SUC-02 como ubicación activa (el administrador ve todas). */
async function useSuc02(page: Page): Promise<void> {
  const active = page.getByRole('combobox', { name: 'Ubicación activa', exact: true });
  if (!(await active.textContent())?.includes('SUC-02')) {
    await chooseOptions(page, 'Ubicación activa', [/^SUC-02 · /]);
  }
}

test.beforeAll(async ({ baseURL }) => {
  // Un conteo en captura que quedó de una corrida fallida impediría iniciar otro en SUC-02 (RN-06).
  const api = await adminApi(baseURL!);
  const locations = await (await api.get('/api/v1/locations?q=SUC-02&pageSize=5')).json();
  const suc02 = locations.items.find((l: { code: string }) => l.code === 'SUC-02');
  const counts = await (
    await api.get(`/api/v1/physical-counts?locationId=${suc02.id}&status=InProgress`)
  ).json();
  for (const count of counts.items as { id: string }[]) {
    const detail = await (await api.get(`/api/v1/physical-counts/${count.id}`)).json();
    await api.post(`/api/v1/physical-counts/${count.id}/cancel`, {
      data: { version: detail.version },
    });
  }
  await api.dispose();
});

test('conteo físico: crear, iniciar, capturar, revisar y cancelar', async ({ page }) => {
  const admin = adminCredentials();
  await login(page, admin.email, admin.password);
  await useSuc02(page);
  await page.goto('/inventario/conteos');
  await expect(page.getByRole('heading', { name: 'Conteos físicos' })).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByRole('button', { name: 'Nuevo conteo' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('combobox', { name: 'Ubicación' })).toContainText('SUC-02');
  await dialog.getByLabel('Notas').fill('E2E conteo móvil');
  await dialog.getByRole('button', { name: 'Crear conteo' }).click();

  await expect(page.getByRole('heading', { name: /^Conteo CF-/ })).toBeVisible();
  await expect(page.getByText('Borrador', { exact: true })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Iniciar conteo' }).click();
  await expect(page.getByText('En captura', { exact: true })).toBeVisible();

  // Captura a ciegas: todas las líneas del snapshot en 0 (sin ver la existencia del sistema).
  const inputs = page.locator('input[aria-label^="Contado de "]');
  for (const input of await inputs.all()) {
    await input.fill('0');
  }

  // Un artículo que no estaba en la lista.
  await page.getByRole('button', { name: 'Agregar artículo' }).click();
  const add = page.getByRole('dialog');
  await add.getByRole('combobox', { name: 'Artículo' }).fill('AZU-001');
  await page.getByRole('option', { name: /AZU-001 · Azúcar/ }).click();
  await add.getByLabel('Cantidad contada').fill('3');
  await add.getByRole('button', { name: 'Agregar' }).click();
  await expect(page.getByText('Artículo agregado al conteo.')).toBeVisible();

  await page.getByLabel('Buscar por nombre, SKU o lote').fill('azu');
  await expect(page.locator('input[aria-label^="Contado de AZU-001"]')).toHaveValue('3');
  await expect(page.getByText('Guardado', { exact: true })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page);

  await page.getByRole('button', { name: 'Revisar y cerrar' }).click();
  await expect(page.getByRole('heading', { name: 'Revisar diferencias' })).toBeVisible();
  await expect(page.getByText(/Sistema .* · Contado 3 kg/)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page);

  await page.getByRole('button', { name: 'Volver a capturar' }).click();
  await page.getByRole('button', { name: 'Cancelar conteo' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar conteo' }).click();
  await expect(page.getByText('Cancelado', { exact: true }).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('consumo del día: captura rápida y resumen', async ({ page }) => {
  const admin = adminCredentials();
  await login(page, admin.email, admin.password);
  await page.goto('/inventario/consumos/nuevo');
  await chooseOptions(page, 'Ubicación activa', [/^COM · /]);
  await expect(page.getByText('El consumo solo se registra en sucursales.')).toBeVisible();
  await useSuc02(page);
  await expect(page.getByRole('heading', { name: 'Agregar' })).toBeVisible();
  await expectNoHorizontalScroll(page);

  for (const qty of ['2', '1.5']) {
    await page.getByRole('combobox', { name: 'Artículo' }).fill('AZU-001');
    await page.getByRole('option', { name: /AZU-001 · Azúcar/ }).click();
    await page.getByLabel('Cantidad', { exact: true }).fill(qty);
    await page.getByLabel('Cantidad', { exact: true }).press('Enter');
  }
  // Mismo artículo: se suma en una sola línea.
  await expect(page.getByRole('heading', { name: 'Consumo (1)' })).toBeVisible();
  await expect(page.locator('input[aria-label="Cantidad de AZU-001"]')).toHaveValue('3.5');
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page);

  await page.getByRole('button', { name: 'Registrar consumo' }).click();
  const confirm = page.getByRole('dialog');
  await expect(confirm.getByText('¿Registrar consumo?')).toBeVisible();
  await expect(confirm.getByRole('cell', { name: /3\.5 kg/ })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page);
  await confirm.getByRole('button', { name: 'Volver' }).click();
  await expect(page).toHaveURL(/\/inventario\/consumos\/nuevo$/);
});
