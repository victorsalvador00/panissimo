import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpTesting, signIn } from '../../core/auth/testing';
import { provideAppLocale } from '../../core/i18n/locale';
import { fromDateOnly, toDateOnly } from '../../shared/forms/date-range';
import type { ProductionOrderDto } from './data-access/production-orders.api';
import type { Explosion, ExplosionLine } from './data-access/recipes.api';
import { ProductionOrderCompletePage } from './pages/production-order-complete-page';
import {
  addLots,
  completionSummary,
  createCompleteLine,
  isProductionLocation,
  prefillActuals,
  toCompleteRequest,
} from './ui/production-order-lines';

const explosionLine = (overrides: Partial<ExplosionLine> = {}): ExplosionLine => ({
  componentItemId: 'har',
  sku: 'HAR-001',
  name: 'Harina',
  baseUomCode: 'kg',
  hasRecipe: false,
  quantityPerYield: 6,
  wastePct: 2.5,
  theoreticalQty: 4.92,
  available: 20,
  shortage: 0,
  averageCost: 12,
  estimatedCost: 59.04,
  ...overrides,
});

const buildOrder = (overrides: Partial<ProductionOrderDto> = {}): ProductionOrderDto => ({
  id: 'op1',
  folio: 'OP-000001',
  locationId: 'fab',
  locationCode: 'FAB',
  recipeId: 'r1',
  recipeVersion: 1,
  outputItemId: 'pan',
  outputSku: 'PAN-001',
  outputName: 'Pan de caja',
  outputUomCode: 'kg',
  outputTracksLots: true,
  plannedQty: 10,
  producedQty: null,
  scheduledDate: '2026-09-28',
  status: 'Released',
  notes: null,
  releasedAt: '2026-09-28T10:00:00Z',
  outputLotId: null,
  outputLotNumber: null,
  outputLotExpiration: null,
  unitCost: null,
  totalCost: null,
  totalWasteCost: null,
  completedAt: null,
  completedBy: null,
  completedByName: null,
  lines: [
    {
      id: 'l1',
      componentItemId: 'har',
      sku: 'HAR-001',
      name: 'Harina',
      baseUomCode: 'kg',
      theoreticalQty: 6.15,
      theoreticalProducedQty: null,
      actualQty: null,
      wasteQty: null,
      wasteCost: null,
      unitCost: null,
      totalCost: null,
      lots: [],
    },
  ],
  createdAt: '2026-09-28T09:00:00Z',
  createdBy: null,
  createdByName: null,
  version: 3,
  ...overrides,
});

const buildExplosion = (lines: ExplosionLine[], quantity: number): Explosion => ({
  recipeId: 'r1',
  outputItemId: 'pan',
  outputSku: 'PAN-001',
  outputName: 'Pan de caja',
  recipeVersion: 1,
  quantity,
  yieldQty: 10,
  locationId: 'fab',
  lines,
  canProduce: true,
  estimatedTotalCost: null,
  estimatedUnitCost: null,
});

describe('órdenes de producción: reglas de captura', () => {
  it('solo se produce en fábrica o comisariato (RN-14)', () => {
    expect(isProductionLocation('Factory')).toBe(true);
    expect(isProductionLocation('Commissary')).toBe(true);
    expect(isProductionLocation('Branch')).toBe(false);
    expect(isProductionLocation(null)).toBe(false);
  });

  it('la fecha programada viaja como yyyy-MM-dd sin corrimiento de zona', () => {
    const date = fromDateOnly('2026-09-28')!;
    expect(date.getDate()).toBe(28);
    expect(toDateOnly(date)).toBe('2026-09-28');
    expect(fromDateOnly(null)).toBeNull();
  });

  it('el teórico solo se lleva a las líneas que el usuario no cambió', () => {
    const lines = { har: createCompleteLine(), azu: createCompleteLine() };
    prefillActuals(lines, [
      { componentItemId: 'har', theoreticalQty: 6.15 },
      { componentItemId: 'azu', theoreticalQty: 0.8 },
    ]);
    expect(lines.har.controls.actualQty.value).toBe(6.15);

    lines.azu.controls.actualQty.setValue(1);
    lines.azu.controls.actualQty.markAsDirty();
    prefillActuals(lines, [
      { componentItemId: 'har', theoreticalQty: 4.92 },
      { componentItemId: 'azu', theoreticalQty: 0.64 },
    ]);
    expect(lines.har.controls.actualQty.value).toBe(4.92);
    expect(lines.azu.controls.actualQty.value).toBe(1);
  });

  it('el reparto por lotes debe sumar el consumo real, aunque éste cambie', () => {
    const line = createCompleteLine();
    addLots(line, ['lot1', 'lot2']);
    line.controls.actualQty.setValue(5);
    line.controls.lots.controls.manual.setValue(true);
    line.controls.lots.controls.lots.controls['lot1'].controls.quantity.setValue(3);
    line.controls.lots.controls.lots.controls['lot2'].controls.quantity.setValue(2);
    expect(line.valid).toBe(true);

    line.controls.actualQty.setValue(6);
    expect(line.hasError('lotsSum')).toBe(true);

    line.controls.lots.controls.manual.setValue(false);
    expect(line.valid).toBe(true);
  });

  it('manda los lotes solo en reparto manual y sin cantidades en cero', () => {
    expect(
      toCompleteRequest(3, 8, {
        har: {
          actualQty: 4.92,
          lots: {
            manual: true,
            lots: {
              lot1: { lotId: 'lot1', quantity: 4.92 },
              lot2: { lotId: 'lot2', quantity: 0 },
            },
          },
        },
        azu: { actualQty: 0.64, lots: { manual: false, lots: {} } },
      }),
    ).toEqual({
      version: 3,
      producedQty: 8,
      lines: [
        { componentItemId: 'har', actualQty: 4.92, lots: [{ lotId: 'lot1', quantity: 4.92 }] },
        { componentItemId: 'azu', actualQty: 0.64, lots: null },
      ],
    });
  });

  it('resume costo estimado, merma (real − teórico, RN-13) y faltantes', () => {
    const summary = completionSummary(
      [
        explosionLine(),
        explosionLine({
          componentItemId: 'azu',
          theoreticalQty: 0.64,
          available: 0.5,
          averageCost: 20,
        }),
      ],
      { har: 5.02, azu: 0.64 },
      8,
    );
    const har = summary.lines[0];
    expect(har.wasteQty).toBe(0.1);
    expect(har.wasteCost).toBe(1.2);
    expect(har.estimatedCost).toBe(60.24);
    expect(summary.lines[1].short).toBe(true);
    expect(summary.shortLines).toBe(1);
    expect(summary.estimatedTotalCost).toBe(73.04);
    expect(summary.estimatedUnitCost).toBe(9.13);
    expect(summary.wasteCost).toBe(1.2);
  });

  it('sin costo promedio no inventa costos', () => {
    const summary = completionSummary([explosionLine({ averageCost: null })], { har: 5 }, 8);
    expect(summary.lines[0].estimatedCost).toBeNull();
    expect(summary.estimatedTotalCost).toBe(0);
  });
});

describe('ProductionOrderCompletePage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [...provideHttpTesting(), provideAppLocale()] });
    http = TestBed.inject(HttpTestingController);
    signIn({ permissions: ['production.view', 'production.orders.complete'] });
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  async function open(): Promise<ComponentFixture<ProductionOrderCompletePage>> {
    const fixture = TestBed.createComponent(ProductionOrderCompletePage);
    fixture.componentRef.setInput('id', 'op1');
    fixture.detectChanges();
    http.expectOne('/api/v1/production-orders/op1').flush(buildOrder());
    http.expectOne('/api/v1/stock/fab/har/lots').flush([]);
    await explode(10, 6.15);
    return fixture;
  }

  /** Con relojes simulados `whenStable` no termina: avanza el reloj y corre la detección de cambios. */
  async function settle(): Promise<void> {
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(20);
    TestBed.tick();
  }

  async function explode(qty: number, theoretical: number): Promise<void> {
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    http
      .expectOne(
        (req) =>
          req.url === '/api/v1/recipes/r1/explode' &&
          req.params.get('qty') === String(qty) &&
          req.params.get('locationId') === 'fab',
      )
      .flush(buildExplosion([explosionLine({ theoreticalQty: theoretical })], qty));
    await settle();
  }

  const input = (el: HTMLElement, label: string) =>
    el.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;

  it('prellena el consumo con el teórico de lo producido y respeta lo corregido', async () => {
    const fixture = await open();
    const el = fixture.nativeElement as HTMLElement;
    const produced = el.querySelector<HTMLInputElement>('app-qty-input input')!;
    expect(produced.value).toBe('10');
    expect(input(el, 'Consumo real de HAR-001').value).toBe('6.15');

    produced.value = '8';
    produced.dispatchEvent(new Event('input'));
    await explode(8, 4.92);
    expect(input(el, 'Consumo real de HAR-001').value).toBe('4.92');

    const flour = input(el, 'Consumo real de HAR-001');
    flour.value = '5.02';
    flour.dispatchEvent(new Event('input'));
    await settle();
    expect(el.textContent).toContain('Merma 0.1');

    produced.value = '9';
    produced.dispatchEvent(new Event('input'));
    await explode(9, 5.535);
    expect(input(el, 'Consumo real de HAR-001').value).toBe('5.02');
  });
});
