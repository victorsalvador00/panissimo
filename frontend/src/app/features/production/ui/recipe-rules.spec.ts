import { COMPONENT_TYPES, OUTPUT_TYPES, savesNewVersion } from './recipe-rules';

describe('recipe rules', () => {
  it('RN-14: a recipe produces semi-finished or finished goods', () => {
    expect(OUTPUT_TYPES).toEqual(['SemiFinished', 'FinishedGood']);
  });

  it('components are raw materials, supplies or semi-finished goods, never finished goods', () => {
    expect(COMPONENT_TYPES).toContain('Supply');
    expect(COMPONENT_TYPES).not.toContain('FinishedGood');
  });

  it('RN-10: only a used version is saved as N+1', () => {
    expect(savesNewVersion({ isUsed: true })).toBe(true);
    expect(savesNewVersion({ isUsed: false })).toBe(false);
    expect(savesNewVersion(null)).toBe(false);
  });
});
