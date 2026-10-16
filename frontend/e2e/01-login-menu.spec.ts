import { expect, test } from '@playwright/test';
import {
  adminApi,
  adminCredentials,
  chooseOptions,
  login,
  logout,
  menuItems,
} from './support/session';

/**
 * E2E #1 (spec frontend §9) y criterio de aceptación de F-04: el administrador crea un encargado de
 * sucursal desde la pantalla; ese usuario entra y solo ve su menú.
 */
test.describe('Login y menú filtrado por permisos', () => {
  const stamp = `${Date.now()}`;
  const newUser = {
    fullName: `E2E Encargado ${stamp}`,
    email: `e2e.encargado.${stamp}@sgo.test`,
    password: `E2e${stamp}Aa`,
  };
  let createdId: string | undefined;

  test.afterAll(async ({ baseURL }) => {
    // Desactiva el usuario de prueba para no dejar cuentas activas en la base de desarrollo.
    if (!createdId) {
      return;
    }
    const api = await adminApi(baseURL!);
    const user = await (await api.get(`/api/v1/users/${createdId}`)).json();
    await api.post(`/api/v1/users/${createdId}/deactivate`, { data: { version: user.version } });
    await api.dispose();
  });

  test('admin crea un encargado de sucursal que solo ve su menú', async ({ page }) => {
    const admin = adminCredentials();

    await test.step('el administrador ve todas las secciones', async () => {
      await login(page, admin.email, admin.password);
      const items = await menuItems(page);
      expect(items).toEqual(
        expect.arrayContaining(['Usuarios', 'Roles', 'Bitácora', 'Configuración', 'Proveedores']),
      );
    });

    await test.step('crea el usuario de sucursal', async () => {
      await page.goto('/admin/usuarios/nuevo');
      await page.getByLabel('Nombre completo').fill(newUser.fullName);
      await page.getByLabel('Correo electrónico').fill(newUser.email);
      await page.getByLabel('Contraseña inicial').fill(newUser.password);

      await chooseOptions(page, 'Roles', ['Encargado de sucursal']);
      await chooseOptions(page, 'Ubicaciones permitidas', [/^SUC-01 · /]);
      // Con una sola ubicación permitida se propone como default.
      await expect(page.getByRole('combobox', { name: 'Ubicación default' })).toContainText(
        'SUC-01',
      );

      await page.getByRole('button', { name: 'Crear usuario' }).click();
      await expect(page).toHaveURL(/\/admin\/usuarios\/[0-9a-f-]{36}$/);
      createdId = page.url().split('/').pop();
      await expect(page.getByRole('heading', { name: newUser.fullName })).toBeVisible();
    });

    await test.step('el encargado entra y solo ve su menú', async () => {
      await logout(page);
      await login(page, newUser.email, newUser.password);

      expect(await menuItems(page)).toEqual([
        'Tablero',
        'Existencias',
        'Kardex',
        'Conteos físicos',
        'Consumo del día',
        'Pedidos',
        'Traspasos',
      ]);
      // Con una sola ubicación no hay selector; se muestra su nombre.
      await expect(page.getByRole('combobox', { name: 'Ubicación activa' })).toHaveCount(0);
    });

    await test.step('una ruta sin permiso manda a "Sin acceso"', async () => {
      await page.goto('/admin/usuarios');
      await expect(page).toHaveURL(/\/sin-acceso$/);
      await expect(page.getByRole('heading', { name: 'Sin acceso' })).toBeVisible();
    });
  });
});
