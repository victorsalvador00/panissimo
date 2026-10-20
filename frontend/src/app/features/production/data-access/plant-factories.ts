import { computed, inject, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { LocationContextService } from '../../../core/context/location-context.service';
import { StockApi, WarehouseOption } from '../../inventory/data-access/inventory-api';

/**
 * RN-49: the active factories of the plant in context, for the filters by factory of production. Empty while loading
 * or when the plant has none. Call it in an injection context.
 */
export function plantFactories(): Signal<WarehouseOption[]> {
  const plant = inject(LocationContextService).plant;
  const stockApi = inject(StockApi);
  const warehouses = rxResource({
    params: () => plant()?.id,
    stream: ({ params }) => stockApi.warehouses(params),
    defaultValue: [],
  });
  return computed(() => warehouses.value().filter((w) => w.type === 'Factory' && w.isActive));
}
