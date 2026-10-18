import { expect, test } from '@playwright/test';
import { AdminApi, openMenu, signIn } from './support/api';
import { adminCredentials } from './support/env';

/**
 * E2E 1 (frontend §9): login and menu filtered by permissions, admin vs branch manager. Does not move inventory; it
 * creates (or refreshes) the user e2e.encargado@panissimo.test with the "Encargado de sucursal" role at the plant.
 */
test.describe('Login y menú filtrado', () => {
  test('credenciales inválidas muestran el mensaje del backend', async ({ page }) => {
    await page.goto('/login');
    // An unknown email: failed attempts on a real account would end up locking it.
    await page.getByLabel('Correo').fill('nadie.e2e@panissimo.test');
    await page.getByLabel('Contraseña').fill('Incorrecta2026x');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('alert')).toContainText('incorrect');
    await expect(page).toHaveURL(/\/login/);
  });

  test('el admin ve todo el menú, incluida la administración', async ({ page }) => {
    await signIn(page, adminCredentials());
    await openMenu(page);
    const menu = page.getByRole('navigation', { name: 'Menú principal' });
    for (const section of ['Inventario', 'Producción', 'Logística', 'Ventas', 'Compras', 'Catálogos', 'Administración'])
      await expect(menu.getByRole('heading', { name: section })).toBeVisible();
    await menu.getByRole('link', { name: 'Usuarios' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Usuarios' })).toBeVisible();
  });

  test('el encargado de sucursal solo ve lo que su rol permite', async ({ page, baseURL }) => {
    const api = await AdminApi.create(baseURL!);
    const manager = await api.ensureUser('e2e.encargado@panissimo.test', 'Encargado E2E', 'Encargado de sucursal', ['PLANTA']);
    await api.dispose();

    await signIn(page, manager);
    await openMenu(page);
    const menu = page.getByRole('navigation', { name: 'Menú principal' });
    await expect(menu.getByRole('heading')).toHaveText(['General', 'Inventario', 'Logística']);
    // The labels (the icons are ligatures: their name is text inside the link).
    await expect(menu.locator('.pan-nav-label')).toHaveText([
      'Inicio',
      'Existencias',
      'Kardex',
      'Conteos',
      'Consumos',
      'Vales internos',
      'Análisis de consumo',
      'Pedidos de sucursal',
      'Traspasos',
    ]);

    // The backend protects; the frontend hides the screen and sends to /sin-acceso.
    await page.goto('/admin/usuarios');
    await expect(page).toHaveURL(/\/sin-acceso$/);
    await expect(page.getByRole('heading', { name: 'Sin acceso' })).toBeVisible();
  });

  test('la sesión sobrevive a recargar la página', async ({ page }) => {
    await signIn(page, adminCredentials());
    await page.goto('/admin/bitacora');
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Bitácora' })).toBeVisible();
  });
});
