import type { LocationLookup } from '../data-access/logistics-api';
import { lotsTotal, receiptNeedsReason, transferDestinations } from './transfer-rules';

const plant: LocationLookup = { id: 'p', code: 'PLANTA', name: 'Planta', type: 'Plant' };
const branchA: LocationLookup = { id: 'a', code: 'SUC-A', name: 'Sucursal A', type: 'Branch' };
const branchB: LocationLookup = { id: 'b', code: 'SUC-B', name: 'Sucursal B', type: 'Branch' };
const warehouse: LocationLookup = { id: 'w', code: 'PLANTA-PT', name: 'PT', type: 'Warehouse' };
const all = [plant, branchA, branchB, warehouse];

describe('transfer rules', () => {
  it('RN-25: without the special permission, only plant → branch', () => {
    expect(transferDestinations(plant, all, false).map((l) => l.id)).toEqual(['a', 'b']);
    expect(transferDestinations(branchA, all, false)).toEqual([]);
  });

  it('RN-25: with the special permission, also branch → branch and branch → plant; never itself nor a warehouse', () => {
    expect(transferDestinations(branchA, all, true).map((l) => l.id)).toEqual(['p', 'b']);
  });

  it('RN-22: a reason only when less than shipped arrives', () => {
    expect(receiptNeedsReason(3, 3)).toBe(false);
    expect(receiptNeedsReason(2, 3)).toBe(true);
    expect(receiptNeedsReason(0, 3)).toBe(true);
    expect(receiptNeedsReason(null, 3)).toBe(false);
  });

  it('adds the chosen lots with the API precision', () => {
    expect(lotsTotal([0.1, 0.2, null])).toBe(0.3);
    expect(lotsTotal([])).toBe(0);
  });
});
