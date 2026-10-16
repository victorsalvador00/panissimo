import { expect, Page, test } from '@playwright/test';
import { expectNoA11yViolations } from './support/a11y';
import { adminCredentials, login } from './support/session';

/**
 * Tema claro, oscuro o según el sistema: se elige en el login y en el menú del usuario, se guarda en el
 * navegador (sobrevive a F5) y el modo oscuro no tiene violaciones de contraste (axe). No modifica datos.
 */

/** true si el fondo de la página es oscuro. */
async function looksDark(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const [r, g, b] = getComputedStyle(document.body).backgroundColor.match(/\d+/g)!.map(Number);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
  });
}

async function chooseTheme(page: Page, menuButton: string | RegExp, option: string): Promise<void> {
  await page.getByRole('button', { name: menuButton }).click();
  await page.getByRole('menuitemradio', { name: option }).click();
  await expect(page.getByRole('menu')).toHaveCount(0);
}

test('en el login: oscuro se guarda y "según el sistema" sigue al dispositivo', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/login');
  expect(await looksDark(page)).toBe(false);

  await chooseTheme(page, 'Cambiar tema', 'Oscuro');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await looksDark(page)).toBe(true);
  await expectNoA11yViolations(page);

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await looksDark(page)).toBe(true);

  await chooseTheme(page, 'Cambiar tema', 'Según el sistema');
  await expect(page.locator('html')).not.toHaveAttribute('data-theme');
  expect(await looksDark(page)).toBe(false);
  await page.emulateMedia({ colorScheme: 'dark' });
  expect(await looksDark(page)).toBe(true);
});

test('en la aplicación: modo oscuro desde el menú del usuario, sin violaciones de accesibilidad', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  const admin = adminCredentials();
  await login(page, admin.email, admin.password);

  await chooseTheme(page, /^Menú de /, 'Oscuro');
  expect(await looksDark(page)).toBe(true);
  await page.getByRole('button', { name: /^Menú de / }).click();
  await expect(page.getByRole('menuitemradio', { name: 'Oscuro' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.keyboard.press('Escape');

  await expect(page.locator('a.card').first()).toBeVisible();
  await expectNoA11yViolations(page);

  // Listas con etiquetas de estado y avisos: sus colores propios también tienen variante oscura.
  for (const [url, heading] of [
    ['/logistica/traspasos?pestana=todos', 'Traspasos'],
    ['/compras/ordenes', 'Órdenes de compra'],
    ['/inventario/consumos/nuevo', 'Consumo del día'],
  ]) {
    await page.goto(url);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expect(page.locator('.skeleton')).toHaveCount(0);
    expect(await looksDark(page)).toBe(true);
    await expectNoA11yViolations(page);
  }
});
