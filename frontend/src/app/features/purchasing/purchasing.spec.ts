import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { provideHttpTesting, signIn } from '../../core/auth/testing';
import { provideAppLocale } from '../../core/i18n/locale';
import type { SupplierDto, SupplierItemDto } from './data-access/suppliers.api';
import { SupplierFormPage } from './pages/supplier-form-page';
import { creditLabel } from './pages/suppliers-list-page';
import { SupplierItemDialog, SupplierItemDialogData } from './ui/supplier-item-dialog';
import {
  daysValidator,
  isValidTaxId,
  pricePerBaseUnit,
  priceValidator,
  taxIdValidator,
} from './ui/supplier-validators';

function buildSupplier(overrides: Partial<SupplierDto> = {}): SupplierDto {
  return {
    id: 's1',
    taxId: 'HPM010203AB1',
    name: 'Harinera del Pacífico',
    contactName: 'Laura Pérez',
    phone: '6691234567',
    email: 'ventas@harinera.test',
    paymentTermsDays: 30,
    isActive: true,
    version: 4,
    ...overrides,
  };
}

function buildSupplierItem(overrides: Partial<SupplierItemDto> = {}): SupplierItemDto {
  return {
    id: 'si1',
    supplierId: 's1',
    itemId: 'har',
    sku: 'HAR-001',
    name: 'Harina de trigo',
    purchaseUomCode: 'caja',
    purchaseToBaseFactor: 25,
    baseUomCode: 'kg',
    taxRate: 0,
    tracksLots: true,
    supplierSku: 'HP-25',
    price: 412.5,
    leadTimeDays: 3,
    isPreferred: true,
    isActive: true,
    version: 2,
    ...overrides,
  };
}

const button = (root: ParentNode, text: string) =>
  Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);

function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

describe('proveedor: validaciones', () => {
  it('RFC de persona moral (12) y física (13), con fecha AAMMDD válida', () => {
    expect(isValidTaxId('HPM010203AB1')).toBe(true);
    expect(isValidTaxId('GODE561231GR8')).toBe(true);
    expect(isValidTaxId(' xaxx010101000 ')).toBe(true);
    expect(isValidTaxId('A&Ñ010203AB1')).toBe(true);
    expect(isValidTaxId('HPM000229AB1')).toBe(true); // 2000 es bisiesto
    expect(isValidTaxId('HPM010229AB1')).toBe(false);
    expect(isValidTaxId('HPM011301AB1')).toBe(false);
    expect(isValidTaxId('HPM010200AB1')).toBe(false);
    expect(isValidTaxId('HP010203AB1')).toBe(false);
    expect(isValidTaxId('HPM010203AB')).toBe(false);
  });

  it('el validador de RFC deja el vacío a `required`', () => {
    expect(taxIdValidator(new FormControl(''))).toBeNull();
    expect(taxIdValidator(new FormControl('HPM010203AB1'))).toBeNull();
    expect(taxIdValidator(new FormControl('12345'))).toEqual({ taxId: true });
  });

  it('precio ≥ 0 con hasta 4 decimales; días enteros de 0 a 365', () => {
    expect(priceValidator(new FormControl(null))).toEqual({ required: true });
    expect(priceValidator(new FormControl(-1))).toEqual({ min: true });
    expect(priceValidator(new FormControl(1.12345))).toEqual({ decimals: true });
    expect(priceValidator(new FormControl(0))).toBeNull();
    expect(priceValidator(new FormControl(412.5))).toBeNull();

    expect(daysValidator(new FormControl(null))).toEqual({ required: true });
    expect(daysValidator(new FormControl(1.5))).toEqual({ days: true });
    expect(daysValidator(new FormControl(366))).toEqual({ days: true });
    expect(daysValidator(new FormControl(0))).toBeNull();
    expect(daysValidator(new FormControl(365))).toBeNull();
  });

  it('precio por unidad base y etiqueta de crédito', () => {
    expect(pricePerBaseUnit(412.5, 25)).toBe(16.5);
    expect(pricePerBaseUnit(30, 1)).toBe(30);
    expect(creditLabel(0)).toBe('Contado');
    expect(creditLabel(30)).toBe('30 días');
  });
});

describe('SupplierFormPage', () => {
  let http: HttpTestingController;

  afterEach(() => {
    http.verify();
    document.querySelectorAll('.cdk-overlay-container').forEach((el) => (el.innerHTML = ''));
  });

  function setUp(permissions: string[]): void {
    TestBed.configureTestingModule({ providers: [...provideHttpTesting(), provideAppLocale()] });
    http = TestBed.inject(HttpTestingController);
    signIn({ permissions });
  }

  async function open(supplier: SupplierDto): Promise<ComponentFixture<SupplierFormPage>> {
    const fixture = TestBed.createComponent(SupplierFormPage);
    fixture.componentRef.setInput('id', supplier.id);
    fixture.detectChanges();
    http.expectOne(`/api/v1/suppliers/${supplier.id}`).flush(supplier);
    await fixture.whenStable();
    return fixture;
  }

  it('crea el proveedor con el RFC en mayúsculas y los opcionales vacíos como null', async () => {
    setUp(['purchasing.view', 'purchasing.suppliers.manage']);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(SupplierFormPage);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const inputs = el.querySelectorAll<HTMLInputElement>('form input');

    type(inputs[0], ' hpm010203ab1 ');
    type(inputs[1], 'Harinera del Pacífico');
    type(inputs[5], '15');
    button(el, 'Crear proveedor')!.click();
    await fixture.whenStable();

    const req = http.expectOne({ method: 'POST', url: '/api/v1/suppliers' });
    expect(req.request.body).toEqual({
      taxId: 'HPM010203AB1',
      name: 'Harinera del Pacífico',
      contactName: null,
      phone: null,
      email: null,
      paymentTermsDays: 15,
    });
    req.flush(buildSupplier({ paymentTermsDays: 15 }));
    expect(navigate).toHaveBeenCalledWith(['/compras/proveedores', 's1']);
  });

  it('no envía un RFC con formato inválido', async () => {
    setUp(['purchasing.view', 'purchasing.suppliers.manage']);
    const fixture = TestBed.createComponent(SupplierFormPage);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const inputs = el.querySelectorAll<HTMLInputElement>('form input');

    type(inputs[0], 'HPM011301AB1');
    type(inputs[1], 'Harinera');
    button(el, 'Crear proveedor')!.click();
    await fixture.whenStable();

    expect(el.textContent).toContain('El RFC no tiene un formato válido.');
    http.expectNone({ method: 'POST', url: '/api/v1/suppliers' });
  });

  it('al desactivar pide confirmación antes de guardar', async () => {
    setUp(['purchasing.view', 'purchasing.suppliers.manage']);
    const fixture = await open(buildSupplier());
    const el = fixture.nativeElement as HTMLElement;

    el.querySelector<HTMLButtonElement>('mat-slide-toggle button')!.click();
    await fixture.whenStable();
    button(el, 'Guardar cambios')!.click();
    await fixture.whenStable();

    const dialog = document.querySelector('mat-dialog-container')!;
    expect(dialog.textContent).toContain('Desactivar proveedor');
    expect(dialog.textContent).toContain('Dejará de ser el proveedor preferido de sus artículos');
    http.expectNone({ method: 'PUT' });

    button(dialog, 'Desactivar')!.click();
    // `afterClosed` se emite al terminar la animación de cierre.
    const req = await vi.waitFor(() =>
      http.expectOne({ method: 'PUT', url: '/api/v1/suppliers/s1' }),
    );
    expect(req.request.body).toMatchObject({ isActive: false, version: 4, taxId: 'HPM010203AB1' });
    req.flush(buildSupplier({ isActive: false, version: 5 }));
  });

  it('sin permiso de gestión el proveedor se ve en solo lectura', async () => {
    setUp(['purchasing.view']);
    const fixture = await open(buildSupplier());
    const el = fixture.nativeElement as HTMLElement;

    expect(button(el, 'Guardar cambios')).toBeUndefined();
    const inputs = Array.from(el.querySelectorAll<HTMLInputElement>('form input'));
    expect(inputs.length).toBeGreaterThan(0);
    expect(inputs.every((input) => input.disabled)).toBe(true);
    expect(inputs[0].value).toBe('HPM010203AB1');
  });
});

describe('SupplierItemDialog', () => {
  let http: HttpTestingController;
  const close = vi.fn();

  afterEach(() => {
    http.verify();
    close.mockReset();
  });

  async function open(row: SupplierItemDto | null) {
    TestBed.configureTestingModule({
      providers: [
        ...provideHttpTesting(),
        provideAppLocale(),
        { provide: MAT_DIALOG_DATA, useValue: { supplierId: 's1', row } as SupplierItemDialogData },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    signIn({ permissions: ['purchasing.view', 'purchasing.suppliers.manage'] });
    const fixture = TestBed.createComponent(SupplierItemDialog);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('muestra el precio por unidad base y guarda la edición con su versión', async () => {
    const { fixture, el } = await open(buildSupplierItem());
    expect(el.textContent).toContain('HAR-001 · Harina de trigo');
    expect(el.textContent).toContain('1 caja = 25 kg · $16.50 / kg');

    const price = el.querySelector<HTMLInputElement>('input[formcontrolname=price]')!;
    type(price, '450');
    await fixture.whenStable();
    expect(el.textContent).toContain('$18.00 / kg');

    button(el, 'Guardar')!.click();
    await fixture.whenStable();
    const req = http.expectOne({ method: 'PUT', url: '/api/v1/suppliers/s1/items/si1' });
    expect(req.request.body).toEqual({
      supplierSku: 'HP-25',
      price: 450,
      leadTimeDays: 3,
      isPreferred: true,
      isActive: true,
      version: 2,
    });
    const saved = buildSupplierItem({ price: 450, version: 3 });
    req.flush(saved);
    expect(close).toHaveBeenCalledWith(saved);
  });

  it('al desactivar el artículo deja de ser preferido', async () => {
    const { fixture, el } = await open(buildSupplierItem());
    const toggles = el.querySelectorAll<HTMLButtonElement>('mat-slide-toggle button');
    toggles[1].click(); // Activo → inactivo
    await fixture.whenStable();
    expect(toggles[0].disabled).toBe(true);

    button(el, 'Guardar')!.click();
    await fixture.whenStable();
    const req = http.expectOne({ method: 'PUT', url: '/api/v1/suppliers/s1/items/si1' });
    expect(req.request.body).toMatchObject({ isPreferred: false, isActive: false });
    req.flush(buildSupplierItem({ isPreferred: false, isActive: false }));
  });

  it('para agregar exige elegir un artículo', async () => {
    const { fixture, el } = await open(null);
    expect(el.textContent).toContain('Agregar artículo');
    type(el.querySelector<HTMLInputElement>('input[formcontrolname=price]')!, '100');
    button(el, 'Guardar')!.click();
    await fixture.whenStable();
    expect(el.textContent).toContain('Elige un artículo de la lista.');
    http.expectNone({ method: 'POST' });
    expect(close).not.toHaveBeenCalled();
  });
});
