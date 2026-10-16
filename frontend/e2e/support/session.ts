import { APIRequestContext, expect, Page, request } from '@playwright/test';

export function adminCredentials(): { email: string; password: string } {
  const email = process.env['SGO_E2E_ADMIN_EMAIL'];
  const password = process.env['SGO_E2E_ADMIN_PASSWORD'];
  if (!email || !password) {
    throw new Error(
      'Faltan SGO_E2E_ADMIN_EMAIL y SGO_E2E_ADMIN_PASSWORD (o el archivo deploy/.env local).',
    );
  }
  return { email, password };
}

/** Inicia sesión por la pantalla de login y espera el tablero. */
export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Tablero' })).toBeVisible();
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Menú de / }).click();
  await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/login/);
}

/**
 * Elige opciones de un `mat-select` (abre con el teclado: la etiqueta flotante de Material cubre el
 * disparador y Playwright rechaza el clic aunque un usuario sí puede hacerlo).
 */
export async function chooseOptions(
  page: Page,
  label: string,
  options: (string | RegExp)[],
): Promise<void> {
  const select = page.getByRole('combobox', { name: label, exact: true });
  await select.focus();
  await page.keyboard.press('Enter');
  for (const option of options) {
    await page.getByRole('option', { name: option }).click();
  }
  if (await page.getByRole('listbox').isVisible()) {
    await page.keyboard.press('Escape');
  }
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

/** Abre el menú lateral si está como panel (celular). */
export async function openMenuIfCollapsed(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: 'Abrir menú' });
  if (await toggle.isVisible()) {
    await toggle.click();
  }
}

/** Opciones visibles del menú lateral. */
export async function menuItems(page: Page): Promise<string[]> {
  await openMenuIfCollapsed(page);
  const nav = page.getByRole('navigation', { name: 'Menú principal' });
  await expect(nav).toBeVisible();
  return (await nav.getByRole('link').allInnerTexts()).map((text) =>
    // El texto incluye el nombre del ícono (Material Symbols es una fuente de ligaduras).
    text.replace(/^[a-z_0-9]+\s*/, '').trim(),
  );
}

/** Cliente de la API autenticado como administrador (para limpiar lo que crean las pruebas). */
export async function adminApi(baseURL: string): Promise<APIRequestContext> {
  const { email, password } = adminCredentials();
  const context = await request.newContext({ baseURL });
  const response = await context.post('/api/v1/auth/login', { data: { email, password } });
  expect(response.ok()).toBe(true);
  const { accessToken } = (await response.json()) as { accessToken: string };
  await context.dispose();
  return request.newContext({
    baseURL,
    extraHTTPHeaders: { Authorization: `Bearer ${accessToken}` },
  });
}

/** Ni la página ni el área de contenido del shell se desplazan a lo ancho. */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() =>
    [document.documentElement, document.querySelector('mat-sidenav-content')]
      .filter((el): el is Element => !!el)
      .map((el) => el.scrollWidth - el.clientWidth),
  );
  for (const extra of overflow) {
    expect(extra).toBeLessThanOrEqual(0);
  }
}
