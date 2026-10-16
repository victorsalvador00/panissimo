import { APIRequestContext, expect, Page, test } from '@playwright/test';
import { itemId, locationId } from './support/production';
import {
  adminApi,
  adminCredentials,
  chooseOptions,
  expectNoHorizontalScroll,
  login,
} from './support/session';
import { expectNoA11yViolations } from './support/a11y';

/**
 * E2E #3 completo (F-14): SUC-01 pide HAR-001 a COM con el sugerido por mín/máx → COM aprueba menos
 * → despacha el traspaso generado → la sucursal recibe con faltante en celular → el pedido queda
 * surtido. Antes, por API: una entrada de 3 kg en COM (lote E2E-PED-2099) para que COM no se vacíe,
 * y el mín/máx de HAR-001 en SUC-01 ajustado para que el sugerido sea exactamente 3 kg.
 * **Mueve inventario:** cada corrida pasa 2 kg de COM a SUC-01 (1 kg se pierde en tránsito).
 */
const LOT = 'E2E-PED-2099';
const EXPIRATION = '2099-12-31';
const MOBILE = { width: 390, height: 844 };
let flourName: string;

async function setMinMax(
  api: APIRequestContext,
  item: string,
  location: string,
  minQty: number,
  maxQty: number,
): Promise<void> {
  const response = await api.put(`/api/v1/items/${item}/location-settings`, {
    data: { settings: [{ locationId: location, minQty, maxQty }] },
  });
  expect(response.ok()).toBe(true);
}

test.beforeEach(async ({ baseURL }) => {
  const api = await adminApi(baseURL!);
  const com = await locationId(api, 'COM');
  const branch = await locationId(api, 'SUC-01');
  const flour = await itemId(api, 'HAR-001');
  const [lookup] = await (await api.get(`/api/v1/items/lookup?id=${flour}`)).json();
  flourName = lookup.name;

  const adjustment = await api.post('/api/v1/adjustments', {
    data: {
      locationId: com,
      reason: 'Correction',
      notes: 'E2E pedido',
      lines: [
        {
          itemId: flour,
          lotId: null,
          lotNumber: LOT,
          expirationDate: EXPIRATION,
          quantity: 3,
          unitCost: 10,
          notes: null,
        },
      ],
    },
  });
  expect(adjustment.ok()).toBe(true);

  // Proyectado actual (existencia + en tránsito + pedidos pendientes) con un mínimo enorme; luego
  // mínimo = proyectado y máximo = proyectado + 3, así el sugerido es 3 kg.
  await setMinMax(api, flour, branch, 1_000_000, 1_000_000);
  const suggestions = (await (
    await api.get(`/api/v1/branch-orders/suggestion?locationId=${branch}`)
  ).json()) as { itemId: string; onHand: number; inTransit: number; pending: number }[];
  const current = suggestions.find((s) => s.itemId === flour)!;
  const projected = current.onHand + current.inTransit + current.pending;
  await setMinMax(api, flour, branch, projected, projected + 3);
  await api.dispose();
});

async function useLocation(page: Page, code: string): Promise<void> {
  await chooseOptions(page, 'Ubicación activa', [new RegExp(`^${code} · `)]);
}

test('pedido de sucursal → aprobar → despachar → recibir con faltante (celular)', async ({
  page,
}) => {
  const desktop = page.viewportSize()!;
  const admin = adminCredentials();
  await login(page, admin.email, admin.password);

  // 1. La sucursal captura el pedido con el sugerido, en celular.
  await page.setViewportSize(MOBILE);
  await useLocation(page, 'SUC-01');
  await page.goto('/logistica/pedidos/nuevo');
  await expect(page.getByText('SUC-01 · ', { exact: false }).first()).toBeVisible();
  await chooseOptions(page, 'Pedir a', [/^COM · /]);
  await page.getByRole('button', { name: 'Sugerir por mín/máx' }).click();

  const items = page.getByRole('combobox', { name: 'Artículo' });
  await expect(items.first()).not.toHaveValue('');
  const values = await items.evaluateAll((inputs) =>
    inputs.map((input) => (input as HTMLInputElement).value),
  );
  const flourIndex = values.findIndex((value) => value.includes('HAR-001'));
  expect(flourIndex).toBeGreaterThanOrEqual(0);
  await expect(page.getByLabel('Cantidad', { exact: true }).nth(flourIndex)).toHaveValue('3');
  await expect(page.getByText(/Mín .* · máx .* · hay/).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page);
  await page.getByRole('button', { name: 'Guardar y enviar' }).click();

  const heading = page.getByRole('heading', { name: /^Pedido PED-\d+$/ });
  await expect(heading).toBeVisible();
  const folio = (await heading.textContent())!.replace('Pedido', '').trim();
  const status = page.locator('app-page-header app-status-tag');
  await expect(status).toHaveText('Enviado');
  const orderUrl = page.url();

  // 2. El comisariato lo aprueba con menos harina (y nada de otros sugeridos, si los hubo).
  await page.setViewportSize(desktop);
  await useLocation(page, 'COM');
  await page.goto('/logistica/pedidos');
  await page.getByRole('tab', { name: 'Por aprobar' }).click();
  await page.locator('app-data-table').getByText(folio).click();
  await expect(heading).toBeVisible();
  await page.getByRole('button', { name: 'Aprobar' }).click();

  const approved = page.getByLabel(/^Aprobado de /);
  const count = await approved.count();
  for (let i = 0; i < count; i++) {
    await approved.nth(i).fill('0');
  }
  await page.getByLabel(`Aprobado de ${flourName}`, { exact: true }).fill('2');
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page);
  await page.getByRole('button', { name: 'Confirmar aprobación' }).click();
  const confirm = page.getByRole('dialog');
  await expect(confirm.getByText(`¿Aprobar el pedido ${folio}?`)).toBeVisible();
  await confirm.getByRole('button', { name: 'Aprobar' }).click();
  await expect(status).toHaveText('Aprobado');

  // 3. Despacha el traspaso generado (FEFO automático).
  await page.getByRole('link', { name: 'Ir a despachar' }).click();
  await expect(page.getByRole('heading', { name: /^Traspaso TR-/ })).toBeVisible();
  await expect(page.getByRole('link', { name: folio })).toBeVisible();
  const transferUrl = page.url();
  await page.getByRole('button', { name: 'Despachar' }).click();
  const dispatch = page.getByRole('dialog');
  await dispatch.getByLabel('Vehículo').fill('Nissan NP300 E2E-002');
  await dispatch.getByLabel('Chofer').fill('Chofer E2E');
  await dispatch.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Despachar' }).click();
  await expect(page.getByText('En tránsito', { exact: true })).toBeVisible();

  // 4. La sucursal recibe en celular con 1 kg de faltante.
  await page.setViewportSize(MOBILE);
  await useLocation(page, 'SUC-01');
  await page.goto(transferUrl);
  await page.getByRole('link', { name: 'Recibir' }).click();
  await expect(page.getByRole('heading', { name: /^Recibir TR-/ })).toBeVisible();
  const received = page.getByLabel('Recibido de HAR-001').first();
  const shipped = Number(await received.inputValue());
  await received.fill(String(shipped - 1));
  await chooseOptions(page, 'Motivo del faltante', ['Faltante']);
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Recibir', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Recibir' }).click();
  await expect(page.getByText('Recibido con diferencias', { exact: true })).toBeVisible();

  // 5. El pedido queda surtido con lo despachado (RN-24).
  await page.goto(orderUrl);
  await expect(status).toHaveText('Surtido');
  await expect(page.getByText(/Aprobado 2\s*kg · despachado 2\s*kg/)).toBeVisible();
  await expectNoHorizontalScroll(page);
});
