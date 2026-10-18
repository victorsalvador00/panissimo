import type { RecipeVersionCost } from '../data-access/production-api';

/**
 * Change of a version's unit cost against the previous version (versions come newest first): positive = more expensive.
 * Null for the first version or when the previous one costs nothing.
 */
export function unitCostChangePct(
  versions: readonly RecipeVersionCost[],
  index: number,
): number | null {
  const current = versions[index];
  const previous = versions[index + 1];
  if (!current || !previous || previous.unitCost <= 0) return null;
  return Math.round(((current.unitCost - previous.unitCost) / previous.unitCost) * 1000) / 10;
}
