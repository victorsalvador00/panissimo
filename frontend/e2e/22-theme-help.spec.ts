import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Page, expect, test } from '@playwright/test';
import { signIn } from './support/api';
import { adminCredentials } from './support/env';

/** E2E 15 and 16 (frontend §9): theme persistence and "según el sistema"; contextual help. Do not move inventory. */

const pageBackground = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

async function chooseTheme(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: /^Cuenta de/ }).click();
  await page.getByRole('menuitem', { name: 'Tema' }).click();
  await page.getByRole('menuitemradio', { name: label }).click();
}

test('tema: persiste al recargar y "según el sistema" sigue al sistema', async ({ page, isMobile }) => {
  test.skip(isMobile, 'El tema no depende del ancho.');
  await page.emulateMedia({ colorScheme: 'light' });
  await signIn(page, adminCredentials());
  await page.goto('/');
  const light = await pageBackground(page);

  await chooseTheme(page, 'Oscuro');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const dark = await pageBackground(page);
  expect(dark).not.toBe(light);

  // The choice survives a reload (before Angular starts: the inline script of index.html applies it).
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await pageBackground(page)).toBe(dark);

  // "Según el sistema" follows the system, live.
  await chooseTheme(page, 'Según el sistema');
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
  expect(await pageBackground(page)).toBe(light);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => pageBackground(page)).toBe(dark);
  await page.reload();
  await expect.poll(() => pageBackground(page)).toBe(dark);

  await chooseTheme(page, 'Claro');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('ayuda: abrir, video, Esc y foco', async ({ page }) => {
  await signIn(page, adminCredentials());
  await page.goto('/inventario/ajustes/nuevo');
  await expect(page.getByRole('heading', { name: 'Nuevo ajuste', exact: true })).toBeVisible();
  const button = page.getByRole('button', { name: 'Ayuda de esta pantalla' });
  await button.click();
  const panel = page.getByRole('dialog', { name: /Nuevo ajuste/ });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { name: /Nuevo ajuste/ })).toBeFocused();
  await expect(panel.getByRole('heading', { name: 'Pasos' })).toBeVisible();

  // The capture screens have a video; it only downloads with the panel open (recorded with `npm run help:record`).
  if (existsSync(join(__dirname, '..', 'public', 'help', 'ajuste.webm'))) {
    const video = panel.locator('video');
    await expect(video).toHaveAttribute('src', 'help/ajuste.webm');
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0);
  }

  // Esc closes it and the focus goes back to the button.
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(button).toBeFocused();

  // It closes when navigating, and the topic follows the screen.
  await button.click();
  await expect(page.getByRole('dialog', { name: /Nuevo ajuste/ })).toBeVisible();
  await page.goto('/inventario/existencias');
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('button', { name: 'Ayuda de esta pantalla' }).click();
  await expect(page.getByRole('dialog', { name: /Existencias/ })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar la ayuda' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
});
