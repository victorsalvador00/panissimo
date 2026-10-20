import type { ApiEnum } from '../../../core/api/api';
import { ENUM_LABELS } from '../../../shared/pipes/labels';

function options<K extends 'ItemType' | 'ItemPresentation' | 'StorageCondition'>(kind: K) {
  return Object.entries(ENUM_LABELS[kind]).map(([value, label]) => ({
    value: value as ApiEnum<K>,
    label: label as string,
  }));
}

export const ITEM_TYPE_OPTIONS = options('ItemType');
export const PRESENTATION_OPTIONS = options('ItemPresentation');
export const STORAGE_OPTIONS = options('StorageCondition');
export const TAX_OPTIONS = [
  { value: 0, label: '0 %' },
  { value: 0.16, label: '16 %' },
];

/** Semi-finished and finished goods are produced with a production order (ItemRules). */
export function isProduced(type: ApiEnum<'ItemType'> | null | undefined): boolean {
  return type === 'SemiFinished' || type === 'FinishedGood';
}
