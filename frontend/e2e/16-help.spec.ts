import { expect, test } from '@playwright/test';
import { HELP } from '../src/app/core/help/help-content';
import { expectNoA11yViolations } from './support/a11y';
import { adminCredentials, login } from './support/session';

/**
 * Botón de ayuda flotante: abre el manual de la pantalla actual con su video, se cierra con Esc y regresa el foco;
 * sin violaciones de accesibilidad en claro y oscuro. También comprueba que existan todos los videos del manual.
 * No modifica datos.
 */
test('el manual de cada pantalla se abre desde el botón flotante', async ({ page }) => {
  const admin = adminCredentials();
  await login(page, admin.email, admin.password);
  await page.goto('/logistica/pedidos/nuevo');

  const fab = page.getByRole('button', { name: 'Ayuda de esta pantalla' });
  await expect(fab).toHaveAttribute('aria-expanded', 'false');
  await fab.click();

  const panel = page.getByRole('dialog', { name: 'Pedido de sucursal' });
  await expect(panel).toBeVisible();
  await expect(fab).toHaveAttribute('aria-expanded', 'true');
  await expect(panel.getByRole('heading', { name: 'Campos' })).toBeVisible();
  const video = panel.locator('video');
  await expect(video).toHaveAttribute('src', 'help/logistica-pedidos-nuevo.webm');
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0);
  await expectNoA11yViolations(page);

  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(fab).toBeFocused();

  // Otra pantalla, otro manual.
  await page.goto('/inventario/kardex');
  await fab.click();
  await expect(page.getByRole('dialog', { name: 'Kardex' })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar ayuda' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('el panel de ayuda es accesible en tema oscuro', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sgo.theme', 'dark'));
  const admin = adminCredentials();
  await login(page, admin.email, admin.password);
  await page.getByRole('button', { name: 'Ayuda de esta pantalla' }).click();
  await expect(page.getByRole('dialog', { name: 'Tablero' })).toBeVisible();
  await expectNoA11yViolations(page);
});

test('existen todos los videos del manual', async ({ request }) => {
  const videos = [
    ...new Set(Object.values(HELP).flatMap((topic) => (topic.video ? [topic.video] : []))),
  ];
  expect(videos.length).toBeGreaterThan(10);
  for (const video of videos) {
    const response = await request.get(`/help/${video}`);
    expect(response.status(), video).toBe(200);
    expect(response.headers()['content-type'], video).toContain('webm');
  }
});
