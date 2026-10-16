import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { buildMe, provideHttpTesting } from '../testing';
import { LoginPage, safeReturnUrl } from './login-page';

describe('LoginPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideHttpTesting() });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(returnUrl?: string) {
    const fixture = TestBed.createComponent(LoginPage);
    if (returnUrl) {
      fixture.componentRef.setInput('returnUrl', returnUrl);
    }
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const type = (selector: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    type('input[type=email]', 'ana@sgo.mx');
    type('input[formcontrolname=password]', 'Secreta12345');
    el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    return { fixture, el };
  }

  it('muestra el mensaje del backend con credenciales inválidas', async () => {
    const { fixture, el } = await render();

    http
      .expectOne('/api/v1/auth/login')
      .flush(
        { detail: 'Correo o contraseña incorrectos.' },
        { status: 401, statusText: 'Unauthorized' },
      );
    await fixture.whenStable();

    expect(el.querySelector('[role=alert]')?.textContent).toContain(
      'Correo o contraseña incorrectos.',
    );
    expect(el.querySelector<HTMLButtonElement>('button[type=submit]')?.disabled).toBe(false);
  });

  it('al entrar va al returnUrl', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const { el } = await render('/inventario/kardex');

    expect(el.querySelector<HTMLButtonElement>('button[type=submit]')?.disabled).toBe(true);
    http.expectOne('/api/v1/auth/login').flush({ accessToken: 't', expiresIn: 900 });
    http.expectOne('/api/v1/me').flush(buildMe());

    expect(navigate).toHaveBeenCalledWith('/inventario/kardex');
  });

  it('solo acepta returnUrl internos', () => {
    expect(safeReturnUrl('/compras/ordenes')).toBe('/compras/ordenes');
    expect(safeReturnUrl('//evil.com')).toBe('/');
    expect(safeReturnUrl('https://evil.com')).toBe('/');
    expect(safeReturnUrl('/login')).toBe('/');
    expect(safeReturnUrl(undefined)).toBe('/');
  });
});
