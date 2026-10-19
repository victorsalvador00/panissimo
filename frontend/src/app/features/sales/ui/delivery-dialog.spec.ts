import { FormControl, FormGroup } from '@angular/forms';
import { rejectionValidator } from './delivery-dialog';

const row = (value: {
  rejected: number;
  reason?: string | null;
  notes?: string;
  disposition?: string;
  warehouseId?: string | null;
}) =>
  new FormGroup({
    rejected: new FormControl<number | null>(value.rejected),
    reason: new FormControl(value.reason ?? null),
    notes: new FormControl(value.notes ?? '', { nonNullable: true }),
    disposition: new FormControl(value.disposition ?? 'Return', { nonNullable: true }),
    warehouseId: new FormControl(value.warehouseId ?? null),
  });

describe('rejectionValidator (RN-114)', () => {
  const check = (value: Parameters<typeof row>[0], needsWarehouse = true) =>
    rejectionValidator(needsWarehouse, 10)(row(value));

  it('accepts a line without rejection', () => expect(check({ rejected: 0 })).toBeNull());

  it('needs a reason, a note for "Otro" and the sub-warehouse it returns to', () => {
    expect(check({ rejected: 11, reason: 'Damaged' })).toEqual({ overShipped: true });
    expect(check({ rejected: 2 })).toEqual({ reason: true });
    expect(check({ rejected: 2, reason: 'Other', notes: ' ' })).toEqual({ notes: true });
    expect(check({ rejected: 2, reason: 'Damaged' })).toEqual({ warehouse: true });
    expect(check({ rejected: 2, reason: 'Damaged' }, false)).toBeNull();
    expect(check({ rejected: 2, reason: 'Damaged', disposition: 'Loss' })).toBeNull();
    expect(check({ rejected: 2, reason: 'Damaged', warehouseId: 'pt' })).toBeNull();
  });
});
