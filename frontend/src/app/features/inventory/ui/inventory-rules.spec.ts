import { documentLink } from '../../../shared/data-access/document-links';
import { reasonDirection } from './adjustment-rules';
import { daysToExpireText } from './expiry';

describe('inventory rules', () => {
  it('direction of the lines by reason', () => {
    expect(reasonDirection('Correction')).toBe('both');
    expect(reasonDirection('CustomerReturn')).toBe('in');
    expect(reasonDirection('Waste')).toBe('out');
    expect(reasonDirection('Expired')).toBe('out');
    expect(reasonDirection('Damaged')).toBe('out');
    expect(reasonDirection('InternalUse')).toBe('out');
  });

  it('days to expire in words', () => {
    expect(daysToExpireText(0)).toBe('vence hoy');
    expect(daysToExpireText(1)).toBe('en 1 día');
    expect(daysToExpireText(5)).toBe('en 5 días');
    expect(daysToExpireText(null)).toBe('');
  });

  it('links only to the documents that have a screen', () => {
    expect(documentLink('Adjustment', 'a1')).toEqual(['/inventario/ajustes', 'a1']);
    expect(documentLink('PhysicalCount', 'c1')).toEqual(['/inventario/conteos', 'c1']);
    expect(documentLink('ProductionClose', 'c1')).toEqual(['/produccion/cierres', 'c1']);
    expect(documentLink('GoodsReceipt', 'r1')).toEqual(['/compras/recepciones', 'r1']);
    expect(documentLink('CustomerShipment', 's1')).toBeNull();
    expect(documentLink('Unknown', 'x')).toBeNull();
  });
});
