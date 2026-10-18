import AxeBuilder from '@axe-core/playwright';
import { Page, expect, test } from '@playwright/test';
import { AdminApi, signIn } from './support/api';
import { adminCredentials } from './support/env';

/** Business date of the plant (America/Mexico_City), as the API expects it. */
function day(offset = 0): string {
  const date = new Date(Date.now() + offset * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(date);
}

interface Scenario {
  orderId: string;
  orderFolio: string;
  oldLot: string;
  oldOrderFolio: string;
}

/**
 * Reduced scenario of trazabilidad §9: two flour lots received on two OCs (the oldest one expires first), an OP of
 * bread with two closes (FEFO: the first one takes all of the old flour, the final one the new flour) and three
 * transfers: TR1 30 of -01 to SUC-TZ1, TR2 20 of -01 and 20 of -02 to SUC-TZ2, TR3 30 of -02 to SUC-TZ3.
 * The quantities leave no stock behind, so every run starts the same.
 */
async function buildScenario(api: AdminApi): Promise<Scenario> {
  await api.ensureCategory('E2E');
  await api.ensureItem('E2E-TZ-HARINA', 'Harina E2E trazabilidad', 'E2E', 'kg', 'RawMaterial', {
    tracksLots: true,
    shelfLifeDays: null,
  });
  await api.ensureItem('E2E-TZ-PAN', 'Pan E2E trazabilidad', 'E2E', 'pza', 'FinishedGood', {
    tracksLots: true,
    shelfLifeDays: 2,
  });
  const flour = await api.itemId('E2E-TZ-HARINA');
  const bread = await api.itemId('E2E-TZ-PAN');
  const recipes = await api.get<{ items: { id: string }[] }>(`recipes?outputItemId=${bread}`);
  if (recipes.items.length === 0)
    await api.post('recipes', {
      outputItemId: bread,
      yieldQty: 10,
      notes: 'E2E 24',
      lines: [{ componentItemId: flour, quantity: 1, wastePct: 0 }],
    });
  const { supplierId } = await api.ensureSupplierOffer('E2E-TZ-HARINA');
  const plant = (await api.locationId('PLANTA'))!;
  // RN-45: the plant keeps raw materials and finished goods in sub-warehouses.
  const rawMaterials = (await api.locationId('PLANTA-MP'))!;
  const finishedGoods = (await api.locationId('PLANTA-PT'))!;
  const branches = [
    await api.ensureBranch('SUC-TZ1', 'Sucursal TZ 1'),
    await api.ensureBranch('SUC-TZ2', 'Sucursal TZ 2'),
    await api.ensureBranch('SUC-TZ3', 'Sucursal TZ 3'),
  ];

  const run = Date.now().toString(36).toUpperCase();
  const receive = async (lot: string, expiration: string) => {
    let po = await api.post<{
      id: string;
      folio: string;
      version: number;
      lines: { id: string }[];
    }>('purchase-orders', {
      supplierId,
      deliveryLocationId: plant,
      expectedDate: day(),
      notes: 'E2E 24',
      lines: [{ lineId: null, itemId: flour, quantity: 5, unitPrice: 18 }],
    });
    po = await api.post(`purchase-orders/${po.id}/submit`, { version: po.version });
    po = await api.post(`purchase-orders/${po.id}/approve`, { version: po.version });
    await api.post('goods-receipts', {
      purchaseOrderId: po.id,
      poVersion: po.version,
      supplierInvoiceNumber: `F-${run}`,
      notes: null,
      lines: [
        { poLineId: po.lines[0].id, quantity: 5, lotNumber: lot, expirationDate: expiration },
      ],
      warehouseId: rawMaterials,
    });
    return po.folio;
  };
  const oldLot = `TZ-${run}-A`;
  const oldOrderFolio = await receive(oldLot, day(30));
  await receive(`TZ-${run}-B`, day(60));

  let order = await api.post<{ id: string; folio: string; version: number }>('production-orders', {
    locationId: plant,
    outputItemId: bread,
    plannedQty: 100,
    scheduledDate: day(),
    productionAreaId: null,
    shift: 'Day',
    notes: 'E2E 24',
  });
  order = await api.post(`production-orders/${order.id}/release`, { version: order.version });
  const close = (version: number, kind: 'Partial' | 'Final') =>
    api.post<{ order: { version: number } }>(`production-orders/${order.id}/closes`, {
      version,
      kind,
      producedQty: 50,
      shift: null,
      notes: null,
      shortfallReason: null,
      shortfallNotes: null,
      lines: null,
      consumptionWarehouseId: rawMaterials,
      outputWarehouseId: finishedGoods,
    });
  const first = await close(order.version, 'Partial');
  await close(first.order.version, 'Final');

  for (const [branch, quantity] of [
    [branches[0], 30],
    [branches[1], 40],
    [branches[2], 30],
  ] as const) {
    const draft = await api.post<{ id: string; version: number }>('transfers', {
      fromLocationId: plant,
      toLocationId: branch,
      notes: 'E2E 24',
      lines: [{ itemId: bread, lotId: null, quantity }],
    });
    const sent = await api.post<{
      id: string;
      version: number;
      lines: { id: string; shippedQty: number }[];
    }>(`transfers/${draft.id}/dispatch`, {
      version: draft.version,
      vehicleDescription: 'U-E2E',
      driverName: 'Chofer E2E',
      lines: null,
      fromWarehouseId: finishedGoods,
    });
    await api.post(`transfers/${sent.id}/receive`, {
      version: sent.version,
      lines: sent.lines.map((l) => ({
        lineId: l.id,
        receivedQty: l.shippedQty,
        discrepancyReason: null,
        discrepancyNotes: null,
      })),
    });
  }
  return { orderId: order.id, orderFolio: order.folio, oldLot, oldOrderFolio };
}

async function audit(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // What the selection dims is out of the chain on purpose (incidental content, WCAG 1.4.3).
    .exclude('.dimmed')
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  const report = serious
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes
          .map((n) => n.target.join(' '))
          .slice(0, 5)
          .join('\n  ')}`,
    )
    .join('\n');
  expect(serious, `${label}\n${report}`).toEqual([]);
}

const card = (page: Page, text: string) => page.locator('app-trace-card').filter({ hasText: text });

/**
 * E2E 24, the "E2E 17" of trazabilidad §6.4 and trazabilidad-ui §11 (17 was already taken by the material requirement):
 * search the OP, open the map, select the oldest flour and the branch that did not get it is dimmed; Esc closes the
 * ficha and gives the focus back; at 1024 px the ficha of a card of the last lane opens on its left; at 390 px the
 * initial tab is Resumen, there is no horizontal scroll and the ficha is a bottom sheet; axe in light and dark with the
 * ficha open. **Moves inventory** in the database it runs against: receives 10 kg of E2E-TZ-HARINA on two OCs,
 * produces 100 pieces of E2E-TZ-PAN and sends them to SUC-TZ1, SUC-TZ2 and SUC-TZ3 (nothing is left in the plant).
 */
test('trazabilidad: mapa, ficha, dirección, resumen y bitácora', async ({
  page,
  baseURL,
  isMobile,
}) => {
  test.skip(isMobile, 'Recorre escritorio, tableta y 390 px en una sola corrida.');
  test.setTimeout(120_000);
  const api = await AdminApi.create(baseURL!);
  const scenario = await buildScenario(api);
  await api.dispose();

  await signIn(page, adminCredentials());
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/inventario/trazabilidad');
  await page.getByLabel('Lote, OC, OP, traspaso o remisión').fill(scenario.orderFolio);
  await page.getByRole('option', { name: new RegExp(`^${scenario.orderFolio} `) }).click();
  await expect(page.getByRole('radio', { name: 'Ambas' })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Rastrear' })).toBeEnabled();
  await page.getByRole('button', { name: 'Rastrear' }).click();
  await expect(page).toHaveURL(
    new RegExp(`/inventario/trazabilidad/op/${scenario.orderId}\\?direccion=ambas`),
  );
  await expect(
    page.getByRole('heading', { name: `Trazabilidad · ${scenario.orderFolio}` }),
  ).toBeVisible();

  // The oldest flour: its ficha shows what the first close took.
  const flour = card(page, scenario.oldLot);
  await flour.getByRole('button').click();
  const ficha = page.getByRole('dialog');
  await expect(ficha.getByRole('heading', { name: scenario.oldOrderFolio })).toBeVisible();
  const consumption = ficha.getByRole('table', { name: 'Consumo por cierre' });
  await expect(consumption).toContainText('5 kg');
  await expect(consumption).toContainText('CP-');

  // Destino: the chain reaches SUC-TZ1 and SUC-TZ2; SUC-TZ3 stays dimmed.
  await page.locator('app-trace-graph .controls').getByRole('radio', { name: 'Destino' }).click();
  await expect(card(page, 'Sucursal TZ 3')).toHaveCSS('opacity', '0.28');
  await expect(card(page, 'Sucursal TZ 1')).toHaveCSS('opacity', '1');
  await expect(page.locator('.selection-bar')).toContainText('SUC-TZ2');
  await expect(page.locator('.selection-bar')).toContainText('50 pza enviadas');

  // axe with the ficha open, in light and dark (html[data-theme], like the theme service).
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((mode) => document.documentElement.setAttribute('data-theme', mode), theme);
    // The tab labels animate their color: let the transition end before measuring contrast.
    await page.waitForTimeout(500);
    await audit(page, `trazabilidad con ficha (${theme})`);
  }
  await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));

  // Esc closes the ficha and the focus goes back to the card; a second Esc removes the selection.
  await page.keyboard.press('Escape');
  await expect(ficha).toBeHidden();
  await expect(flour.getByRole('button')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(card(page, 'Sucursal TZ 3')).toHaveCSS('opacity', '1');

  // Tablet: the ficha of a card of the last lane opens on its left.
  await page.setViewportSize({ width: 1024, height: 768 });
  const branch = card(page, 'Sucursal TZ 3').getByRole('button');
  await branch.click();
  await expect(ficha).toBeVisible();
  const cardBox = (await branch.boundingBox())!;
  const fichaBox = (await ficha.boundingBox())!;
  expect(fichaBox.x + fichaBox.width).toBeLessThanOrEqual(cardBox.x + 1);
  await page.keyboard.press('Escape');

  // Bitácora → Mapa: a receipt row opens its card.
  await page.getByRole('tab', { name: 'Bitácora' }).click();
  await page.getByRole('row').filter({ hasText: scenario.oldLot }).first().click();
  await expect(page.getByRole('tab', { name: 'Mapa' })).toHaveAttribute('aria-selected', 'true');
  await expect(ficha.getByRole('heading', { name: scenario.oldOrderFolio })).toBeVisible();
  await page.keyboard.press('Escape');

  // 390 px: Resumen first, no horizontal scroll, the ficha is a bottom sheet that closes with the backdrop.
  // (Destino rewrote ?direccion=; opening it again with both directions brings the whole chain.)
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/inventario/trazabilidad/op/${scenario.orderId}?direccion=ambas`);
  await expect(page.getByRole('tab', { name: 'Resumen' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('SUC-TZ3 · Sucursal TZ 3')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'scroll horizontal en px').toBeLessThanOrEqual(0);
  await page.getByRole('tab', { name: 'Mapa' }).click();
  await card(page, scenario.oldLot).getByRole('button').click();
  const sheet = page.locator('mat-bottom-sheet-container');
  await expect(sheet.getByRole('heading', { name: scenario.oldOrderFolio })).toBeVisible();
  await page.locator('.cdk-overlay-backdrop').click({ position: { x: 10, y: 10 } });
  await expect(sheet).toBeHidden();
});
