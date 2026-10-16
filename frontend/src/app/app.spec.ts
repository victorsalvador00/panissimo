import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { provideHttpTesting, signIn } from './core/auth/testing';
import { provideAppLocale } from './core/i18n/locale';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [...provideHttpTesting(routes), provideAppLocale()],
    }).compileComponents();
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  async function open(url: string): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl(url);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('sin sesión muestra el login', async () => {
    const el = await open('/');
    expect(TestBed.inject(Router).url).toBe('/login');
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Bienvenido');
    expect(el.querySelector('button[type=submit]')?.textContent).toContain('Iniciar sesión');
  });

  it('con sesión muestra el shell con el menú filtrado por permisos', async () => {
    signIn({ permissions: ['inventory.view', 'logistics.view'] });

    const el = await open('/');

    expect(el.querySelector('.brand-name')?.textContent).toBe('SGO AR');
    expect(el.querySelector('main h1')?.textContent).toContain('Tablero');
    const menu = Array.from(el.querySelectorAll('nav a')).map((a) => a.textContent?.trim());
    expect(menu).toEqual([
      'dashboardTablero',
      'inventory_2Existencias',
      'receipt_longKardex',
      'shopping_cartPedidos',
      'local_shippingTraspasos',
    ]);
  });
});
