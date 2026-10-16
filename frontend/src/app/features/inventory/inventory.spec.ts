import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { QtyInput } from '../../shared/components/qty-input/qty-input';
import { toDateOnly } from '../../shared/forms/date-range';
import type { ItemOption } from '../../shared/data-access/item-lookup.service';
import type { AdjustmentReason } from './data-access/adjustments.api';
import type { LotStock, StockLevel } from './data-access/stock.api';
import { minMaxText } from './pages/stock-page';
import {
  AdjustmentLineValue,
  createAdjustmentLine,
  isEntry,
  signedQuantity,
  toAdjustmentRequest,
} from './ui/adjustment-lines';
import { lotState } from './ui/lot-list';

const flour: ItemOption = {
  id: 'har',
  sku: 'HAR-001',
  name: 'Harina',
  type: 'RawMaterial',
  baseUomCode: 'kg',
  tracksLots: true,
  shelfLifeDays: 180,
};
const sugar: ItemOption = {
  ...flour,
  id: 'azu',
  sku: 'AZU-001',
  name: 'Azúcar',
  tracksLots: false,
};

const line = (overrides: Partial<AdjustmentLineValue>): AdjustmentLineValue => ({
  item: sugar,
  quantity: 5,
  lotId: null,
  lotNumber: '',
  expirationDate: null,
  unitCost: null,
  ...overrides,
});

describe('ajuste: signo y armado de la petición', () => {
  it('en motivos de salida la cantidad capturada positiva se envía negativa', () => {
    expect(signedQuantity('Waste', 5)).toBe(-5);
    expect(signedQuantity('Expired', 2.5)).toBe(-2.5);
    expect(signedQuantity('Correction', 5)).toBe(5);
    expect(signedQuantity('Correction', -3)).toBe(-3);
  });

  it('solo la corrección positiva es entrada', () => {
    expect(isEntry('Correction', 1)).toBe(true);
    expect(isEntry('Correction', -1)).toBe(false);
    expect(isEntry('Waste', 1)).toBe(false);
  });

  it('merma de artículo con lote: lote elegido o FEFO, sin costo', () => {
    const request = toAdjustmentRequest({
      locationId: 'suc1',
      reason: 'Waste',
      notes: '  ',
      lines: [
        line({ item: flour, quantity: 3, lotId: 'lot-1', unitCost: 99 }),
        line({ item: flour, quantity: 1, lotId: null }),
      ],
    });

    expect(request).toEqual({
      locationId: 'suc1',
      reason: 'Waste',
      notes: null,
      lines: [
        {
          itemId: 'har',
          quantity: -3,
          lotId: 'lot-1',
          lotNumber: null,
          expirationDate: null,
          unitCost: null,
          notes: null,
        },
        {
          itemId: 'har',
          quantity: -1,
          lotId: null,
          lotNumber: null,
          expirationDate: null,
          unitCost: null,
          notes: null,
        },
      ],
    });
  });

  it('corrección positiva de artículo con lote: número de lote, caducidad y costo', () => {
    const request = toAdjustmentRequest({
      locationId: 'suc1',
      reason: 'Correction',
      notes: 'Conteo',
      lines: [
        line({
          item: flour,
          quantity: 10,
          lotId: 'ignorado',
          lotNumber: ' L-1 ',
          expirationDate: new Date(2026, 11, 31),
          unitCost: 14.5,
        }),
      ],
    });

    expect(request.lines[0]).toEqual({
      itemId: 'har',
      quantity: 10,
      lotId: null,
      lotNumber: 'L-1',
      expirationDate: '2026-12-31',
      unitCost: 14.5,
      notes: null,
    });
  });

  it('la línea exige lote en entradas de artículos con lote', () => {
    let reason: AdjustmentReason = 'Correction';
    const control = createAdjustmentLine(() => reason);
    control.patchValue({ item: flour, quantity: 4 });
    expect(control.hasError('lotRequired')).toBe(true);

    control.patchValue({ lotNumber: 'L-9' });
    expect(control.valid).toBe(true);

    reason = 'Waste';
    control.patchValue({ lotNumber: '' });
    expect(control.hasError('lotRequired')).toBe(false);
  });

  it('fecha sin corrimiento de zona horaria', () => {
    expect(toDateOnly(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
    expect(toDateOnly(null)).toBeNull();
  });
});

describe('existencias', () => {
  const lot = (overrides: Partial<LotStock>): LotStock => ({
    lotId: 'l1',
    lotNumber: 'L-1',
    expirationDate: '2026-10-01',
    daysToExpire: 5,
    isExpired: false,
    quantity: 3,
    ...overrides,
  });

  it('estado del lote: vencido, por caducar (según /alerts), vigente o sin caducidad', () => {
    const expiring = new Set(['l1']);
    expect(lotState(lot({ isExpired: true }), expiring)).toBe('expired');
    expect(lotState(lot({}), expiring)).toBe('expiring');
    expect(lotState(lot({}), new Set())).toBe('ok');
    expect(lotState(lot({ expirationDate: null, lotId: null }), new Set())).toBe('none');
  });

  it('mín/máx con unidad o guion', () => {
    const level = { minQty: 5, maxQty: 20, baseUomCode: 'kg' } as StockLevel;
    expect(minMaxText(level)).toBe('5 / 20 kg');
    expect(minMaxText({ ...level, minQty: null, maxQty: null })).toBe('—');
  });
});

@Component({
  imports: [QtyInput, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-qty-input [formControl]="control" [allowNegative]="allowNegative()" />`,
})
class SignedHost {
  readonly control = new FormControl<number | null>(-2);
  readonly allowNegative = signal(true);
}

describe('app-qty-input con signo variable', () => {
  it('revalida al cambiar allowNegative (ej. cambia el motivo del ajuste)', async () => {
    const fixture = TestBed.createComponent(SignedHost);
    await fixture.whenStable();
    const host = fixture.componentInstance;
    expect(host.control.valid).toBe(true);

    host.allowNegative.set(false);
    await fixture.whenStable();
    expect(host.control.hasError('qtyPositive')).toBe(true);
  });
});
