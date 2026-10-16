import { expect, Page, test } from '@playwright/test';
import { locationId } from './support/production';
import {
  adminApi,
  adminCredentials,
  chooseOptions,
  expectNoHorizontalScroll,
  login,
  logout,
} from './support/session';

/**
 * Criterio de F-15: las tarjetas del tablero cambian según el rol y la ubicación activa. El
 * administrador ve "Por despachar" en COM y "Por recibir" en SUC-01, más la gráfica por ubicación
 * (`locations.all`); un encargado de sucursal (creado por API y desactivado al final) solo ve sus
 * tarjetas. No mueve inventario.
 */
const stamp = `${Date.now()}`;
const manager = {
  fullName: `E2E Tablero ${stamp}`,
  email: `e2e.tablero.${stamp}@sgo.test`,
  password: `E2e${stamp}Aa`,
};
let managerId: string | undefined;

test.beforeAll(async ({ baseURL }) => {
  const api = await adminApi(baseURL!);
  const roles = (await (await api.get('/api/v1/roles?pageSize=100')).json()) as {
    items: { id: string; name: string }[];
  };
  const role = roles.items.find((r) => r.name === 'Encargado de sucursal')!;
  const branch = await locationId(api, 'SUC-01');
  const response = await api.post('/api/v1/users', {
    data: {
      email: manager.email,
      fullName: manager.fullName,
      password: manager.password,
      roleIds: [role.id],
      locationIds: [branch],
      defaultLocationId: branch,
    },
  });
  expect(response.ok()).toBe(true);
  managerId = (await response.json()).id;
  await api.dispose();
});

test.afterAll(async ({ baseURL }) => {
  if (!managerId) {
    return;
  }
  const api = await adminApi(baseURL!);
  const user = await (await api.get(`/api/v1/users/${managerId}`)).json();
  await api.post(`/api/v1/users/${managerId}/deactivate`, { data: { version: user.version } });
  await api.dispose();
});

async function cardLabels(page: Page): Promise<string[]> {
  const cards = page.locator('a.card .label');
  await expect(cards.first()).toBeVisible();
  return (await cards.allTextContents()).map((label) => label.trim());
}

test('las tarjetas cambian según el rol y la ubicación activa', async ({ page }) => {
  const admin = adminCredentials();
  await login(page, admin.email, admin.password);

  await test.step('administrador en COM: despachar, aprobar y gráfica por ubicación', async () => {
    await chooseOptions(page, 'Ubicación activa', [/^COM · /]);
    await page.goto('/');
    const labels = await cardLabels(page);
    expect(labels).toEqual(
      expect.arrayContaining([
        'Artículos bajo mínimo',
        'Traspasos por despachar',
        'Pedidos por aprobar',
        'OC por aprobar',
      ]),
    );
    expect(labels).not.toContain('Traspasos por recibir');
    await expect(
      page.getByRole('heading', { name: 'Artículos bajo mínimo por ubicación' }),
    ).toBeVisible();
    // Con datos se dibuja la gráfica; si ninguna ubicación está bajo mínimo, lo dice.
    await expect(
      page
        .locator('app-low-stock-chart canvas')
        .or(page.getByText('Ninguna ubicación tiene artículos bajo mínimo.')),
    ).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  await test.step('administrador en SUC-01: por recibir y pedidos en curso', async () => {
    await chooseOptions(page, 'Ubicación activa', [/^SUC-01 · /]);
    await expect(page.locator('a.card .label', { hasText: 'Traspasos por recibir' })).toBeVisible();
    const labels = await cardLabels(page);
    expect(labels).toContain('Pedidos en curso');
    expect(labels).not.toContain('Traspasos por despachar');
    expect(labels).not.toContain('OC por aprobar');
  });

  await test.step('la tarjeta abre la lista filtrada', async () => {
    await page.locator('a.card', { hasText: 'Artículos bajo mínimo' }).click();
    await expect(page).toHaveURL(/\/inventario\/existencias\?bajoMinimo=1$/);
    await expect(page.getByRole('switch', { name: 'Solo bajo mínimo' })).toBeChecked();
  });

  await test.step('encargado de sucursal: solo sus tarjetas, sin gráfica', async () => {
    await logout(page);
    await login(page, manager.email, manager.password);
    const labels = await cardLabels(page);
    expect(labels).toEqual(
      expect.arrayContaining([
        'Artículos bajo mínimo',
        'Traspasos por recibir',
        'Pedidos en curso',
      ]),
    );
    expect(labels).not.toContain('OC por aprobar');
    expect(labels).not.toContain('Pedidos por aprobar');
    await expect(
      page.getByRole('heading', { name: 'Artículos bajo mínimo por ubicación' }),
    ).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });
});
