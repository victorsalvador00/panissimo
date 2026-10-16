import { APIRequestContext, expect } from '@playwright/test';
import { itemId } from './production';

interface Offers {
  offers: { supplierName: string; isPreferred: boolean }[];
}

/** RFC de persona moral único por corrida: 3 letras + fecha AAMMDD válida + homoclave. */
export function uniqueTaxId(prefix = 'EDE'): string {
  const now = new Date();
  const date = [now.getFullYear() % 100, now.getMonth() + 1, now.getDate()]
    .map((n) => String(n).padStart(2, '0'))
    .join('');
  const suffix = (Date.now() % 46_656).toString(36).toUpperCase().padStart(3, '0');
  return `${prefix}${date}${suffix}`;
}

/**
 * Asegura que el artículo tenga proveedor preferido (lo deja el E2E 09); si no, crea uno por API.
 * Devuelve el nombre del preferido.
 */
export async function ensurePreferredSupplier(
  api: APIRequestContext,
  sku: string,
): Promise<string> {
  const id = await itemId(api, sku);
  const current = (await (await api.get(`/api/v1/items/${id}/supplier-offers`)).json()) as Offers;
  const preferred = current.offers.find((offer) => offer.isPreferred);
  if (preferred) {
    return preferred.supplierName;
  }
  const taxId = uniqueTaxId();
  const name = `Proveedor E2E ${taxId}`;
  const created = await api.post('/api/v1/suppliers', {
    data: { taxId, name, contactName: null, phone: null, email: null, paymentTermsDays: 30 },
  });
  expect(created.ok()).toBe(true);
  const supplier = (await created.json()) as { id: string };
  const linked = await api.post(`/api/v1/suppliers/${supplier.id}/items`, {
    data: { itemId: id, supplierSku: null, price: 412.5, leadTimeDays: 3, isPreferred: true },
  });
  expect(linked.ok()).toBe(true);
  return name;
}
