import AxeBuilder from '@axe-core/playwright';
import { expect, Page } from '@playwright/test';

/**
 * Escaneo de accesibilidad con axe (WCAG 2.1 A/AA) de lo que se ve en ese momento, diálogos incluidos.
 * Falla con violaciones `serious` o `critical`; las menores se revisan a mano (criterio de F-16).
 */
export async function expectNoA11yViolations(page: Page): Promise<void> {
  // A media animación (entrada de un diálogo o de una pestaña) axe mide contrastes con opacidad parcial.
  // Las infinitas (skeleton, spinner) no se esperan.
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== 'running' ||
          animation.effect?.getTiming().iterations === Infinity,
      ),
  );
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.help}\n` +
        violation.nodes.map((node) => `    ${node.target.join(' ')}`).join('\n'),
    );
  expect(blocking, `Violaciones de accesibilidad en ${page.url()}`).toEqual([]);
}
