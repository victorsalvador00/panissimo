import { HttpTestingController } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../core/auth/auth.service';
import { provideHttpTesting, signIn } from '../../core/auth/testing';
import { HasPermissionDirective } from './has-permission.directive';

@Component({
  imports: [HasPermissionDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button *hasPermission="'purchasing.po.approve'" id="aprobar">Aprobar</button>
    <button id="ver">Ver</button>
  `,
})
class Host {}

describe('*hasPermission', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: provideHttpTesting() }));
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  async function render(): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('muestra el elemento con el permiso', async () => {
    signIn({ permissions: ['purchasing.po.approve'] });
    const el = await render();
    expect(el.querySelector('#aprobar')).not.toBeNull();
  });

  it('oculta el elemento sin el permiso', async () => {
    signIn({ permissions: ['purchasing.view'] });
    const el = await render();
    expect(el.querySelector('#aprobar')).toBeNull();
    expect(el.querySelector('#ver')).not.toBeNull();
  });

  it('reacciona al cambio de sesión', async () => {
    signIn({ permissions: ['purchasing.po.approve'] });
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('#aprobar')).not.toBeNull();

    TestBed.inject(AuthService).clearSession();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('#aprobar')).toBeNull();
  });
});
