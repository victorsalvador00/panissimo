import { Route, Routes } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { routes } from '../../app.routes';
import { HELP } from './help-content';

/** Every route pattern of the app, lazy children included (`**` and redirects have no screen). */
async function patterns(list: Routes, parent = ''): Promise<string[]> {
  const found: string[] = [];
  for (const route of list as Route[]) {
    if (route.path === '**' || route.redirectTo !== undefined) continue;
    const pattern = [parent, route.path].filter(Boolean).join('/');
    if (route.component || route.loadComponent) found.push(pattern);
    if (route.children) found.push(...(await patterns(route.children, pattern)));
    if (route.loadChildren) {
      const loaded = (await (route.loadChildren as () => Promise<Routes>)()) as Routes;
      found.push(...(await patterns(loaded, pattern)));
    }
  }
  return found;
}

describe('ayuda contextual', () => {
  it('toda ruta tiene ayuda (frontend §4.3)', async () => {
    const all = await patterns(routes);
    expect(all.length).toBeGreaterThan(80);
    const missing = all.filter((p) => !HELP[p]);
    expect(missing, `Rutas sin ayuda:\n${missing.join('\n')}`).toEqual([]);
  });

  it('no hay ayuda de rutas que no existen', async () => {
    const all = new Set(await patterns(routes));
    expect(Object.keys(HELP).filter((key) => !all.has(key))).toEqual([]);
  });

  it('cada tema dice qué es la pantalla', () => {
    for (const [pattern, topic] of Object.entries(HELP)) {
      expect(topic.title, pattern).not.toBe('');
      expect(topic.summary.length, pattern).toBeGreaterThan(20);
    }
  });
});
