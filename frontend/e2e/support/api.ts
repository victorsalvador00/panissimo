import { APIRequestContext, Page, expect, request } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { base } from './base-data';
import { Credentials, adminCredentials } from './env';

const apiBase = '/api/v1';

/** Backend calls as the admin, to prepare the data a test needs. */
export class AdminApi {
  private constructor(
    private readonly context: APIRequestContext,
    private readonly token: string,
  ) {}

  static async create(baseURL: string): Promise<AdminApi> {
    const context = await request.newContext({ baseURL });
    const response = await context.post(`${apiBase}/auth/login`, { data: adminCredentials() });
    expect(response.ok(), 'login del admin para preparar datos').toBeTruthy();
    const { accessToken } = (await response.json()) as { accessToken: string };
    return new AdminApi(context, accessToken);
  }

  async get<T>(path: string): Promise<T> {
    const response = await this.context.get(`${apiBase}/${path}`, { headers: this.headers() });
    expect(response.ok(), `GET ${path}`).toBeTruthy();
    return (await response.json()) as T;
  }

  async post<T>(path: string, data: unknown): Promise<T> {
    const response = await this.context.post(`${apiBase}/${path}`, {
      headers: this.headers(),
      data,
    });
    expect(response.ok(), `POST ${path}: ${await response.text()}`).toBeTruthy();
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  async put<T>(path: string, data: unknown): Promise<T> {
    const response = await this.context.put(`${apiBase}/${path}`, {
      headers: this.headers(),
      data,
    });
    expect(response.ok(), `PUT ${path}: ${await response.text()}`).toBeTruthy();
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  /**
   * A user with one system role and the given locations; created the first time and with a fresh temporary password
   * on every run, so the test can sign in. Does not move inventory.
   */
  async ensureUser(
    email: string,
    fullName: string,
    roleName: string,
    locationCodes: string[],
  ): Promise<Credentials> {
    const password = `E2e${randomBytes(9).toString('base64url')}9`;
    const roles = await this.get<{ items: { id: string; name: string }[] }>('roles?pageSize=100');
    const role = roles.items.find((r) => r.name === roleName);
    expect(role, `rol ${roleName}`).toBeTruthy();
    const locations = await this.get<{ id: string; code: string }[]>('locations/lookup');
    const locationIds = locationCodes.map((code) => {
      const location = locations.find((l) => l.code === code);
      expect(location, `ubicación ${code}`).toBeTruthy();
      return location!.id;
    });

    const existing = await this.get<{ items: { id: string; email: string; isActive: boolean }[] }>(
      `users?q=${encodeURIComponent(email)}&pageSize=5`,
    );
    const user = existing.items.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      await this.post('users', {
        email,
        fullName,
        password,
        roleIds: [role!.id],
        locationIds,
        defaultLocationId: null,
      });
      return { email, password };
    }
    const current = await this.get<{ version: number }>(`users/${user.id}`);
    const updated = await this.context.put(`${apiBase}/users/${user.id}`, {
      headers: this.headers(),
      data: {
        version: current.version,
        fullName,
        roleIds: [role!.id],
        locationIds,
        defaultLocationId: null,
      },
    });
    expect(updated.ok(), `PUT users/${user.id}`).toBeTruthy();
    if (!user.isActive) {
      const { version } = (await updated.json()) as { version: number };
      await this.post(`users/${user.id}/activate`, { version });
    }
    await this.post(`users/${user.id}/reset-password`, { newPassword: password });
    return { email, password };
  }

  /** Id of an item of the base catalogs (support/base-data.ts); fails if it is missing. */
  async itemId(sku: string): Promise<string> {
    const found = await this.get<{ id: string; sku: string }[]>(
      `items/lookup?q=${encodeURIComponent(sku)}`,
    );
    const item = found.find((i) => i.sku === sku);
    expect(item, `artículo base ${sku} (deploy/seed/sample-data.json)`).toBeTruthy();
    return item!.id;
  }

  /**
   * Cancels a document a test left open (`production-orders/{id}`, `branch-orders/{id}`, `requisitions/{id}`…), for the
   * `finally` of the tests that clean up; a document that can no longer be cancelled is left as it is.
   */
  async cancelQuietly(path: string): Promise<void> {
    const current = await this.context.get(`${apiBase}/${path}`, { headers: this.headers() });
    if (!current.ok()) return;
    const { version } = (await current.json()) as { version: number };
    await this.context.post(`${apiBase}/${path}/cancel`, {
      headers: this.headers(),
      data: { version },
    });
  }

  /** Whether the item has a photo (F-23). */
  async hasPhoto(itemId: string): Promise<boolean> {
    const response = await this.context.get(`${apiBase}/items/${itemId}/photo`, {
      headers: this.headers(),
    });
    return response.ok();
  }

  /** Removes the item's photo (cleanup of the photo test). */
  async removePhoto(itemId: string): Promise<void> {
    const response = await this.context.delete(`${apiBase}/items/${itemId}/photo`, {
      headers: this.headers(),
    });
    expect(response.ok(), `DELETE items/${itemId}/photo`).toBeTruthy();
  }

  /**
   * Puts stock with a correction entry (for tests that move inventory). Items with lots need `lot`: the lot is created
   * the first time, expiring in 60 days.
   */
  async addStock(
    locationCode: string,
    sku: string,
    quantity: number,
    unitCost = 10,
    lot: string | null = null,
  ): Promise<void> {
    const locationId = await this.locationId(locationCode);
    const itemId = await this.itemId(sku);
    await this.post('adjustments', {
      locationId,
      reason: 'Correction',
      notes: 'E2E',
      lines: [
        {
          itemId,
          quantity,
          lotId: null,
          lotNumber: lot,
          expirationDate: lot ? daysFromToday(60) : null,
          unitCost,
          wasteQty: null,
          wasteReason: null,
          notes: null,
        },
      ],
    });
  }

  /** An active supplier of the base catalogs that sells the item (the preferred one first); fails if there is none. */
  async supplierOffer(sku: string): Promise<{ supplierId: string; supplierName: string }> {
    const itemId = await this.itemId(sku);
    const found = await this.get<{ supplierId: string; supplierName: string }[]>(
      `items/${itemId}/supplier-offers`,
    );
    expect(
      found.length,
      `proveedor que venda ${sku} (deploy/seed/sample-data.json)`,
    ).toBeGreaterThan(0);
    return found[0];
  }

  /** Id of a location by code (also inactive ones and sub-warehouses). */
  async locationId(code: string): Promise<string | null> {
    const page = await this.get<{ items: { id: string; code: string }[] }>(
      `locations?q=${encodeURIComponent(code)}&includeInactive=true&pageSize=100`,
    );
    return page.items.find((l) => l.code === code)?.id ?? null;
  }

  /** Id of a location of the base catalogs; fails if it is missing. */
  async requireLocation(code: string): Promise<string> {
    const id = await this.locationId(code);
    expect(id, `ubicación base ${code} (deploy/seed/sample-data.json)`).toBeTruthy();
    return id!;
  }

  /** RN-49: the Planta's active factory, if it has one (recipes then must name it); null on a plant without factory. */
  async factoryId(): Promise<string | null> {
    const plant = await this.locationId('PLANTA');
    if (!plant) return null;
    const warehouses = await this.get<{ id: string; type: string; isActive: boolean }[]>(
      `locations/${plant}/warehouses`,
    );
    return warehouses.find((w) => w.type === 'Factory' && w.isActive)?.id ?? null;
  }

  /** RN-112: sends and receives (complete) the ingredients vouchers a released order created, so its factory has them. */
  async sendIngredients(orderId: string): Promise<void> {
    const order = await this.get<{ vouchers: { id: string; status: string }[] | null }>(
      `production-orders/${orderId}`,
    );
    for (const { id } of (order.vouchers ?? []).filter((v) => v.status === 'Draft')) {
      const draft = await this.get<{ version: number }>(`internal-transfers/${id}`);
      const sent = await this.post<{
        version: number;
        lines: { id: string; shippedQty: number }[];
      }>(`internal-transfers/${id}/dispatch`, { version: draft.version, lines: null });
      await this.post(`internal-transfers/${id}/receive`, {
        version: sent.version,
        lines: sent.lines.map((l) => ({
          lineId: l.id,
          receivedQty: l.shippedQty,
          discrepancyReason: null,
          discrepancyNotes: null,
        })),
      });
    }
  }

  /** RN-113: the base vehicle and driver dispatches choose (support/base-data.ts); fails if they are missing or inactive. */
  async fleet(): Promise<{ vehicleId: string; driverId: string }> {
    const vehicles = await this.get<{ items: { id: string; plate: string }[] }>(
      `vehicles?q=${encodeURIComponent(base.vehicle)}&pageSize=100`,
    );
    const vehicle = vehicles.items.find((v) => v.plate === base.vehicle);
    expect(vehicle, `vehículo base ${base.vehicle} activo`).toBeTruthy();
    const drivers = await this.get<{ items: { id: string; name: string }[] }>(
      `drivers?q=${encodeURIComponent(base.driver)}&pageSize=100`,
    );
    const driver = drivers.items.find((d) => d.name === base.driver);
    expect(driver, `chofer base ${base.driver} activo`).toBeTruthy();
    return { vehicleId: vehicle!.id, driverId: driver!.id };
  }

  /** Cancels the drafts and counts in progress of a location, so a test can start a new one (RN-06). */
  async cancelOpenCounts(locationId: string): Promise<void> {
    for (const status of ['Draft', 'InProgress']) {
      const page = await this.get<{ items: { id: string }[] }>(
        `physical-counts?locationId=${locationId}&status=${status}&pageSize=100`,
      );
      for (const count of page.items) {
        const { version } = await this.get<{ version: number }>(`physical-counts/${count.id}`);
        await this.post(`physical-counts/${count.id}/cancel`, { version });
      }
    }
  }

  async dispose(): Promise<void> {
    await this.context.dispose();
  }

  private headers() {
    return { Authorization: `Bearer ${this.token}` };
  }
}

/** A business date of the plant (America/Mexico_City) `days` from today, as the API expects it. */
export function daysFromToday(days: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(
    new Date(Date.now() + days * 86_400_000),
  );
}

/** Signs in through the login screen. */
export async function signIn(page: Page, credentials: Credentials): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Correo').fill(credentials.email);
  await page.getByLabel('Contraseña').fill(credentials.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('button', { name: /^Cuenta de / })).toBeVisible();
}

/** Opens the sidebar on phones (it is a drawer there). */
export async function openMenu(page: Page): Promise<void> {
  const menu = page.getByRole('navigation', { name: 'Menú principal' });
  if (!(await menu.isVisible())) await page.getByRole('button', { name: 'Abrir menú' }).click();
  await expect(menu).toBeVisible();
}
