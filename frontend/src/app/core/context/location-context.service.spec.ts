import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Schemas } from '../api/api';
import { AuthService } from '../auth/auth.service';
import { LocationContextService } from './location-context.service';

const location = (id: string, type: string, isActive = true): Schemas['MeLocationDto'] => ({
  id,
  code: id.toUpperCase(),
  name: id,
  type,
  isActive,
});

function signIn(defaultLocationId: string | null): void {
  TestBed.inject(AuthService).user.set({
    id: 'u1',
    email: 'a@b.mx',
    fullName: 'Ana',
    defaultLocationId,
    permissions: [],
    allLocations: false,
    locations: [
      location('planta', 'Plant'),
      location('planta-mp', 'Warehouse'),
      location('centro', 'Branch'),
      location('norte', 'Branch', false),
    ],
  });
}

describe('LocationContextService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  it('offers active plants and branches, without sub-warehouses', () => {
    signIn(null);
    const context = TestBed.inject(LocationContextService);
    expect(context.locations().map((l) => l.id)).toEqual(['planta', 'centro']);
    expect(context.plant()?.id).toBe('planta');
    expect(context.canChoose()).toBe(true);
  });

  it('starts on the default location and remembers the choice', () => {
    signIn('centro');
    const context = TestBed.inject(LocationContextService);
    expect(context.active()?.id).toBe('centro');

    context.setActive('planta');
    expect(context.active()?.id).toBe('planta');
    expect(localStorage.getItem(LocationContextService.storageKey)).toBe('planta');
  });

  it('ignores a stored location the user no longer has', () => {
    localStorage.setItem(LocationContextService.storageKey, 'norte');
    signIn(null);
    expect(TestBed.inject(LocationContextService).active()?.id).toBe('planta');
  });
});
