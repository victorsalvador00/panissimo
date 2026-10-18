import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { apiBaseInterceptor } from '../../../core/http/api-base.interceptor';
import { Notifier } from '../../../core/http/notifier';
import { ConfirmService } from '../../../shared/components/confirm-summary/confirm-summary';
import { provideEsMxDates } from '../../../shared/forms/es-mx-date-adapter';
import { AdjustmentFormPage } from './adjustment-form-page';

const flour = {
  id: 'i1',
  sku: 'HARINA',
  name: 'Harina',
  type: 'RawMaterial' as const,
  presentation: null,
  baseUomCode: 'kg',
  tracksLots: true,
  shelfLifeDays: 180,
  productionAreaId: null,
};

interface Line {
  controls: Record<string, { setValue(v: unknown): void }>;
}
interface Page {
  form: {
    controls: {
      reason: { setValue(v: unknown): void };
      warehouseId: { setValue(v: unknown): void };
    };
  };
  lines: { at(i: number): Line };
  save(): Promise<void>;
}

const tick = () => new Promise((resolve) => setTimeout(resolve));

async function setup(warehouses: unknown[] = []) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      provideHttpClient(withInterceptors([apiBaseInterceptor])),
      provideHttpClientTesting(),
      provideEsMxDates(),
      { provide: ConfirmService, useValue: { confirm: () => Promise.resolve(true) } },
      { provide: Notifier, useValue: { info: vi.fn(), error: vi.fn() } },
    ],
  });
  TestBed.inject(AuthService).user.set({
    id: 'u1',
    email: 'a@b.mx',
    fullName: 'Ana',
    defaultLocationId: 'plant',
    permissions: ['inventory.adjust'],
    allLocations: false,
    locations: [{ id: 'plant', code: 'PLANTA', name: 'Planta', type: 'Plant', isActive: true }],
  });
  const fixture = TestBed.createComponent(AdjustmentFormPage);
  fixture.detectChanges();
  const backend = TestBed.inject(HttpTestingController);
  backend.expectOne('/api/v1/locations/plant/warehouses').flush(warehouses);
  await fixture.whenStable();
  return { fixture, backend, page: fixture.componentInstance as unknown as Page };
}

describe('AdjustmentFormPage', () => {
  it('sends exits negative, without cost, with the chosen lot', async () => {
    const { fixture, backend, page } = await setup();
    page.form.controls.reason.setValue('Waste');
    await fixture.whenStable();
    const line = page.lines.at(0);
    line.controls['itemId'].setValue(flour);
    line.controls['quantity'].setValue(2.5);
    line.controls['lotId'].setValue('lot-7');
    line.controls['unitCost'].setValue(99);

    const saving = page.save();
    await tick(); // the confirmation resolves first
    const request = backend.expectOne(
      (r) => r.method === 'POST' && r.url === '/api/v1/adjustments',
    );
    expect(request.request.body).toMatchObject({
      locationId: 'plant',
      reason: 'Waste',
      lines: [{ itemId: 'i1', quantity: -2.5, lotId: 'lot-7', unitCost: null, lotNumber: null }],
    });
    request.flush({ id: 'a1', folio: 'AJ-000009' });
    await saving;
  });

  it('a correction entry brings lot, expiry and cost; the stock location is the chosen sub-warehouse', async () => {
    const { fixture, backend, page } = await setup([
      {
        id: 'wh-mp',
        code: 'PLANTA-MP',
        name: 'Materias primas',
        parentLocationId: 'plant',
        isActive: true,
        canMoveStock: true,
      },
    ]);
    page.form.controls.warehouseId.setValue('wh-mp');
    await fixture.whenStable();
    const line = page.lines.at(0);
    line.controls['itemId'].setValue(flour);
    line.controls['direction'].setValue('in');
    line.controls['quantity'].setValue(10);
    line.controls['lotNumber'].setValue(' L-9 ');
    line.controls['expirationDate'].setValue(new Date(2027, 2, 15));
    line.controls['unitCost'].setValue(18.5);

    const saving = page.save();
    await tick(); // the confirmation resolves first
    const request = backend.expectOne(
      (r) => r.method === 'POST' && r.url === '/api/v1/adjustments',
    );
    expect(request.request.body).toMatchObject({
      locationId: 'wh-mp',
      reason: 'Correction',
      lines: [
        {
          quantity: 10,
          lotId: null,
          lotNumber: 'L-9',
          expirationDate: '2027-03-15',
          unitCost: 18.5,
        },
      ],
    });
    request.flush({ id: 'a2', folio: 'AJ-000010' });
    await saving;
  });

  it('does not send without the sub-warehouse when the location has them', async () => {
    const { fixture, backend, page } = await setup([
      {
        id: 'wh-mp',
        code: 'PLANTA-MP',
        name: 'Materias primas',
        parentLocationId: 'plant',
        isActive: true,
        canMoveStock: true,
      },
    ]);
    await fixture.whenStable();
    const line = page.lines.at(0);
    line.controls['itemId'].setValue(flour);
    line.controls['quantity'].setValue(1);

    await page.save();
    backend.expectNone((r) => r.method === 'POST');
  });
});
