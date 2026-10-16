import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Route, Routes } from '@angular/router';
import { provideHttpTesting, signIn } from '../auth/testing';
import { routes } from '../../app.routes';
import { HELP } from './help-content';
import { HelpButton } from './help-button';
import { routePattern } from './help.service';

/** Todos los patrones de ruta dentro del shell, cargando los módulos diferidos. */
async function shellPatterns(): Promise<string[]> {
  const patterns: string[] = [];
  const walk = async (list: Routes, prefix: string): Promise<void> => {
    for (const route of list) {
      const path = [prefix, route.path].filter(Boolean).join('/');
      if (route.loadChildren) {
        const children = (await (route.loadChildren as () => Promise<Routes>)()) as Routes;
        await walk(children, path);
      } else if (route.children) {
        await walk(route.children, path);
      } else if (!route.redirectTo) {
        patterns.push(path);
      }
    }
  };
  const shell = routes.find((r: Route) => r.path === '' && r.children)!;
  await walk(shell.children!, '');
  return patterns;
}

describe('manual de usuario', () => {
  it('toda pantalla del sistema tiene su ayuda', async () => {
    const missing = (await shellPatterns()).filter((pattern) => !HELP[pattern]);
    expect(missing).toEqual([]);
  });

  it('cada tema tiene título y descripción; los videos son .webm', () => {
    for (const [pattern, topic] of Object.entries(HELP)) {
      expect(topic.title, pattern).toBeTruthy();
      expect(topic.summary, pattern).toBeTruthy();
      if (topic.video) {
        expect(topic.video, pattern).toMatch(/^[a-z-]+\.webm$/);
      }
    }
  });

  it('el patrón de ruta junta las rutas configuradas sin parámetros resueltos', () => {
    const node = (path: string | undefined, child: ActivatedRouteSnapshot | null) =>
      ({
        routeConfig: path === undefined ? null : { path },
        firstChild: child,
      }) as ActivatedRouteSnapshot;
    const tree = node(undefined, node('', node('logistica', node('traspasos/:id/recibir', null))));

    expect(routePattern(tree)).toBe('logistica/traspasos/:id/recibir');
    expect(routePattern(node(undefined, node('', node('', null))))).toBe('');
  });
});

describe('HelpButton', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...provideHttpTesting()] });
    signIn({ permissions: [] });
  });

  it('abre el panel con la ayuda de la pantalla, deja de girar y cierra con Esc', async () => {
    const fixture = TestBed.createComponent(HelpButton);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const trigger = el.querySelector<HTMLButtonElement>('.sgo-help-fab')!;
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    trigger.click();
    await fixture.whenStable();

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.classList).toContain('sgo-help-fab-open');
    expect(el.querySelector('#sgo-help-title')?.textContent).toBe(HELP[''].title);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();

    expect(el.querySelector('#sgo-help-panel')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });
});
