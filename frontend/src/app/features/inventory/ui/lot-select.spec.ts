import { FormControl, FormGroup } from '@angular/forms';
import { LotLimits, lotLimitError } from './lot-select';

describe('lot limit of a line', () => {
  const limit = { lotNumber: 'OP-000017-01', quantity: 50, unit: 'pza' };

  it('rejects more than the stock of the chosen lot', () => {
    expect(lotLimitError(100, limit)?.['message']).toBe(
      'El lote OP-000017-01 solo tiene 50 pza en el origen.',
    );
    expect(lotLimitError(50, limit)).toBeNull();
    expect(lotLimitError(null, limit)).toBeNull();
    expect(lotLimitError(100, null)).toBeNull();
  });

  it('applies to the line only while it has a lot chosen', () => {
    const limits = new LotLimits();
    const line = new FormGroup({
      quantity: new FormControl<number | null>(100, limits.validator),
      lotId: new FormControl<string | null>('lot-1'),
    });
    limits.set(line, limit);
    expect(line.controls.quantity.invalid).toBe(true);
    expect(line.controls.quantity.touched).toBe(true);

    line.controls.lotId.setValue(null);
    line.controls.quantity.updateValueAndValidity();
    expect(line.controls.quantity.valid).toBe(true);
  });
});
