import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { MeLocationDto } from '../api/api-types';
import { provideHttpTesting, signIn } from '../auth/testing';
import { ACTIVE_LOCATION_STORAGE_KEY, LocationContextService } from './location-context.service';

const location = (id: string, isActive = true): MeLocationDto => ({
  id,
  code: id.toUpperCase(),
  name: `Ubicación ${id}`,
  type: 'Branch',
  isActive,
});

describe('LocationContextService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: provideHttpTesting() });
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('usa la ubicación default del usuario', () => {
    signIn({ locations: [location('a'), location('b')], defaultLocationId: 'b' });
    const context = TestBed.inject(LocationContextService);

    expect(context.activeLocationId()).toBe('b');
    expect(context.showSelector()).toBe(true);
  });

  it('respeta la elegida y la guarda en localStorage', () => {
    signIn({ locations: [location('a'), location('b')], defaultLocationId: 'a' });
    const context = TestBed.inject(LocationContextService);

    context.select('b');

    expect(context.activeLocationId()).toBe('b');
    expect(localStorage.getItem(ACTIVE_LOCATION_STORAGE_KEY)).toBe('b');
  });

  it('ignora una ubicación guardada que ya no está permitida', () => {
    localStorage.setItem(ACTIVE_LOCATION_STORAGE_KEY, 'z');
    signIn({ locations: [location('a'), location('b')], defaultLocationId: 'a' });

    expect(TestBed.inject(LocationContextService).activeLocationId()).toBe('a');
  });

  it('sin default usa la primera activa; con una sola oculta el selector', () => {
    signIn({ locations: [location('x', false), location('c')], defaultLocationId: null });
    const context = TestBed.inject(LocationContextService);

    expect(context.activeLocationId()).toBe('c');
    expect(context.showSelector()).toBe(false);
  });
});
