import AxeBuilder from '@axe-core/playwright';
import { Page, expect, test } from '@playwright/test';
import { AdminApi, signIn } from './support/api';
import { base } from './support/base-data';
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

/** The other ingredients of 1,000 donuts (recipe of the base catalogs), with a lot for those that track them. */
const otherIngredients: { sku: string; warehouse: string; quantity: number; lot: boolean }[] = [
  { sku: 'IN-001', warehouse: base.supplies, quantity: 8, lot: false },
  { sku: 'MP-002', warehouse: base.rawMaterials, quantity: 1, lot: false },
  { sku: 'MP-003', warehouse: base.rawMaterials, quantity: 10, lot: true },
  { sku: 'MP-004', warehouse: base.rawMaterials, quantity: 1, lot: true },
  { sku: 'MP-005', warehouse: base.rawMaterials, quantity: 5, lot: true },
  { sku: 'MP-006', warehouse: base.rawMaterials, quantity: 15, lot: true },
  { sku: 'MP-007', warehouse: base.rawMaterials, quantity: 1, lot: true },
];

/**
 * Reduced scenario of trazabilidad §9 on the base catalogs: two lots of flour (MP-001), one "bulto" of 25 kg on each of
 * two OCs of its supplier, expiring in 2 and 3 days so FEFO takes them before any other flour; an OP of 1,000 donuts
 * (1 kg of flour per 20) with two closes of 500 (the first takes all the old flour, the final one the new flour) and
 * two transfers to SUC-001 with the lot fixed: TR1 the 500 of lot -01, TR2 the 500 of lot -02. The flour of the run is
 * used up; the donuts stay in the branch.
 */
async function buildScenario(api: AdminApi): Promise<Scenario> {
  const flour = await api.itemId(base.flour);
  const donut = await api.itemId(base.donut);
  const recipes = await api.get<{ items: { isActive: boolean }[] }>(
    `recipes?outputItemId=${donut}`,
  );
  expect(
    recipes.items.some((r) => r.isActive),
    `receta activa de ${base.donut}`,
  ).toBeTruthy();
  const { supplierId } = await api.supplierOffer(base.flour);
  const plant = await api.requireLocation(base.plant);
  const rawMaterials = await api.requireLocation(base.rawMaterials);
  const factory = await api.requireLocation(base.factory);
  const branch = await api.requireLocation(base.branch);
  for (const c of otherIngredients)
    await api.addStock(c.warehouse, c.sku, c.quantity, 10, c.lot ? 'E2E-24' : null);

  const run = Date.now().toString(36).toUpperCase();
  /** RN-117: the lot is generated; `supplierLot` is the supplier's. Returns the order folio and the lot. */
  const receive = async (supplierLot: string, expiration: string) => {
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
      // In the purchase unit: 1 bulto = 25 kg.
      lines: [{ lineId: null, itemId: flour, quantity: 1, unitPrice: 450 }],
    });
    po = await api.post(`purchase-orders/${po.id}/submit`, { version: po.version });
    po = await api.post(`purchase-orders/${po.id}/approve`, { version: po.version });
    const receipt = await api.post<{ lines: { lotNumber: string }[] }>('goods-receipts', {
      purchaseOrderId: po.id,
      poVersion: po.version,
      supplierInvoiceNumber: `F-${run}`,
      notes: null,
      lines: [
        {
          poLineId: po.lines[0].id,
          quantity: 1,
          supplierLotNumber: supplierLot,
          expirationDate: expiration,
        },
      ],
      warehouseId: rawMaterials,
    });
    return { folio: po.folio, lot: receipt.lines[0].lotNumber };
  };
  const { folio: oldOrderFolio, lot: oldLot } = await receive(`TZ-${run}-A`, day(2));
  await receive(`TZ-${run}-B`, day(3));

  let order = await api.post<{ id: string; folio: string; version: number }>('production-orders', {
    locationId: plant,
    outputItemId: donut,
    plannedQty: 1000,
    scheduledDate: day(),
    shift: 'Day',
    notes: 'E2E 24',
  });
  order = await api.post(`production-orders/${order.id}/release`, { version: order.version });
  // RN-49/RN-112: the ingredients reach the factory with the vouchers and the closes consume there.
  await api.sendIngredients(order.id);
  const close = (version: number, kind: 'Partial' | 'Final') =>
    api.post<{ order: { version: number } }>(`production-orders/${order.id}/closes`, {
      version,
      kind,
      producedQty: 500,
      shift: null,
      notes: null,
      shortfallReason: null,
      shortfallNotes: null,
      lines: null,
      consumptionWarehouseId: null,
      outputWarehouseId: null,
    });
  const first = await close(order.version, 'Partial');
  await close(first.order.version, 'Final');

  const fleet = await api.fleet();
  for (const sequence of ['01', '02']) {
    const lotNumber = `${order.folio}-${sequence}`;
    const lots = await api.get<{ id: string; lotNumber: string }[]>(
      `traceability/lots/lookup?q=${encodeURIComponent(lotNumber)}&itemId=${donut}`,
    );
    const lot = lots.find((l) => l.lotNumber === lotNumber);
    expect(lot, `lote ${lotNumber}`).toBeTruthy();
    const draft = await api.post<{ id: string; version: number }>('transfers', {
      fromLocationId: plant,
      toLocationId: branch,
      notes: 'E2E 24',
      lines: [{ itemId: donut, lotId: lot!.id, quantity: 500 }],
    });
    const sent = await api.post<{
      id: string;
      version: number;
      lines: { id: string; shippedQty: number }[];
    }>(`transfers/${draft.id}/dispatch`, {
      version: draft.version,
      ...fleet,
      lines: null,
      fromWarehouseId: factory,
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
 * search the OP, open the map, select the oldest flour and the lot of donuts it did not make is dimmed; Esc closes the
 * ficha and gives the focus back; at 1024 px the ficha of a card of the last lane opens on its left; at 390 px the
 * initial tab is Resumen, there is no horizontal scroll and the ficha is a bottom sheet; axe in light and dark with the
 * ficha open. **Moves inventory** in the database it runs against: receives 50 kg of flour (MP-001) on two OCs, puts the
 * other ingredients in their sub-warehouses, produces 1,000 donuts (PT-020-DONA) and sends them to SUC-001.
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
  await expect(consumption).toContainText('25 kg');
  await expect(consumption).toContainText('CP-');

  // Destino: the chain reaches the branch through lot -01; lot -02 (the new flour) stays dimmed.
  const newDonuts = card(page, `${scenario.orderFolio}-02`).first();
  await page.locator('app-trace-graph .controls').getByRole('radio', { name: 'Destino' }).click();
  await expect(newDonuts).toHaveCSS('opacity', '0.28');
  // One branch card per transfer: the one that received lot -01 is in the chain.
  const branchCards = card(page, base.branchName);
  await expect(branchCards.filter({ hasText: `${scenario.orderFolio}-01` })).toHaveCSS(
    'opacity',
    '1',
  );
  await expect(page.locator('.selection-bar')).toContainText(base.branch);
  await expect(page.locator('.selection-bar')).toContainText('500 pza enviadas');

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
  await expect(newDonuts).toHaveCSS('opacity', '1');

  // Tablet: the ficha of a card of the last lane opens on its left.
  await page.setViewportSize({ width: 1024, height: 768 });
  const branch = branchCards.first().getByRole('button');
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
  await expect(page.getByText(`${base.branch} · ${base.branchName}`)).toBeVisible();
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
