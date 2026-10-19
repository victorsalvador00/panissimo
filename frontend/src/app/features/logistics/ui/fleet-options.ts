import { Signal, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { Driver, FleetApi, Vehicle } from '../data-access/logistics-api';

export interface FleetOptions {
  vehicles: Signal<Vehicle[]>;
  drivers: Signal<Driver[]>;
}

const all = { page: 1, pageSize: 200 };

/**
 * RN-113: the active vehicles and drivers a dispatch chooses from. Call in an injection context (a field of the
 * component); a failed lookup counts as none.
 */
export function activeFleet(): FleetOptions {
  const api = inject(FleetApi);
  const vehicles = rxResource({
    stream: () => api.vehicles({ ...all, sort: 'description' }).pipe(map((page) => page.items)),
    defaultValue: [],
  });
  const drivers = rxResource({
    stream: () => api.drivers({ ...all, sort: 'name' }).pipe(map((page) => page.items)),
    defaultValue: [],
  });
  return {
    vehicles: computed(() => (vehicles.hasValue() ? vehicles.value() : [])),
    drivers: computed(() => (drivers.hasValue() ? drivers.value() : [])),
  };
}

/** What a dispatch keeps as its text copy (the backend builds the same). */
export const vehicleLabel = (v: Vehicle): string => `${v.description} · ${v.plate}`;
