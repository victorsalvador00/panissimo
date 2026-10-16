import { HttpTestingController } from '@angular/common/http/testing';
import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpTesting, signIn } from '../../core/auth/testing';
import { provideAppDates } from '../../core/i18n/date-adapter';
import { provideAppLocale } from '../../core/i18n/locale';
import { StockPage } from '../inventory/pages/stock-page';
import { BranchOrdersListPage } from '../logistics/pages/branch-orders-list-page';
import { TransfersListPage } from '../logistics/pages/transfers-list-page';
import { ProductionOrdersListPage } from '../production/pages/production-orders-list-page';
import { PurchaseOrdersListPage } from '../purchasing/pages/purchase-orders-list-page';

/** Las tarjetas del tablero abren las listas con filtros en la URL (`withComponentInputBinding`). */
describe('listas con filtros desde el tablero', () => {
  let http: HttpTestingController;

  beforeEach(() => localStorage.clear());
  afterEach(() => http.verify());

  const empty = { items: [], page: 1, pageSize: 25, total: 0 };

  async function open<T>(
    component: Type<T>,
    permissions: string[],
    inputs: Record<string, string>,
    locationType = 'Commissary',
  ) {
    TestBed.configureTestingModule({
      providers: [...provideHttpTesting(), provideAppLocale(), ...provideAppDates()],
    });
    http = TestBed.inject(HttpTestingController);
    signIn({
      permissions,
      defaultLocationId: 'loc',
      locations: [
        { id: 'loc', code: 'LOC', name: 'Ubicación', type: locationType, isActive: true },
      ],
    });
    const fixture = TestBed.createComponent(component);
    Object.entries(inputs).forEach(([name, value]) => fixture.componentRef.setInput(name, value));
    fixture.detectChanges();
    TestBed.tick();
    return fixture;
  }

  /** La última petición a `url` (las anteriores, si las hubo, se cancelaron al cambiar el filtro). */
  function last(url: string) {
    const requests = http.match((req) => req.url === url);
    requests.slice(0, -1).forEach((req) => req.cancelled || req.flush(empty));
    return requests.at(-1)!;
  }

  it('traspasos: ?pestana=en-transito', async () => {
    await open(TransfersListPage, ['logistics.view', 'logistics.transfers.dispatch'], {
      pestana: 'en-transito',
    });
    const req = last('/api/v1/transfers');
    expect(req.request.params.get('status')).toBe('Dispatched');
    req.flush(empty);
  });

  it('pedidos: ?pestana=por-aprobar (solo con permiso de aprobar)', async () => {
    await open(BranchOrdersListPage, ['logistics.view', 'logistics.orders.approve'], {
      pestana: 'por-aprobar',
    });
    const req = last('/api/v1/branch-orders');
    expect(req.request.params.get('status')).toBe('Submitted');
    req.flush(empty);
  });

  it('OC: ?pestana=por-aprobar', async () => {
    await open(PurchaseOrdersListPage, ['purchasing.view', 'purchasing.po.approve'], {
      pestana: 'por-aprobar',
    });
    const req = last('/api/v1/purchase-orders');
    expect(req.request.params.get('status')).toBe('PendingApproval');
    req.flush(empty);
  });

  it('OP: ?estado=Released&fecha=hoy', async () => {
    const fixture = await open(ProductionOrdersListPage, ['production.view'], {
      estado: 'Released',
      fecha: 'hoy',
    });
    // El filtro del formulario se aplica tras un breve debounce.
    await new Promise((resolve) => setTimeout(resolve, 200));
    TestBed.tick();
    fixture.detectChanges();
    const req = last('/api/v1/production-orders');
    const now = new Date();
    const today = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
    expect(req.request.params.get('status')).toBe('Released');
    expect(req.request.params.get('from')).toBe(today);
    expect(req.request.params.get('to')).toBe(today);
    req.flush(empty);
  });

  it('existencias: ?bajoMinimo=1&porCaducar=1', async () => {
    const fixture = await open(StockPage, ['inventory.view'], { bajoMinimo: '1', porCaducar: '1' });
    const stock = last('/api/v1/stock');
    expect(stock.request.params.get('belowMin')).toBe('true');
    stock.flush(empty);
    http.expectOne((req) => req.url === '/api/v1/item-categories').flush(empty);
    http
      .expectOne((req) => req.url === '/api/v1/alerts')
      .flush({
        expirationAlertDays: 3,
        lowStock: [],
        expiringLots: [
          {
            locationId: 'loc',
            locationCode: 'LOC',
            itemId: 'har',
            sku: 'HAR-001',
            itemName: 'Harina',
            baseUomCode: 'kg',
            lotId: 'l1',
            lotNumber: 'L-1',
            expirationDate: '2026-10-04',
            quantity: 12.5,
            daysToExpire: -1,
            isExpired: true,
          },
        ],
      });
    await fixture.whenStable();
    const section = (fixture.nativeElement as HTMLElement).querySelector('.expiring')!;
    expect(section.textContent).toContain('Lotes por caducar');
    expect(section.textContent).toContain('Lote L-1');
    expect(section.textContent).toContain('caducado');
    expect(section.textContent).toMatch(/12\.5\s*kg/);
  });
});
