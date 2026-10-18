import type { ApiEnum } from '../../../core/api/api';
import { enumLabel } from '../../../shared/pipes/labels';

type ItemType = ApiEnum<'ItemType'>;

/** RN-14: a recipe produces a semi-finished or finished good. */
export const OUTPUT_TYPES: readonly ItemType[] = ['SemiFinished', 'FinishedGood'];

/** Components: raw materials, supplies (packaging, labels…) or semi-finished goods; never a finished good. */
export const COMPONENT_TYPES: readonly ItemType[] = ['RawMaterial', 'Supply', 'SemiFinished'];

export const RECIPE_OUTPUT_TYPES = OUTPUT_TYPES.map((value) => ({
  value,
  label: enumLabel('ItemType', value),
}));

/** RN-10: saving a recipe already used by an order creates version N+1 instead of editing it. */
export function savesNewVersion(recipe: { isUsed: boolean } | null): boolean {
  return !!recipe?.isUsed;
}
