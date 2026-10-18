import { ENUM_LABELS, enumLabel, statusTone } from './labels';
import { formatMxn, formatQty } from './pipes';

describe('formats', () => {
  it('formats quantities in es-MX with up to 4 decimals and the unit', () => {
    expect(formatQty(12.5, 'kg')).toBe('12.5 kg');
    expect(formatQty(3200, 'pza')).toBe('3,200 pza');
    expect(formatQty(0.12345, 'kg')).toBe('0.1235 kg');
    expect(formatQty(2.0, 'l')).toBe('2 l');
    expect(formatQty(null, 'kg')).toBe('');
  });

  it('never shows decimals for pieces', () => {
    expect(formatQty(2.6, 'pza')).toBe('3 pza');
  });

  it('formats pesos', () => {
    expect(formatMxn(1234.5)).toBe('$1,234.50');
    expect(formatMxn(undefined)).toBe('');
    // Unit costs keep up to the decimals asked for, never fewer than two.
    expect(formatMxn(0.045, 4)).toBe('$0.045');
    expect(formatMxn(1.32145, 4)).toBe('$1.3215');
    expect(formatMxn(12, 4)).toBe('$12.00');
  });

  it('labels every enum value and keeps unknown ones visible', () => {
    expect(enumLabel('TransferStatus', 'Dispatched')).toBe('En tránsito');
    expect(enumLabel('ItemType', 'FinishedGood')).toBe('Producto terminado');
    expect(enumLabel('Shift', null)).toBe('');
    expect(enumLabel('TransferStatus', 'Lost' as never)).toBe('Lost');
    for (const labels of Object.values(ENUM_LABELS))
      for (const label of Object.values(labels)) expect(label.length).toBeGreaterThan(0);
  });

  it('colors statuses as frontend §4.2', () => {
    expect(statusTone('Draft')).toBe('grey');
    expect(statusTone('Released')).toBe('blue');
    expect(statusTone('Dispatched')).toBe('yellow');
    expect(statusTone('Received')).toBe('green');
    expect(statusTone('ReceivedWithDiscrepancies')).toBe('orange');
    expect(statusTone('Rejected')).toBe('red');
    expect(statusTone('Anything')).toBe('grey');
  });
});
