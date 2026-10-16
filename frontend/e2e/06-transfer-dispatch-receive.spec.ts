import { expect, test } from '@playwright/test';
import {
  adminApi,
  adminCredentials,
  chooseOptions,
  expectNoHorizontalScroll,
  login,
} from './support/session';
import { expectNoA11yViolations } from './support/a11y';

/**
 * E2E #3 (sin pedido, criterio de F-08): traspaso directo COM → SUC-01, despacho con lote elegido y
 * recepción en celular con faltante. Sí mueve inventario: antes registra por API una entrada de 5 kg
 * de HAR-001 en COM (lote E2E-TR-2099), así COM queda igual y SUC-01 gana 4 kg por corrida.
 * La caducidad del lote es fija: un lote existente no puede registrarse con otra fecha.
 */
const LOT = 'E2E-TR-2099';
const EXPIRATION = '2099-12-31';

test.beforeEach(async ({ baseURL }) => {
  const api = await adminApi(baseURL!);
  const locations = await (await api.get('/api/v1/locations/lookup')).json();
  const com = locations.find((l: { code: string }) => l.code === 'COM');
  const [flour] = await (await api.get('/api/v1/items/lookup?q=HAR-001')).json();
  const response = await api.post('/api/v1/adjustments', {
    data: {
      locationId: com.id,
      reason: 'Correction',
      notes: 'E2E traspaso',
      lines: [
        {
          itemId: flour.id,
          lotId: null,
          lotNumber: LOT,
          expirationDate: EXPIRATION,
          quantity: 5,
          unitCost: 10,
          notes: null,
        },
      ],
    },
  });
  expect(response.ok()).toBe(true);
  await api.dispose();
});

test('traspaso directo: despachar con lote elegido y recibir con faltante en celular', async ({
  page,
}) => {
  const admin = adminCredentials();
  await login(page, admin.email, admin.password);
  await chooseOptions(page, 'Ubicación activa', [/^COM · /]);

  // Borrador en el origen.
  await page.goto('/logistica/traspasos/nuevo');
  await expect(page.getByRole('combobox', { name: 'Origen' })).toContainText('COM');
  await chooseOptions(page, 'Destino', [/^SUC-01 · /]);
  await page.getByRole('combobox', { name: 'Artículo' }).fill('HAR-001');
  await page.getByRole('option', { name: /HAR-001 · / }).click();
  await page.getByLabel('Cantidad', { exact: true }).fill('5');
  await page.getByRole('button', { name: 'Guardar borrador' }).click();

  const heading = page.getByRole('heading', { name: /^Traspaso TR-/ });
  await expect(heading).toBeVisible();
  const folio = (await heading.textContent())!.replace('Traspaso', '').trim();
  await expect(page.getByText('Borrador', { exact: true })).toBeVisible();

  // Despacho: vehículo, chofer y los 5 kg del lote de la prueba.
  await page.getByRole('button', { name: 'Despachar' }).click();
  const dispatch = page.getByRole('dialog');
  await dispatch.getByLabel('Vehículo').fill('Nissan NP300 E2E-001');
  await dispatch.getByLabel('Chofer').fill('Chofer E2E');
  await dispatch.getByRole('switch', { name: 'Elegir lotes' }).click();
  await dispatch.getByLabel(`Cantidad del lote ${LOT}`).fill('5');
  await expect(dispatch.getByText(/Repartido 5 kg de 5 kg/)).toBeVisible();
  await dispatch.getByRole('button', { name: 'Continuar' }).click();

  const confirm = page.getByRole('dialog');
  await expect(confirm.getByText(`¿Despachar ${folio}?`)).toBeVisible();
  await expect(confirm.getByRole('cell', { name: new RegExp(LOT) })).toBeVisible();
  await confirm.getByRole('button', { name: 'Despachar' }).click();
  await expect(page.getByText('En tránsito', { exact: true })).toBeVisible();

  // Recepción en la sucursal, en celular.
  await page.setViewportSize({ width: 390, height: 844 });
  await chooseOptions(page, 'Ubicación activa', [/^SUC-01 · /]);
  await page.goto('/logistica/traspasos');
  await page.getByRole('tab', { name: 'En tránsito' }).click();
  const card = page
    .locator('app-data-table')
    .getByText(folio)
    .locator('xpath=ancestor::*[.//a[normalize-space()="Recibir"]][1]');
  await card.getByRole('link', { name: 'Recibir' }).click();

  await expect(page.getByRole('heading', { name: `Recibir ${folio}` })).toBeVisible();
  await expectNoHorizontalScroll(page);
  const received = page.getByLabel('Recibido de HAR-001');
  await expect(received).toHaveValue('5');
  await received.fill('4');
  await expect(page.getByText('1 con faltante')).toBeVisible();
  await chooseOptions(page, 'Motivo del faltante', ['Faltante']);
  await page.getByLabel('Notas').fill('Llegó una bolsa menos');
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page);
  await page.getByRole('button', { name: 'Recibir', exact: true }).click();

  const summary = page.getByRole('dialog');
  await expect(summary.getByText(`¿Recibir ${folio}?`)).toBeVisible();
  await expect(summary.getByRole('cell', { name: 'Faltante' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page);
  await summary.getByRole('button', { name: 'Recibir' }).click();

  await expect(page.getByText('Recibido con diferencias', { exact: true })).toBeVisible();
  const shortage = page.getByRole('listitem').filter({ hasText: `Lote ${LOT}` });
  await expect(shortage).toContainText(/Faltan 1\s*kg/);
  await expect(shortage).toContainText('Faltante');
  await expect(shortage).toContainText('Llegó una bolsa menos');
  await expect(shortage).toContainText(/Recibido 4\s*kg/);
  await expectNoHorizontalScroll(page);
});
