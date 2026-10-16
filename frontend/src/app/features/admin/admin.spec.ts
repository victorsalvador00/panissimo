import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { provideHttpTesting, signIn } from '../../core/auth/testing';
import { provideAppLocale } from '../../core/i18n/locale';
import { changeRows } from '../../shared/components/audit-panel/audit-changes-dialog';
import { generatePassword, meetsPasswordPolicy } from '../../shared/forms/password';
import { auditEntityLabel } from '../../shared/pipes/audit-labels';
import type { AppSetting } from './data-access/settings.api';
import { dayRange } from '../../shared/forms/date-range';
import { settingControl, settingError } from './pages/settings-page';
import { UserFormPage } from './pages/user-form-page';
import { moduleState, toggleModule } from './ui/permission-matrix';
import { defaultLocationAllowed, nextDefaultLocation } from './ui/user-form-validators';
import { userStatus } from './ui/user-status-tag';

describe('formulario de usuario: ubicación default', () => {
  const form = (locationIds: string[], defaultLocationId: string | null) =>
    new FormGroup(
      {
        locationIds: new FormControl(locationIds),
        defaultLocationId: new FormControl(defaultLocationId),
      },
      { validators: defaultLocationAllowed },
    );

  it('debe estar entre las permitidas', () => {
    expect(form(['a', 'b'], 'b').valid).toBe(true);
    expect(form(['a'], null).valid).toBe(true);
    expect(form(['a'], 'z').hasError('defaultNotAllowed')).toBe(true);
  });

  it('se conserva, se propone la única o se limpia al cambiar las permitidas', () => {
    expect(nextDefaultLocation('a', ['a', 'b'])).toBe('a');
    expect(nextDefaultLocation(null, ['c'])).toBe('c');
    expect(nextDefaultLocation('a', ['b', 'c'])).toBeNull();
    expect(nextDefaultLocation('a', [])).toBeNull();
  });

  it('estado del usuario', () => {
    expect(userStatus({ isActive: false, isLockedOut: true }).label).toBe('Inactivo');
    expect(userStatus({ isActive: true, isLockedOut: true })).toEqual({
      label: 'Bloqueado',
      color: 'red',
    });
    expect(userStatus({ isActive: true, isLockedOut: false }).label).toBe('Activo');
  });
});

describe('contraseñas generadas', () => {
  it('siempre cumplen la política del backend', () => {
    for (let i = 0; i < 200; i++) {
      const password = generatePassword();
      expect(meetsPasswordPolicy(password), password).toBe(true);
      expect(password).toHaveLength(12);
    }
  });

  it('la política rechaza contraseñas débiles', () => {
    expect(meetsPasswordPolicy('Corta1')).toBe(false);
    expect(meetsPasswordPolicy('sinmayusculas123')).toBe(false);
    expect(meetsPasswordPolicy('SinNumerosAqui')).toBe(false);
    expect(meetsPasswordPolicy('Correcta12345')).toBe(true);
  });
});

describe('matriz de permisos', () => {
  const group = {
    module: 'Inventario',
    permissions: [
      { code: 'inventory.view', description: 'Ver' },
      { code: 'inventory.adjust', description: 'Ajustar' },
    ],
  };

  it('estado del módulo: todos, algunos o ninguno', () => {
    expect(moduleState(group, new Set(['inventory.view', 'inventory.adjust']))).toBe('all');
    expect(moduleState(group, new Set(['inventory.view']))).toBe('some');
    expect(moduleState(group, new Set(['catalog.view']))).toBe('none');
  });

  it('marcar el módulo agrega todos sus permisos y conserva los de otros módulos', () => {
    expect(toggleModule(group, ['catalog.view', 'inventory.view'], true).sort()).toEqual([
      'catalog.view',
      'inventory.adjust',
      'inventory.view',
    ]);
    expect(toggleModule(group, ['catalog.view', 'inventory.view'], false)).toEqual([
      'catalog.view',
    ]);
  });
});

describe('configuración', () => {
  const setting: AppSetting = {
    key: 'inventory.expiration_alert_days',
    label: 'Días de alerta de caducidad',
    description: '',
    kind: 'Integer',
    min: 0,
    max: 365,
    decimals: 0,
    value: 3,
    version: 1,
    updatedAt: null,
    updatedBy: null,
    updatedByName: null,
  };

  it('respeta mínimo, máximo y decimales del backend', () => {
    const control = settingControl(setting);
    expect(control.valid).toBe(true);

    control.setValue(400);
    expect(settingError(control, setting)).toBe('Debe estar entre 0 y 365.');
    control.setValue(2.5);
    expect(settingError(control, setting)).toBe('Debe ser un número entero.');
    control.setValue(null);
    expect(settingError(control, setting)).toBe('Escribe un valor.');

    const money = settingControl({ ...setting, decimals: 2, max: 99999999 });
    money.setValue(1500.25);
    expect(money.valid).toBe(true);
    money.setValue(1500.255);
    expect(money.hasError('maxDecimals')).toBe(true);
  });
});

describe('bitácora', () => {
  it('rango de días completos en hora local', () => {
    const { from, to } = dayRange(new Date(2026, 8, 1, 15, 30), new Date(2026, 8, 2));
    expect(new Date(from!).getTime()).toBe(new Date(2026, 8, 1, 0, 0, 0, 0).getTime());
    expect(new Date(to!).getTime()).toBe(new Date(2026, 8, 2, 23, 59, 59, 999).getTime());
    expect(dayRange(null, null)).toEqual({ from: null, to: null });
  });

  it('muestra los cambios como filas legibles', () => {
    expect(
      changeRows({ FullName: 'Ana', IsActive: { old: true, new: false }, DefaultLocationId: null }),
    ).toEqual([
      { field: 'FullName', value: 'Ana' },
      { field: 'IsActive', value: 'true → false' },
      { field: 'DefaultLocationId', value: '—' },
    ]);
    expect(changeRows(null)).toEqual([]);
  });

  it('entidades en español; las desconocidas tal cual', () => {
    expect(auditEntityLabel('PurchaseOrder')).toBe('Orden de compra');
    expect(auditEntityLabel('Algo')).toBe('Algo');
  });
});

describe('UserFormPage (alta)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...provideHttpTesting(), provideAppLocale()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const branch = {
    id: 'suc3',
    code: 'SUC-03',
    name: 'Sucursal 03',
    type: 'Branch',
    isActive: true,
  };

  it('sin "Administrar roles" deshabilita los roles y crea el usuario', async () => {
    signIn({ permissions: ['security.users.manage'], locations: [branch], allLocations: false });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(UserFormPage);
    await fixture.whenStable();
    const page = fixture.componentInstance as unknown as {
      form: FormGroup;
      save: () => void;
    };

    expect(page.form.get('roleIds')!.disabled).toBe(true);
    http.expectNone('/api/v1/roles');

    page.form.patchValue({
      fullName: ' Ana Pérez ',
      email: 'ana@sgo.mx',
      password: 'Segura12345',
      locationIds: ['suc3'],
    });
    // Con una sola ubicación permitida se propone como default.
    expect(page.form.get('defaultLocationId')!.value).toBe('suc3');

    page.save();
    const req = http.expectOne('/api/v1/users');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      fullName: 'Ana Pérez',
      email: 'ana@sgo.mx',
      password: 'Segura12345',
      roleIds: [],
      locationIds: ['suc3'],
      defaultLocationId: 'suc3',
    });
    req.flush({ id: 'u9', fullName: 'Ana Pérez' });

    expect(navigate).toHaveBeenCalledWith(['/admin/usuarios', 'u9']);
  });

  it('no envía si falta información y marca los errores', async () => {
    signIn({ permissions: ['security.users.manage', 'security.roles.manage'] });
    const fixture = TestBed.createComponent(UserFormPage);
    fixture.detectChanges();
    http
      .expectOne((r) => r.url === '/api/v1/roles')
      .flush({ items: [], page: 1, pageSize: 100, total: 0 });
    await fixture.whenStable();
    const page = fixture.componentInstance as unknown as { form: FormGroup; save: () => void };

    page.form.patchValue({ fullName: 'Ana', email: 'no-es-correo', password: 'debil' });
    page.save();

    http.expectNone('/api/v1/users');
    expect(page.form.get('email')!.hasError('email')).toBe(true);
    expect(page.form.get('password')!.hasError('passwordPolicy')).toBe(true);
  });
});
