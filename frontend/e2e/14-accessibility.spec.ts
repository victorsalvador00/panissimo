import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './support/a11y';
import { adminCredentials, expectNoHorizontalScroll, login } from './support/session';

/**
 * F-16: escaneo axe (WCAG 2.1 AA, sin violaciones serious/critical) del login, el tablero y las listas
 * principales, en escritorio y en celular. Las pantallas de captura (conteo, consumo, pedido y
 * recepción) se revisan dentro de sus flujos (E2E 05, 06 y 12). No modifica datos.
 */
const lists: { url: string; heading: string }[] = [
  { url: '/inventario/existencias', heading: 'Existencias' },
  { url: '/inventario/conteos', heading: 'Conteos físicos' },
  { url: '/inventario/consumos', heading: 'Consumos' },
  { url: '/inventario/kardex', heading: 'Kardex' },
  { url: '/logistica/pedidos', heading: 'Pedidos' },
  { url: '/logistica/traspasos', heading: 'Traspasos' },
  { url: '/produccion/ordenes', heading: 'Órdenes de producción' },
  { url: '/compras/ordenes', heading: 'Órdenes de compra' },
  { url: '/catalogos/articulos', heading: 'Artículos' },
  { url: '/admin/usuarios', heading: 'Usuarios' },
];

test('login sin violaciones de accesibilidad', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
  await expectNoA11yViolations(page);

  // Error de credenciales: el mensaje también debe ser accesible.
  await page.getByLabel('Correo electrónico').fill('nadie@sgo.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('incorrecta');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expectNoA11yViolations(page);
});

test('tablero y listas principales sin violaciones de accesibilidad', async ({ page }) => {
  const admin = adminCredentials();
  await login(page, admin.email, admin.password);
  await expect(page.locator('a.card').first()).toBeVisible();
  await expectNoA11yViolations(page);

  for (const { url, heading } of lists) {
    await page.goto(url);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    // Espera a que termine la carga (skeleton) para revisar la tabla o el estado vacío.
    await expect(page.locator('.skeleton, [aria-busy="true"]')).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await expectNoA11yViolations(page);
  }
});
