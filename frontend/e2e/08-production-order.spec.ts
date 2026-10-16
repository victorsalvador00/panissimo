import { expect, test } from '@playwright/test';
import {
  ensureActiveRecipe,
  ensureProduct,
  itemId,
  locationId,
  PRODUCT,
} from './support/production';
import {
  adminApi,
  adminCredentials,
  chooseOptions,
  expectNoHorizontalScroll,
  login,
} from './support/session';

/**
 * E2E #4 (criterio de F-10): OP → liberar → completar → aparece el lote del producto en existencias.
 * Sí mueve inventario: antes registra por API en FAB 10 kg de HAR-001 (lote E2E-OP-2099, caducidad
 * fija) y 2 kg de AZU-001, más de lo que consume; FAB gana E2E-PT en cada corrida.
 */
const LOT = 'E2E-OP-2099';

test.beforeEach(async ({ baseURL }) => {
  const api = await adminApi(baseURL!);
  const productId = await ensureProduct(api);
  await ensureActiveRecipe(api, productId);
  const response = await api.post('/api/v1/adjustments', {
    data: {
      locationId: await locationId(api, 'FAB'),
      reason: 'Correction',
      notes: 'E2E producción',
      lines: [
        {
          itemId: await itemId(api, 'HAR-001'),
          lotId: null,
          lotNumber: LOT,
          expirationDate: '2099-12-31',
          quantity: 10,
          unitCost: 12,
          notes: null,
        },
        {
          itemId: await itemId(api, 'AZU-001'),
          lotId: null,
          lotNumber: null,
          expirationDate: null,
          quantity: 2,
          unitCost: 20,
          notes: null,
        },
      ],
    },
  });
  expect(response.ok()).toBe(true);
  await api.dispose();
});

test('orden de producción: crear, liberar, completar y ver el lote en existencias', async ({
  page,
}) => {
  const admin = adminCredentials();
  await login(page, admin.email, admin.password);
  await chooseOptions(page, 'Ubicación activa', [/^FAB · /]);

  // Borrador con la explosión teórica.
  await page.goto('/produccion/ordenes/nueva');
  await page.getByRole('combobox', { name: 'Producto' }).fill(PRODUCT);
  await page.getByRole('option', { name: new RegExp(`^${PRODUCT} · `) }).click();
  await expect(page.getByText(/Receta activa: versión \d+/)).toBeVisible();
  await page.getByLabel('Cantidad planeada').fill('10');
  await expect(page.locator('app-explosion-list')).toContainText('HAR-001');
  await expect(page.locator('app-explosion-list')).toContainText('Disp.');
  await expect(page.getByText('No alcanza la existencia')).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Guardar borrador' }).click();

  const heading = page.getByRole('heading', { name: /^Orden de producción OP-/ });
  await expect(heading).toBeVisible();
  const folio = (await heading.textContent())!.replace('Orden de producción', '').trim();

  await page.getByRole('button', { name: 'Liberar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Liberar' }).click();
  await expect(page.locator('app-status-tag')).toHaveText('Liberada');

  // Completar produciendo menos de lo planeado; la harina sale del lote de la prueba.
  await page.getByRole('link', { name: 'Completar' }).click();
  await expect(page.getByRole('heading', { name: `Completar ${folio}` })).toBeVisible();
  const complete = page.getByRole('button', { name: 'Completar', exact: true });
  await expect(complete).toBeEnabled();
  await page.getByLabel('Cantidad producida').fill('8');
  await expect(complete).toBeDisabled();
  await expect(complete).toBeEnabled();

  const flour = page.getByLabel('Consumo real de HAR-001');
  const actual = await flour.inputValue();
  expect(Number(actual)).toBeGreaterThan(0);
  const flourLine = page.getByRole('listitem').filter({ has: flour });
  await flourLine.getByRole('switch', { name: 'Elegir lotes' }).click();
  await flourLine.getByLabel(`Cantidad del lote ${LOT}`).fill(actual);
  const split = page.locator('.sum');
  await expect(split).toHaveText(`Repartido ${actual} kg de ${actual} kg`);
  await expect(split).not.toHaveClass(/out/);
  await expectNoHorizontalScroll(page);
  await complete.click();

  const confirm = page.getByRole('dialog');
  await expect(confirm.getByText(`¿Completar la orden ${folio}?`)).toBeVisible();
  await expect(confirm.getByText(folio, { exact: true })).toBeVisible();
  await confirm.getByRole('button', { name: 'Completar' }).click();

  await expect(page.getByRole('heading', { name: `Orden de producción ${folio}` })).toBeVisible();
  await expect(page.locator('app-status-tag')).toHaveText('Completada');
  await expect(page.getByText(`Lote ${LOT}:`)).toBeVisible();

  // El lote del producto (folio de la OP) aparece en las existencias de FAB.
  await page.goto('/inventario/existencias');
  await page.getByLabel('Buscar por SKU o nombre').fill(PRODUCT);
  await page.locator('app-data-table').getByText(PRODUCT).first().click();
  await expect(page.getByText(folio).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
});
