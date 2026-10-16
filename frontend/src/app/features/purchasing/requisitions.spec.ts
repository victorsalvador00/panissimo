import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpTesting, signIn } from '../../core/auth/testing';
import { provideAppDates } from '../../core/i18n/date-adapter';
import { provideAppLocale } from '../../core/i18n/locale';
import type { ItemOption } from '../../shared/data-access/item-lookup.service';
import type {
  PurchaseOrderListItem,
  RequisitionDto,
  RequisitionListItem,
} from './data-access/requisitions.api';
import type { ItemSupplierOffers } from './data-access/suppliers.api';
import { RequisitionDetailPage } from './pages/requisition-detail-page';
import { RequisitionFormPage } from './pages/requisition-form-page';
import { RequisitionsListPage } from './pages/requisitions-list-page';
import {
  createRequisitionLine,
  defaultSupplierId,
  estimatedTotal,
  requisitionActions,
  toRequisitionLines,
} from './ui/requisition-lines';

const flour: ItemOption = {
  id: 'har',
  sku: 'HAR-001',
  name: 'Harina de trigo',
  type: 'RawMaterial',
  baseUomCode: 'kg',
  tracksLots: true,
  shelfLifeDays: 180,
};

const flourOffers: ItemSupplierOffers = {
  itemId: 'har',
  sku: 'HAR-001',
  name: 'Harina de trigo',
  purchaseUomCode: 'caja',
  purchaseToBaseFactor: 25,
  baseUomCode: 'kg',
  offers: [
    {
      supplierId: 'pref',
      supplierName: 'Harinera',
      supplierItemId: 'si1',
      supplierSku: null,
      price: 400,
      leadTimeDays: 3,
      isPreferred: true,
    },
    {
      supplierId: 'cheap',
      supplierName: 'Molinos',
      supplierItemId: 'si2',
      supplierSku: null,
      price: 380,
      leadTimeDays: 5,
      isPreferred: false,
    },
  ],
};

function buildRequisition(overrides: Partial<RequisitionDto> = {}): RequisitionDto {
  return {
    id: 'r1',
    folio: 'REQ-000012',
    location: { id: 'com', code: 'COM', name: 'Comisariato' },
    neededBy: '2026-10-05',
    status: 'Submitted',
    notes: null,
    lines: [
      {
        id: 'l1',
        itemId: 'har',
        sku: 'HAR-001',
        itemName: 'Harina de trigo',
        purchaseUomCode: 'caja',
        quantity: 4,
        suggestedSupplier: { id: 'pref', name: 'Harinera' },
        estimatedPrice: 400,
      },
    ],
    submittedAt: '2026-09-28T16:00:00Z',
    submittedBy: 'u-1',
    submittedByName: null,
    approvedAt: null,
    approvedBy: null,
    approvedByName: null,
    rejectedAt: null,
    rejectedBy: null,
    rejectedByName: null,
    rejectionReason: null,
    convertedAt: null,
    convertedBy: null,
    convertedByName: null,
    purchaseOrders: [],
    createdAt: '2026-09-28T15:00:00Z',
    createdBy: 'u-1',
    createdByName: null,
    version: 3,
    ...overrides,
  };
}

const button = (root: ParentNode, text: string) =>
  Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);

const overlay = () => document.querySelector('.cdk-overlay-container')!;

function clearOverlays(): void {
  document.querySelectorAll('.cdk-overlay-container').forEach((el) => (el.innerHTML = ''));
}

describe('requisición: reglas', () => {
  it('acciones según estado y permisos', () => {
    const all = { manage: true, approve: true, convert: true };
    expect(requisitionActions('Draft', all)).toEqual({
      edit: true,
      submit: true,
      approve: false,
      reject: false,
      convert: false,
      cancel: true,
    });
    expect(requisitionActions('Submitted', all)).toMatchObject({
      approve: true,
      reject: true,
      edit: false,
      cancel: true,
    });
    expect(requisitionActions('Approved', all)).toMatchObject({ convert: true, cancel: true });
    for (const status of ['Converted', 'Rejected', 'Cancelled'] as const) {
      expect(Object.values(requisitionActions(status, all)).some(Boolean)).toBe(false);
    }
    const buyer = { manage: true, approve: false, convert: true };
    expect(requisitionActions('Submitted', buyer)).toMatchObject({ approve: false, cancel: true });
    const viewer = { manage: false, approve: false, convert: false };
    expect(Object.values(requisitionActions('Approved', viewer)).some(Boolean)).toBe(false);
  });

  it('proveedor por omisión: el elegido si aún vende el artículo; si no, el preferido', () => {
    expect(defaultSupplierId(null, flourOffers)).toBe('pref');
    expect(defaultSupplierId('cheap', flourOffers)).toBe('cheap');
    expect(defaultSupplierId('gone', flourOffers)).toBe('pref');
    expect(defaultSupplierId('cheap', undefined)).toBe('cheap');
    expect(defaultSupplierId(null, { ...flourOffers, offers: [flourOffers.offers[1]] })).toBeNull();
  });

  it('total estimado con el precio del proveedor elegido y líneas al request', () => {
    const lines = [
      { item: flour, quantity: 2, supplierId: 'cheap' },
      { item: flour, quantity: 1, supplierId: null },
      { item: null, quantity: 5, supplierId: null },
    ];
    expect(estimatedTotal(lines, new Map([['har', flourOffers]]))).toBe(760);
    expect(toRequisitionLines([lines[0], lines[1]])).toEqual([
      { itemId: 'har', quantity: 2, suggestedSupplierId: 'cheap' },
      { itemId: 'har', quantity: 1, suggestedSupplierId: null },
    ]);
  });
});

describe('RequisitionDetailPage', () => {
  let http: HttpTestingController;

  afterEach(() => {
    http.verify();
    clearOverlays();
  });

  async function open(
    permissions: string[],
    requisition = buildRequisition(),
  ): Promise<ComponentFixture<RequisitionDetailPage>> {
    TestBed.configureTestingModule({ providers: [...provideHttpTesting(), provideAppLocale()] });
    http = TestBed.inject(HttpTestingController);
    signIn({ permissions });
    const fixture = TestBed.createComponent(RequisitionDetailPage);
    fixture.componentRef.setInput('id', requisition.id);
    fixture.detectChanges();
    http.expectOne(`/api/v1/requisitions/${requisition.id}`).flush(requisition);
    await fixture.whenStable();
    return fixture;
  }

  it('quien aprueba ve Aprobar y Rechazar; el rechazo exige motivo', async () => {
    const fixture = await open(['purchasing.view', 'purchasing.po.approve']);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('$1,600.00');
    expect(button(el, 'Aprobar')).toBeDefined();
    expect(button(el, 'Cancelar requisición')).toBeUndefined();

    button(el, 'Rechazar')!.click();
    await fixture.whenStable();
    const dialog = overlay().querySelector('mat-dialog-container')!;
    button(dialog, 'Rechazar')!.click();
    await fixture.whenStable();
    expect(dialog.textContent).toContain('Escribe el motivo.');
    http.expectNone({ method: 'POST' });

    const reason = dialog.querySelector<HTMLTextAreaElement>('textarea')!;
    reason.value = '  Ya hay existencia suficiente ';
    reason.dispatchEvent(new Event('input'));
    button(dialog, 'Rechazar')!.click();
    const req = await vi.waitFor(() =>
      http.expectOne({ method: 'POST', url: '/api/v1/requisitions/r1/reject' }),
    );
    expect(req.request.body).toEqual({ version: 3, reason: 'Ya hay existencia suficiente' });
    req.flush(
      buildRequisition({
        status: 'Rejected',
        rejectedAt: '2026-09-28T17:00:00Z',
        rejectionReason: 'Ya hay existencia suficiente',
        version: 4,
      }),
    );
    await fixture.whenStable();
    expect(el.textContent).toContain('Motivo: Ya hay existencia suficiente');
    expect(button(el, 'Aprobar')).toBeUndefined();
  });

  it('solo consulta: sin acciones', async () => {
    const fixture = await open(['purchasing.view'], buildRequisition({ status: 'Approved' }));
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.state-actions')).toBeNull();
    expect(el.textContent).toContain('HAR-001 · Harina de trigo');
  });

  it('un borrador sin proveedor avisa antes de enviar', async () => {
    const draft = buildRequisition({ status: 'Draft', submittedAt: null });
    draft.lines = [{ ...draft.lines[0], suggestedSupplier: null, estimatedPrice: null }];
    const fixture = await open(['purchasing.view', 'purchasing.requisitions.manage'], draft);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Hay artículos sin proveedor sugerido');
    expect(el.textContent).toContain('Sin proveedor sugerido');
    expect(button(el, 'Enviar a aprobación')).toBeDefined();
    expect(el.textContent).toContain('Editar');
  });
});

describe('RequisitionFormPage', () => {
  let http: HttpTestingController;

  afterEach(() => http.verify());

  async function openNew() {
    TestBed.configureTestingModule({
      providers: [...provideHttpTesting(), provideAppLocale(), ...provideAppDates()],
    });
    http = TestBed.inject(HttpTestingController);
    signIn({
      permissions: ['purchasing.view', 'purchasing.requisitions.manage'],
      defaultLocationId: 'com',
      locations: [
        { id: 'com', code: 'COM', name: 'Comisariato', type: 'Commissary', isActive: true },
      ],
    });
    const fixture = TestBed.createComponent(RequisitionFormPage);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement, page: fixture.componentInstance };
  }

  it('al elegir el artículo trae sus proveedores, sugiere el preferido y calcula el importe', async () => {
    const { fixture, el, page } = await openNew();
    expect(el.textContent).toContain('COM · Comisariato');
    const line = page['form'].controls.lines.at(0);

    line.controls.item.setValue(flour);
    http.expectOne('/api/v1/items/har/supplier-offers').flush(flourOffers);
    line.controls.quantity.setValue(3);
    await fixture.whenStable();

    expect(line.controls.supplierId.value).toBe('pref');
    expect(el.textContent).toContain('$1,200.00');
    line.controls.supplierId.setValue('cheap');
    await fixture.whenStable();
    expect(el.textContent).toContain('$1,140.00');

    // Otra línea con el mismo artículo no vuelve a pedir las ofertas.
    page['form'].controls.lines.push(createRequisitionLine({ item: flour }));
    http.expectNone('/api/v1/items/har/supplier-offers');
  });

  it('guardar y enviar exige proveedor en todas las líneas', async () => {
    const { fixture, el, page } = await openNew();
    const line = page['form'].controls.lines.at(0);
    line.controls.item.setValue(flour);
    http
      .expectOne('/api/v1/items/har/supplier-offers')
      .flush({ ...flourOffers, offers: [flourOffers.offers[1]] });
    line.controls.quantity.setValue(2);
    await fixture.whenStable();
    expect(line.controls.supplierId.value).toBeNull();

    button(el, 'Guardar y enviar')!.click();
    await fixture.whenStable();
    expect(el.textContent).toContain('Para enviar, todas las líneas necesitan proveedor sugerido.');
    http.expectNone({ method: 'POST' });

    // Como borrador sí se guarda (el backend asigna el preferido si lo hay).
    button(el, 'Guardar borrador')!.click();
    const req = http.expectOne({ method: 'POST', url: '/api/v1/requisitions' });
    expect(req.request.body).toMatchObject({
      locationId: 'com',
      notes: null,
      lines: [{ itemId: 'har', quantity: 2, suggestedSupplierId: null }],
    });
    expect(req.request.body.neededBy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('RequisitionsListPage: convertir a OC', () => {
  let http: HttpTestingController;

  afterEach(() => {
    http.verify();
    clearOverlays();
  });

  const row = (overrides: Partial<RequisitionListItem>): RequisitionListItem => ({
    id: 'r1',
    folio: 'REQ-000012',
    location: { id: 'com', code: 'COM', name: 'Comisariato' },
    neededBy: '2026-10-05',
    status: 'Approved',
    lineCount: 2,
    createdAt: '2026-09-28T15:00:00Z',
    ...overrides,
  });

  it('elige las aprobadas, confirma, convierte y muestra las OC creadas', async () => {
    TestBed.configureTestingModule({ providers: [...provideHttpTesting(), provideAppLocale()] });
    http = TestBed.inject(HttpTestingController);
    signIn({ permissions: ['purchasing.view', 'purchasing.po.manage'] });
    const fixture = TestBed.createComponent(RequisitionsListPage);
    fixture.detectChanges();
    const list = () =>
      http.expectOne((req) => req.url === '/api/v1/requisitions' && req.method === 'GET');
    list().flush({
      items: [row({}), row({ id: 'r2', folio: 'REQ-000013', status: 'Submitted' })],
      page: 1,
      pageSize: 25,
      total: 2,
    });
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    const boxes = el.querySelectorAll<HTMLInputElement>('td.select-cell input');
    expect(boxes).toHaveLength(1);
    expect(boxes[0].getAttribute('aria-label')).toBe('Seleccionar REQ-000012');
    expect(button(el, 'shopping_cart_checkout Convertir a OC')!.disabled).toBe(true);

    boxes[0].click();
    await fixture.whenStable();
    button(el, 'shopping_cart_checkout Convertir a OC (1)')!.click();
    await fixture.whenStable();
    const confirm = overlay().querySelector('mat-dialog-container')!;
    expect(confirm.textContent).toContain('¿Convertir REQ-000012 en orden de compra?');
    button(confirm, 'Convertir a OC')!.click();

    const req = await vi.waitFor(() =>
      http.expectOne({ method: 'POST', url: '/api/v1/requisitions/convert' }),
    );
    expect(req.request.body).toEqual({ requisitionIds: ['r1'] });
    const order: PurchaseOrderListItem = {
      id: 'po1',
      folio: 'OC-000031',
      supplier: { id: 'pref', name: 'Harinera', taxId: 'HPM010203AB1' },
      deliveryLocation: { id: 'com', code: 'COM', name: 'Comisariato' },
      expectedDate: null,
      status: 'Draft',
      lineCount: 1,
      total: 1856,
      createdAt: '2026-09-28T18:00:00Z',
    };
    req.flush([order]);
    await vi.waitFor(() =>
      expect(overlay().textContent).toContain('Se creó 1 orden de compra en borrador'),
    );
    expect(overlay().textContent).toContain('OC-000031');
    expect(overlay().textContent).toContain('$1,856.00');
    list().flush({ items: [row({ status: 'Converted' })], page: 1, pageSize: 25, total: 1 });
    await fixture.whenStable();
    expect(el.querySelectorAll('td.select-cell input')).toHaveLength(0);
  });
});
