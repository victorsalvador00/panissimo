import { NAVIGATION, visibleNavigation } from './navigation';

describe('visibleNavigation', () => {
  it('keeps only the allowed items and drops empty sections', () => {
    const granted = new Set(['inventory.view', 'logistics.view']);
    const can = (p: string | readonly string[]) =>
      typeof p === 'string' ? granted.has(p) : p.some((x) => granted.has(x));

    const sections = visibleNavigation(can);
    expect(sections.map((s) => s.label)).toEqual(['General', 'Inventario', 'Logística']);
    expect(sections[1].items.map((i) => i.label)).toEqual([
      'Existencias',
      'Kardex',
      'Análisis de consumo',
    ]);
  });

  it('accepts any permission of a list (requirement: purchasing or production)', () => {
    const sections = visibleNavigation(
      (p) => p === 'production.view' || (Array.isArray(p) && p.includes('production.view')),
    );
    expect(sections.find((s) => s.label === 'Compras')?.items.map((i) => i.label)).toEqual([
      'Requerimiento',
    ]);
  });

  it('gives every route a single menu entry', () => {
    const routes = NAVIGATION.flatMap((s) => s.items.map((i) => i.route));
    expect(new Set(routes).size).toBe(routes.length);
  });
});
