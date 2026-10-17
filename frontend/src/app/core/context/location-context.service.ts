import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';

/**
 * Active location (frontend §5): the plant or branch the operational screens work on. Kept per device in
 * localStorage `pan.location`; by default the user's DefaultLocationId. Production, sales and purchasing use the plant.
 */
@Injectable({ providedIn: 'root' })
export class LocationContextService {
  static readonly storageKey = 'pan.location';

  private readonly auth = inject(AuthService);
  private readonly chosenId = signal<string | null>(readStored());

  /** Plants and branches the user may work on (sub-warehouses are chosen inside each document). */
  readonly locations = computed(() =>
    (this.auth.user()?.locations ?? []).filter((l) => l.isActive && l.type !== 'Warehouse'),
  );

  readonly active = computed(() => {
    const locations = this.locations();
    const defaultId = this.auth.user()?.defaultLocationId;
    return (
      locations.find((l) => l.id === this.chosenId()) ??
      locations.find((l) => l.id === defaultId) ??
      locations[0] ??
      null
    );
  });

  readonly plant = computed(() => this.locations().find((l) => l.type === 'Plant') ?? null);

  /** The selector hides itself when there is nothing to choose. */
  readonly canChoose = computed(() => this.locations().length > 1);

  setActive(locationId: string): void {
    this.chosenId.set(locationId);
    try {
      localStorage.setItem(LocationContextService.storageKey, locationId);
    } catch {
      // Without storage the choice lasts for this session.
    }
  }
}

function readStored(): string | null {
  try {
    return localStorage.getItem(LocationContextService.storageKey);
  } catch {
    return null;
  }
}
