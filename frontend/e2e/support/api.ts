import { APIRequestContext, Page, expect, request } from '@playwright/test';
import { randomBytes } from 'node:crypto';
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
    const response = await this.context.post(`${apiBase}/${path}`, { headers: this.headers(), data });
    expect(response.ok(), `POST ${path}: ${await response.text()}`).toBeTruthy();
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  /**
   * A user with one system role and the given locations; created the first time and with a fresh temporary password
   * on every run, so the test can sign in. Does not move inventory.
   */
  async ensureUser(email: string, fullName: string, roleName: string, locationCodes: string[]): Promise<Credentials> {
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
      await this.post('users', { email, fullName, password, roleIds: [role!.id], locationIds, defaultLocationId: null });
      return { email, password };
    }
    const current = await this.get<{ version: number }>(`users/${user.id}`);
    const updated = await this.context.put(`${apiBase}/users/${user.id}`, {
      headers: this.headers(),
      data: { version: current.version, fullName, roleIds: [role!.id], locationIds, defaultLocationId: null },
    });
    expect(updated.ok(), `PUT users/${user.id}`).toBeTruthy();
    if (!user.isActive) {
      const { version } = (await updated.json()) as { version: number };
      await this.post(`users/${user.id}/activate`, { version });
    }
    await this.post(`users/${user.id}/reset-password`, { newPassword: password });
    return { email, password };
  }

  /** An active item category with this name (created the first time). */
  async ensureCategory(name: string): Promise<void> {
    const page = await this.get<{ items: { name: string; isActive: boolean }[] }>(
      `item-categories?q=${encodeURIComponent(name)}&includeInactive=true&pageSize=100`,
    );
    if (!page.items.some((c) => c.name.toLowerCase() === name.toLowerCase()))
      await this.post('item-categories', { name });
  }

  async dispose(): Promise<void> {
    await this.context.dispose();
  }

  private headers() {
    return { Authorization: `Bearer ${this.token}` };
  }
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
