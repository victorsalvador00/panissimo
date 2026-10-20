import {
  COMPONENT_TYPES,
  OUTPUT_TYPES,
  componentFilters,
  componentLabel,
  savesNewVersion,
} from './recipe-rules';

describe('recipe rules', () => {
  it('RN-14: a recipe produces semi-finished or finished goods', () => {
    expect(OUTPUT_TYPES).toEqual(['SemiFinished', 'FinishedGood']);
  });

  it('components are raw materials, supplies or semi-finished goods', () => {
    expect(COMPONENT_TYPES).toContain('Supply');
    expect(COMPONENT_TYPES).not.toContain('FinishedGood');
    expect(componentFilters({ type: 'FinishedGood', presentation: 'Bulk' })).toEqual(
      COMPONENT_TYPES,
    );
    expect(componentFilters({ type: 'SemiFinished', presentation: null })).toEqual(COMPONENT_TYPES);
    expect(componentFilters(null)).toEqual(COMPONENT_TYPES);
  });

  it('RN-119: a packaged good may also use bulk finished goods', () => {
    const packaged = { type: 'FinishedGood', presentation: 'Packaged' } as const;
    expect(componentFilters(packaged)).toEqual([
      ...COMPONENT_TYPES,
      { type: 'FinishedGood', presentation: 'Bulk' },
    ]);
    expect(componentLabel(packaged)).toContain('terminado a granel');
    expect(componentLabel(null)).toBe('Materia prima, insumo o semiterminado');
  });

  it('RN-10: only a used version is saved as N+1', () => {
    expect(savesNewVersion({ isUsed: true })).toBe(true);
    expect(savesNewVersion({ isUsed: false })).toBe(false);
    expect(savesNewVersion(null)).toBe(false);
  });
});
