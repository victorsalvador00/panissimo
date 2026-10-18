import { describe, expect, it } from 'vitest';
import type { ConsumptionAnalysisRow } from '../data-access/inventory-api';
import { suggestionDiffers } from './consumption-analysis-page';

const row = (over: Partial<ConsumptionAnalysisRow>): ConsumptionAnalysisRow => ({
  itemId: 'i',
  sku: 'DONA',
  name: 'Dona',
  baseUomCode: 'pza',
  total: 560,
  dailyAverage: 10,
  byWeekday: [10, 10, 10, 10, 10, 10, 10],
  trendPct: 50,
  currentMin: 5,
  currentMax: 15,
  suggestedMin: 20,
  suggestedMax: 70,
  ...over,
});

describe('suggestionDiffers', () => {
  it('offers to apply only when the suggestion is not what the location already has', () => {
    expect(suggestionDiffers(row({}))).toBe(true);
    expect(suggestionDiffers(row({ currentMin: null, currentMax: null }))).toBe(true);
    expect(suggestionDiffers(row({ currentMin: 20, currentMax: 70 }))).toBe(false);
  });
});
