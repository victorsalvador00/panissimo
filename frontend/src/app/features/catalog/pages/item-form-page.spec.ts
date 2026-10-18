import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Schemas } from '../../../core/api/api';
import { AuthService } from '../../../core/auth/auth.service';
import { apiBaseInterceptor } from '../../../core/http/api-base.interceptor';
import { ItemFormPage } from './item-form-page';

const page = <T>(items: T[]) => ({ items, page: 1, pageSize: 100, total: items.length });

const bulk: Schemas['ItemDto'] = {
  id: 'bulk-1',
  sku: 'CONCHA-G',
  name: 'Concha a granel',
  type: 'FinishedGood',
  categoryId: 'cat-1',
  baseUomId: 'uom-pza',
  baseUomCode: 'pza',
  purchaseUomId: null,
  purchaseToBaseFactor: 1,
  tracksLots: true,
  shelfLifeDays: 3,
  storageCondition: 'Ambient',
  taxRate: 0,
  presentation: 'Bulk',
  bulkItemId: null,
  bulkItemSku: null,
  bulkItemName: null,
  unitsPerPackage: null,
  productionAreaId: 'area-1',
  productionMultiple: 12,
  unitWeightGrams: 70,
  isActive: true,
  createdAt: '2026-10-17T10:00:00Z',
  createdByName: 'Admin',
  updatedAt: null,
  updatedByName: null,
  version: 1,
  photoRevision: null,
};

async function setup(inputs: Record<string, string> = {}) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(withInterceptors([apiBaseInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  TestBed.inject(AuthService).user.set({
    id: 'u1',
    email: 'a@b.mx',
    fullName: 'Ana',
    defaultLocationId: null,
    permissions: ['catalog.view', 'catalog.manage'],
    allLocations: true,
    locations: [],
  });
  const fixture = TestBed.createComponent(ItemFormPage);
  for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
  fixture.detectChanges();
  const backend = TestBed.inject(HttpTestingController);
  backend.expectOne((r) => r.url === '/api/v1/item-categories').flush(page([]));
  backend.expectOne((r) => r.url === '/api/v1/units-of-measure').flush(page([]));
  backend.expectOne((r) => r.url === '/api/v1/production-areas').flush(page([]));
  // The form is protected: the tests reach it to drive the rules without clicking every select.
  const form = (fixture.componentInstance as unknown as { form: FormShape }).form;
  return { fixture, backend, form };
}

interface FormShape {
  controls: Record<string, { value: unknown; setValue(v: unknown): void }>;
  getRawValue(): Record<string, unknown>;
}

describe('ItemFormPage', () => {
  it('clears the fields that do not apply when the type or presentation changes', async () => {
    const { fixture, form } = await setup();
    await fixture.whenStable();

    form.controls['type'].setValue('FinishedGood');
    form.controls['presentation'].setValue('Packaged');
    form.controls['unitsPerPackage'].setValue(6);
    form.controls['productionAreaId'].setValue('area-1');

    form.controls['presentation'].setValue('Bulk');
    expect(form.controls['unitsPerPackage'].value).toBeNull();

    form.controls['type'].setValue('RawMaterial');
    expect(form.controls['presentation'].value).toBeNull();
    expect(form.controls['productionAreaId'].value).toBeNull();
  });

  it('a packaged version starts with the data of its bulk item', async () => {
    const { fixture, backend, form } = await setup({ granel: 'bulk-1' });
    backend.expectOne('/api/v1/items/bulk-1').flush(bulk);
    await fixture.whenStable();

    const value = form.getRawValue();
    expect(value['type']).toBe('FinishedGood');
    expect(value['presentation']).toBe('Packaged');
    expect((value['bulkItemId'] as { sku: string }).sku).toBe('CONCHA-G');
    expect(value['categoryId']).toBe('cat-1');
    expect(value['productionAreaId']).toBe('area-1');
    expect(value['sku']).toBe('');
    expect((fixture.nativeElement as HTMLElement).querySelector('h1')?.textContent).toContain(
      'Nueva versión empaquetada',
    );
  });
});
