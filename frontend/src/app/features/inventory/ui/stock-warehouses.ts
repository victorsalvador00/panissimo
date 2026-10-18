import { Signal, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { StockApi, WarehouseOption } from '../data-access/inventory-api';

/**
 * Sub-warehouses of a location where the user may move stock (RN-45). Empty when the location keeps its stock itself.
 * Call in an injection context (a field of the page).
 */
export function stockWarehouses(
  location: Signal<{ id: string } | null>,
): Signal<WarehouseOption[]> {
  const api = inject(StockApi);
  const warehouses = rxResource({
    params: () => location()?.id,
    stream: ({ params }) => api.warehouses(params),
    defaultValue: [],
  });
  return computed(() => warehouses.value().filter((w) => w.isActive && w.canMoveStock));
}
