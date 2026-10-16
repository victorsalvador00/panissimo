import { APIRequestContext, expect, Page, test } from '@playwright/test';
import { ensureProduct, Named, PRODUCT } from './support/production';
import { adminApi, adminCredentials, expectNoHorizontalScroll, login } from './support/session';

/**
 * Criterio de F-09 (RN-10): al editar una receta ya usada en una orden de producción aparece el
 * aviso "Guardar creará la versión N+1" y al guardar la versión anterior queda inactiva. La receta
 * se marca como usada creando por API una orden en borrador que luego se cancela: no mueve
 * inventario. Usa el terminado E2E-PT (se crea si no existe) con HAR-001 y AZU-001.
 */
/** Deja el producto sin receta activa para que la prueba cree la suya. */
async function deactivateRecipes(api: APIRequestContext, productId: string): Promise<void> {
  const active = (await (await api.get(`/api/v1/recipes?outputItemId=${productId}`)).json()) as {
    items: Named[];
  };
  for (const { id } of active.items) {
    const recipe = await (await api.get(`/api/v1/recipes/${id}`)).json();
    const response = await api.put(`/api/v1/recipes/${id}`, {
      data: {
        version: recipe.version,
        yieldQty: recipe.yieldQty,
        notes: recipe.notes,
        isActive: false,
        lines: recipe.lines.map(
          (l: { componentItemId: string; quantity: number; wastePct: number }) => ({
            componentItemId: l.componentItemId,
            quantity: l.quantity,
            wastePct: l.wastePct,
          }),
        ),
      },
    });
    expect(response.ok()).toBe(true);
  }
}

/** Una orden de producción en borrador marca la receta como usada; se cancela enseguida. */
async function useRecipe(api: APIRequestContext, productId: string): Promise<void> {
  const locations = (await (await api.get('/api/v1/locations/lookup')).json()) as Named[];
  const factory = locations.find((l) => l.code === 'FAB')!;
  const created = await api.post('/api/v1/production-orders', {
    data: {
      locationId: factory.id,
      outputItemId: productId,
      plannedQty: 10,
      scheduledDate: new Date().toISOString().slice(0, 10),
      notes: 'E2E recetas',
    },
  });
  expect(created.ok()).toBe(true);
  const order = (await created.json()) as { id: string; version: number };
  const cancelled = await api.post(`/api/v1/production-orders/${order.id}/cancel`, {
    data: { version: order.version },
  });
  expect(cancelled.ok()).toBe(true);
}

async function pickItem(page: Page, label: string, index: number, sku: string): Promise<void> {
  await page.getByRole('combobox', { name: label }).nth(index).fill(sku);
  await page.getByRole('option', { name: new RegExp(`^${sku} · `) }).click();
}

let productId: string;

test.beforeEach(async ({ baseURL }) => {
  const api = await adminApi(baseURL!);
  productId = await ensureProduct(api);
  await deactivateRecipes(api, productId);
  await api.dispose();
});

test('editar una receta usada avisa y crea la versión N+1', async ({ page, baseURL }) => {
  const admin = adminCredentials();
  await login(page, admin.email, admin.password);

  // Receta nueva: HAR-001 con merma y AZU-001.
  await page.goto('/produccion/recetas/nueva');
  await pickItem(page, 'Producto', 0, PRODUCT);
  await page.getByLabel('Rendimiento').fill('10');
  await pickItem(page, 'Componente', 0, 'HAR-001');
  await page.getByLabel('Cantidad', { exact: true }).nth(0).fill('6');
  await page.getByLabel('Merma', { exact: true }).nth(0).fill('2.5');
  await page.getByRole('button', { name: 'Agregar componente' }).click();
  await pickItem(page, 'Componente', 1, 'AZU-001');
  await page.getByLabel('Cantidad', { exact: true }).nth(1).fill('0.8');
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();

  const heading = page.getByRole('heading', { name: new RegExp(`^Receta de ${PRODUCT} · v\\d+$`) });
  await expect(heading).toBeVisible();
  const version = Number((await heading.textContent())!.split('· v')[1]);
  await expect(page.getByText('Guardar creará')).toHaveCount(0);

  // Una orden de producción la usa: editarla ahora crea la versión siguiente.
  const api = await adminApi(baseURL!);
  await useRecipe(api, productId);
  await api.dispose();
  await page.reload();

  await expect(
    page.getByText(
      `Esta receta ya se usó en órdenes de producción. Guardar creará la versión ${version + 1}; ` +
        `las órdenes existentes conservan la versión ${version}.`,
    ),
  ).toBeVisible();
  await page.getByLabel('Rendimiento').fill('12');
  await page.getByRole('button', { name: `Guardar como versión ${version + 1}` }).click();

  const confirm = page.getByRole('dialog');
  await expect(confirm.getByText(`¿Crear la versión ${version + 1} de ${PRODUCT}?`)).toBeVisible();
  await confirm.getByRole('button', { name: `Crear versión ${version + 1}` }).click();

  await expect(
    page.getByRole('heading', { name: `Receta de ${PRODUCT} · v${version + 1}` }),
  ).toBeVisible();
  await expect(page.getByText('Guardar creará')).toHaveCount(0);
  const previous = page.getByRole('listitem').filter({ hasText: `Versión ${version}` });
  await expect(previous.first()).toContainText('Inactiva');
  await expect(previous.first()).toContainText('usada en órdenes');
  await expectNoHorizontalScroll(page);

  // La versión anterior se abre en solo lectura.
  await page.getByRole('link', { name: `Versión ${version}`, exact: true }).click();
  await expect(
    page.getByRole('heading', { name: `Receta de ${PRODUCT} · v${version}` }),
  ).toBeVisible();
  await expect(page.getByText('Versión anterior en solo lectura')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Activar esta versión' })).toBeVisible();
});
