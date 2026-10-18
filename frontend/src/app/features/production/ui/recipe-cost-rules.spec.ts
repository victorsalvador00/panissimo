import { describe, expect, it } from 'vitest';
import type { RecipeVersionCost } from '../data-access/production-api';
import { unitCostChangePct } from './recipe-cost-rules';

const version = (recipeVersion: number, unitCost: number): RecipeVersionCost => ({
  recipeId: `r${recipeVersion}`,
  recipeVersion,
  isActive: false,
  yieldQty: 100,
  totalCost: unitCost * 100,
  unitCost,
  increaseCount: 0,
  lines: [],
});

describe('unitCostChangePct', () => {
  // Newest first, as the API sends them.
  const versions = [version(3, 1.321), version(2, 1.121), version(1, 0)];

  it('compares each version with the one before it', () => {
    expect(unitCostChangePct(versions, 0)).toBe(17.8);
  });

  it('has no change for the first version or against a version without cost', () => {
    expect(unitCostChangePct(versions, 1)).toBeNull();
    expect(unitCostChangePct(versions, 2)).toBeNull();
  });
});
