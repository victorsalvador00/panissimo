import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideHttpTesting, signIn } from '../../core/auth/testing';
import { LocationContextService } from '../../core/context/location-context.service';
import { provideAppLocale } from '../../core/i18n/locale';
import type { DashboardDto } from './data-access/dashboard.api';
import { DashboardPage } from './pages/dashboard-page';
import { dashboardCards } from './ui/dashboard-cards';

function buildDashboard(overrides: Partial<DashboardDto> = {}): DashboardDto {
  return {
    locationId: 'com',
    inventory: { lowStock: 3, expiringLots: 2, expiredLots: 1, expirationAlertDays: 3 },
    transfers: { toReceive: 1, toDispatch: 4 },
    branchOrdersToApprove: 2,
    branchOrdersInProgress: 0,
    purchaseOrdersToApprove: 1,
    productionOrdersToday: 0,
    lowStockByLocation: null,
    ...overrides,
  };
}

const locations = [
  { id: 'com', code: 'COM', name: 'Comisariato', type: 'Commissary', isActive: true },
  { id: 'suc-01', code: 'SUC-01', name: 'Sucursal 01', type: 'Branch', isActive: true },
];

describe('tablero: tarjetas', () => {
  it('el origen ve despachar, aprobar pedidos y OC y producción; no la recepción', () => {
    const cards = dashboardCards(buildDashboard(), 'Commissary');
    expect(cards.map((c) => c.id)).toEqual([
      'lowStock',
      'expiringLots',
      'toDispatch',
      'ordersToApprove',
      'purchaseOrdersToApprove',
      'productionToday',
    ]);
    expect(cards.find((c) => c.id === 'toDispatch')).toMatchObject({
      count: 4,
      link: '/logistica/traspasos',
      queryParams: { pestana: 'por-despachar' },
    });
    expect(cards.find((c) => c.id === 'productionToday')!.queryParams).toEqual({
      estado: 'Released',
      fecha: 'hoy',
    });
    expect(cards.find((c) => c.id === 'expiringLots')!.detail).toBe('1 ya caducó');
  });

  it('la sucursal ve por recibir y sus pedidos en curso', () => {
    const cards = dashboardCards(buildDashboard(), 'Branch');
    expect(cards.map((c) => c.id)).toEqual([
      'lowStock',
      'expiringLots',
      'toReceive',
      'ordersInProgress',
    ]);
    expect(cards.find((c) => c.id === 'toReceive')!.queryParams).toEqual({
      pestana: 'en-transito',
    });
  });

  it('sin permiso (bloque en null) no hay tarjeta', () => {
    const cards = dashboardCards(
      buildDashboard({
        inventory: null,
        transfers: null,
        branchOrdersToApprove: null,
        purchaseOrdersToApprove: null,
        productionOrdersToday: null,
      }),
      'Commissary',
    );
    expect(cards).toEqual([]);
  });
});

describe('DashboardPage', () => {
  let http: HttpTestingController;

  // La ubicación elegida se guarda en localStorage: cada prueba empieza con la default.
  beforeEach(() => localStorage.clear());
  afterEach(() => http.verify());

  function setUp(permissions: string[]) {
    TestBed.configureTestingModule({ providers: [...provideHttpTesting(), provideAppLocale()] });
    http = TestBed.inject(HttpTestingController);
    signIn({ permissions, defaultLocationId: 'com', locations });
    const fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  /** Tarjeta del tablero por su etiqueta visible (su nombre accesible es el texto que se ve). */
  const cardByLabel = (el: HTMLElement, label: string) =>
    Array.from(el.querySelectorAll<HTMLAnchorElement>('a.card')).find(
      (card) => card.querySelector('.label')?.textContent?.trim() === label,
    )!;

  const expectDashboard = (locationId: string) =>
    http.expectOne(
      (req) => req.url === '/api/v1/dashboard' && req.params.get('locationId') === locationId,
    );

  it('cambia las tarjetas al cambiar la ubicación activa y enlaza a la lista filtrada', async () => {
    const { fixture, el } = setUp(['inventory.view', 'logistics.view']);
    expectDashboard('com').flush(
      buildDashboard({
        branchOrdersToApprove: null,
        branchOrdersInProgress: null,
        purchaseOrdersToApprove: null,
        productionOrdersToday: null,
      }),
    );
    await fixture.whenStable();
    const labels = () =>
      Array.from(el.querySelectorAll('.card .label')).map((l) => l.textContent?.trim());
    expect(labels()).toContain('Traspasos por despachar');
    const lowStock = cardByLabel(el, 'Artículos bajo mínimo');
    expect(lowStock.querySelector('.count')?.textContent?.trim()).toBe('3');
    expect(lowStock.getAttribute('href')).toBe('/inventario/existencias?bajoMinimo=1');
    expect(lowStock.classList).toContain('attention');

    TestBed.inject(LocationContextService).select('suc-01');
    TestBed.tick();
    expectDashboard('suc-01').flush(
      buildDashboard({
        locationId: 'suc-01',
        transfers: { toReceive: 0, toDispatch: 0 },
        branchOrdersToApprove: null,
        branchOrdersInProgress: null,
        purchaseOrdersToApprove: null,
        productionOrdersToday: null,
      }),
    );
    await fixture.whenStable();
    expect(labels()).toContain('Traspasos por recibir');
    expect(labels()).not.toContain('Traspasos por despachar');
    expect(cardByLabel(el, 'Traspasos por recibir').classList).not.toContain('attention');
  });

  it('la gráfica por ubicación solo llega con locations.all (y tiene tabla accesible)', async () => {
    // jsdom no dibuja en canvas: la gráfica se omite y queda la tabla accesible.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { fixture, el } = setUp(['inventory.view', 'locations.all']);
    expectDashboard('com').flush(
      buildDashboard({
        transfers: null,
        branchOrdersToApprove: null,
        branchOrdersInProgress: null,
        purchaseOrdersToApprove: null,
        productionOrdersToday: null,
        lowStockByLocation: [
          { locationId: 'com', locationCode: 'COM', locationName: 'Comisariato', count: 3 },
          { locationId: 'suc-01', locationCode: 'SUC-01', locationName: 'Sucursal 01', count: 0 },
        ],
      }),
    );
    await fixture.whenStable();
    expect(el.textContent).toContain('Artículos bajo mínimo por ubicación');
    const rows = Array.from(el.querySelectorAll('app-low-stock-chart tbody tr')).map((r) =>
      Array.from(r.children).map((cell) => cell.textContent?.trim()),
    );
    expect(rows).toEqual([
      ['COM · Comisariato', '3'],
      ['SUC-01 · Sucursal 01', '0'],
    ]);
  });

  it('sin indicadores para el rol lo dice; si falla, ofrece reintentar', async () => {
    const { fixture, el } = setUp([]);
    expectDashboard('com').flush('error', { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    expect(el.textContent).toContain('No se pudieron cargar los indicadores.');
    Array.from(el.querySelectorAll('button'))
      .find((b) => b.textContent?.trim() === 'Reintentar')!
      .click();
    TestBed.tick();
    expectDashboard('com').flush(
      buildDashboard({
        inventory: null,
        transfers: null,
        branchOrdersToApprove: null,
        branchOrdersInProgress: null,
        purchaseOrdersToApprove: null,
        productionOrdersToday: null,
      }),
    );
    await fixture.whenStable();
    expect(el.textContent).toContain('No hay indicadores para tu rol en esta ubicación.');
  });
});
