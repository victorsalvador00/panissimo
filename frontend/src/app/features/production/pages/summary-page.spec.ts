import { describe, expect, it } from 'vitest';
import type { SummaryRow } from '../data-access/production-api';
import { summaryLabel } from './summary-page';

const row = (over: Partial<SummaryRow>): SummaryRow => ({
  key: null,
  date: null,
  label: 'Hornos',
  sku: null,
  baseUomCode: 'pza',
  orders: 1,
  planned: 100,
  produced: 90,
  compliancePct: 90,
  producedCost: 10,
  wasteCost: 0,
  ...over,
});

describe('summaryLabel', () => {
  it('always names the unit: kg and pieces are separate rows', () => {
    expect(summaryLabel(row({}))).toBe('Hornos (pza)');
    expect(summaryLabel(row({ label: 'Masa', sku: 'MASA-01', baseUomCode: 'kg' }))).toBe(
      'MASA-01 Masa (kg)',
    );
    expect(summaryLabel(row({ date: '2026-10-18', label: '2026-10-18' }))).toBe('18/10/2026 (pza)');
  });
});
