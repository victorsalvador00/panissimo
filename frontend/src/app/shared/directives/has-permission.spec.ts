import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Schemas } from '../../core/api/api';
import { AuthService } from '../../core/auth/auth.service';
import { HasPermission } from './has-permission';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HasPermission],
  template: `
    <button *hasPermission="'catalog.manage'" id="edit">Editar</button>
    <button *hasPermission="['purchasing.po.approve', 'purchasing.po.manage']" id="po">OC</button>
  `,
})
class Host {}

function permissions(list: string[]): Schemas['MeDto'] {
  return {
    id: 'u1',
    email: 'a@b.mx',
    fullName: 'Ana',
    defaultLocationId: null,
    permissions: list,
    allLocations: false,
    locations: [],
  };
}

describe('HasPermission', () => {
  it('shows and hides the element as the permissions change', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const auth = TestBed.inject(AuthService);
    const fixture = TestBed.createComponent(Host);
    const element = fixture.nativeElement as HTMLElement;

    await fixture.whenStable();
    expect(element.querySelector('#edit')).toBeNull();
    expect(element.querySelector('#po')).toBeNull();

    auth.user.set(permissions(['catalog.manage', 'purchasing.po.manage']));
    await fixture.whenStable();
    expect(element.querySelector('#edit')).not.toBeNull();
    expect(element.querySelector('#po')).not.toBeNull();

    auth.user.set(permissions(['purchasing.po.manage']));
    await fixture.whenStable();
    expect(element.querySelector('#edit')).toBeNull();
    expect(element.querySelectorAll('#po').length).toBe(1);
  });
});
