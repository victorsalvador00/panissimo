import { expect, test } from '@playwright/test';
import { adminCredentials, login } from './support/session';

/**
 * Criterio de aceptación de F-05: la importación de artículos con errores muestra la tabla de
 * errores por fila (y no importa nada: el backend es todo o nada).
 */
test('importación de artículos con errores muestra la tabla por fila', async ({ page }) => {
  const admin = adminCredentials();
  await login(page, admin.email, admin.password);
  await page.goto('/catalogos/articulos/importar');

  const csv = [
    'sku,nombre,tipo,categoria,unidad_base,unidad_compra,factor_compra,maneja_lotes,vida_util_dias,almacenamiento,iva',
    `E2E-OK-${Date.now()},Artículo correcto,materia_prima,Secos,kg,,,no,,ambiente,0`,
    'MAL SKU,Sin tipo válido,otro,Secos,kg,,,no,,ambiente,0',
    'E2E-X,Unidad inexistente,materia_prima,Secos,zzz,,,no,,ambiente,21',
  ].join('\n');

  await page.locator('input[type=file]').setInputFiles({
    name: 'articulos-con-errores.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf8'),
  });

  await expect(page.getByText('articulos-con-errores.csv')).toBeVisible();
  await expect(page.locator('table.preview tbody tr')).toHaveCount(3);

  await page.getByRole('button', { name: 'Importar 3 filas' }).click();

  const errors = page.getByTestId('import-errors');
  await expect(errors).toBeVisible();
  await expect(page.getByText('No se importó nada')).toBeVisible();

  const rows = await errors
    .locator('tbody tr')
    .evaluateAll((trs) =>
      trs.map((tr) =>
        Array.from(tr.querySelectorAll('td')).map((td) => td.textContent?.trim() ?? ''),
      ),
    );
  // Fila 3: tipo inválido (con errores de formato el backend no evalúa aún las reglas del SKU);
  // fila 4: unidad inexistente e IVA inválido.
  expect(rows.map(([row, column]) => `${row}:${column}`)).toEqual(
    expect.arrayContaining(['3:tipo', '4:unidad_base', '4:iva']),
  );
  expect(rows.every(([, , message]) => message.length > 0)).toBe(true);

  // Las filas con error se marcan en la vista previa; la correcta no.
  await expect(page.locator('table.preview tr.has-error')).toHaveCount(2);
});
