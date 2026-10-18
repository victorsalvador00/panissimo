import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { apiBaseInterceptor } from '../../../core/http/api-base.interceptor';
import { RoleFormPage } from './role-form-page';

const groups = [
  {
    module: 'Inventario',
    permissions: [
      { code: 'inventory.view', description: 'Ver inventario' },
      { code: 'inventory.adjust', description: 'Registrar ajustes' },
    ],
  },
];

async function setup(id?: string) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(withInterceptors([apiBaseInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  const fixture = TestBed.createComponent(RoleFormPage);
  if (id) fixture.componentRef.setInput('id', id);
  const backend = TestBed.inject(HttpTestingController);
  // The resources send their requests on the first render; whenStable waits for their answers.
  fixture.detectChanges();
  backend.expectOne('/api/v1/permissions').flush(groups);
  return { fixture, backend, element: fixture.nativeElement as HTMLElement };
}

const checkbox = (element: HTMLElement, label: string) =>
  [...element.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find((input) =>
    input.closest('mat-checkbox')?.textContent?.includes(label),
  )!;

describe('RoleFormPage', () => {
  it('the module checkbox grants or removes all of its permissions', async () => {
    const { fixture, element } = await setup();
    await fixture.whenStable();

    checkbox(element, 'Ver inventario').click();
    await fixture.whenStable();
    expect(checkbox(element, 'Inventario').indeterminate).toBe(true);

    checkbox(element, 'Inventario').click();
    await fixture.whenStable();
    expect(checkbox(element, 'Registrar ajustes').checked).toBe(true);
    expect(checkbox(element, 'Inventario').checked).toBe(true);

    checkbox(element, 'Inventario').click();
    await fixture.whenStable();
    expect(checkbox(element, 'Ver inventario').checked).toBe(false);
  });

  it('the Administrator role is read-only', async () => {
    const { fixture, backend, element } = await setup('admin-role');
    backend.expectOne('/api/v1/roles/admin-role').flush({
      id: 'admin-role',
      name: 'Administrador',
      description: 'Todo',
      isSystem: true,
      isAdministrator: true,
      permissions: ['inventory.view', 'inventory.adjust'],
      version: 1,
    });
    await fixture.whenStable();

    expect(element.textContent).toContain('siempre tiene todos los permisos');
    expect(checkbox(element, 'Ver inventario').disabled).toBe(true);
    expect(element.querySelector('button[type="submit"]')).toBeNull();
  });
});
