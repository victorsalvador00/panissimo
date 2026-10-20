import type { ApiEnum } from '../../../core/api/api';
import type { ItemTypeFilter } from '../../../shared/components/item-picker/item-picker';
import { enumLabel } from '../../../shared/pipes/labels';

type ItemType = ApiEnum<'ItemType'>;
interface RecipeOutput {
  type: ItemType;
  presentation: ApiEnum<'ItemPresentation'> | null;
}

/** RN-14: a recipe produces a semi-finished or finished good. */
export const OUTPUT_TYPES: readonly ItemType[] = ['SemiFinished', 'FinishedGood'];

/** Components: raw materials, supplies (packaging, labels…) or semi-finished goods. */
export const COMPONENT_TYPES: readonly ItemType[] = ['RawMaterial', 'Supply', 'SemiFinished'];

/** RN-119: a packaged good is also made of bulk finished goods (its bulk good and its packaging). */
export function isPackaged(output: RecipeOutput | null | undefined): boolean {
  return output?.type === 'FinishedGood' && output.presentation === 'Packaged';
}

export function componentFilters(
  output: RecipeOutput | null | undefined,
): readonly ItemTypeFilter[] {
  return isPackaged(output)
    ? [...COMPONENT_TYPES, { type: 'FinishedGood', presentation: 'Bulk' }]
    : COMPONENT_TYPES;
}

export function componentLabel(output: RecipeOutput | null | undefined): string {
  return isPackaged(output)
    ? 'Materia prima, insumo, semiterminado o terminado a granel'
    : 'Materia prima, insumo o semiterminado';
}

export const RECIPE_OUTPUT_TYPES = OUTPUT_TYPES.map((value) => ({
  value,
  label: enumLabel('ItemType', value),
}));

/** RN-10: saving a recipe already used by an order creates version N+1 instead of editing it. */
export function savesNewVersion(recipe: { isUsed: boolean } | null): boolean {
  return !!recipe?.isUsed;
}
