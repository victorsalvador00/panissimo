import { expect, test } from '@playwright/test';
import { adminCredentials, login } from './support/session';

/**
 * Regresión: dos pestañas (o dos recargas seguidas) renuevan la sesión con la misma cookie casi al mismo
 * tiempo. Antes el backend lo tomaba como robo del token ("reuse detected") y cerraba la sesión.
 */
test('recargar dos pestañas a la vez conserva la sesión', async ({ page, context }) => {
  const admin = adminCredentials();
  await login(page, admin.email, admin.password);

  const second = await context.newPage();
  await second.goto('/');
  await expect(second.getByRole('heading', { name: 'Tablero' })).toBeVisible();

  for (let round = 0; round < 3; round++) {
    await Promise.all([page.reload(), second.reload()]);
    await expect(page.getByRole('heading', { name: 'Tablero' })).toBeVisible();
    await expect(second.getByRole('heading', { name: 'Tablero' })).toBeVisible();
  }

  // Doble recarga rápida en la misma pestaña (la primera se interrumpe a medio camino).
  await page.reload({ waitUntil: 'commit' });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Tablero' })).toBeVisible();
  await expect(page).not.toHaveURL(/\/login/);
});
