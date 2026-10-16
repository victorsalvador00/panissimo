import { APIRequestContext, expect } from '@playwright/test';

/** Terminado de prueba de producción (E2E 07 y 08). Se crea si no existe. */
export const PRODUCT = 'E2E-PT';

export interface Named {
  id: string;
  code?: string;
  sku?: string;
}

async function json<T>(api: APIRequestContext, url: string): Promise<T> {
  const response = await api.get(url);
  expect(response.ok()).toBe(true);
  return (await response.json()) as T;
}

export async function itemId(api: APIRequestContext, sku: string): Promise<string> {
  const items = await json<Named[]>(api, `/api/v1/items/lookup?q=${sku}`);
  return items.find((item) => item.sku === sku)!.id;
}

export async function locationId(api: APIRequestContext, code: string): Promise<string> {
  const locations = await json<Named[]>(api, '/api/v1/locations/lookup');
  return locations.find((location) => location.code === code)!.id;
}

export async function ensureProduct(api: APIRequestContext): Promise<string> {
  const [existing] = await json<Named[]>(api, `/api/v1/items/lookup?q=${PRODUCT}`);
  if (existing) {
    return existing.id;
  }
  const categories = await json<{ items: Named[] }>(api, '/api/v1/item-categories');
  const units = await json<{ items: Named[] }>(api, '/api/v1/units-of-measure');
  const response = await api.post('/api/v1/items', {
    data: {
      sku: PRODUCT,
      name: 'Pan de prueba E2E',
      type: 'FinishedGood',
      categoryId: categories.items[0].id,
      baseUomId: units.items.find((u) => u.code === 'kg')!.id,
      purchaseUomId: null,
      purchaseToBaseFactor: null,
      tracksLots: true,
      shelfLifeDays: 3,
      storageCondition: 'Ambient',
      taxRate: 0,
    },
  });
  expect(response.ok()).toBe(true);
  return ((await response.json()) as Named).id;
}

/** Si el producto no tiene receta activa, crea una con HAR-001 y AZU-001 (rinde 10 kg). */
export async function ensureActiveRecipe(api: APIRequestContext, productId: string): Promise<void> {
  const active = await json<{ items: Named[] }>(api, `/api/v1/recipes?outputItemId=${productId}`);
  if (active.items.length) {
    return;
  }
  const response = await api.post('/api/v1/recipes', {
    data: {
      outputItemId: productId,
      yieldQty: 10,
      notes: 'E2E producción',
      lines: [
        { componentItemId: await itemId(api, 'HAR-001'), quantity: 6, wastePct: 2.5 },
        { componentItemId: await itemId(api, 'AZU-001'), quantity: 0.8, wastePct: 0 },
      ],
    },
  });
  expect(response.ok()).toBe(true);
}
