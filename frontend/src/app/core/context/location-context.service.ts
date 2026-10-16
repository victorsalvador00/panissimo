import { computed, inject, Injectable, signal } from '@angular/core';
import type { MeLocationDto } from '../api/api-types';
import { AuthService } from '../auth/auth.service';

export const ACTIVE_LOCATION_STORAGE_KEY = 'sgo.activeLocationId';

/**
 * Ubicación activa (spec frontend §5): la elegida por el usuario (guardada en localStorage) si
 * sigue permitida; si no, su ubicación default; si no, la primera permitida.
 */
@Injectable({ providedIn: 'root' })
export class LocationContextService {
  private readonly auth = inject(AuthService);
  private readonly selectedId = signal<string | null>(readStored());

  readonly locations = computed<MeLocationDto[]>(
    () => this.auth.user()?.locations.filter((location) => location.isActive) ?? [],
  );

  readonly activeLocation = computed<MeLocationDto | null>(() => {
    const locations = this.locations();
    const find = (id: string | null | undefined) =>
      id ? locations.find((location) => location.id === id) : undefined;
    return (
      find(this.selectedId()) ?? find(this.auth.user()?.defaultLocationId) ?? locations[0] ?? null
    );
  });

  readonly activeLocationId = computed(() => this.activeLocation()?.id ?? null);

  /** Con una sola ubicación no hay nada que elegir. */
  readonly showSelector = computed(() => this.locations().length > 1);

  select(locationId: string): void {
    this.selectedId.set(locationId);
    try {
      localStorage.setItem(ACTIVE_LOCATION_STORAGE_KEY, locationId);
    } catch {
      // Almacenamiento no disponible (modo privado): la selección dura lo que dure la pestaña.
    }
  }
}

function readStored(): string | null {
  try {
    return localStorage.getItem(ACTIVE_LOCATION_STORAGE_KEY);
  } catch {
    return null;
  }
}
