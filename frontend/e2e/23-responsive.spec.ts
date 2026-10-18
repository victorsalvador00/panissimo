import { Page, expect, test } from '@playwright/test';
import { signIn } from './support/api';
import { adminCredentials } from './support/env';

/**
 * F-24 (frontend §11): no horizontal scroll at 360 px on the screens of every module (lists, new documents, reports).
 * The page and the shell's scroll container are checked; a table may scroll inside its own frame. Does not move
 * inventory (it only opens screens).
 */

const ROUTES: readonly string[] = [
  '/',
  '/perfil',
  '/inventario/existencias',
  '/inventario/kardex',
  '/inventario/analisis-consumo',
  '/inventario/ajustes',
  '/inventario/ajustes/nuevo',
  '/inventario/conteos',
  '/inventario/consumos',
  '/inventario/vales-internos',
  '/inventario/vales-internos/nuevo',
  '/inventario/existencias-iniciales',
  '/catalogos/ubicaciones',
  '/catalogos/articulos',
  '/catalogos/articulos/nuevo',
  '/catalogos/articulos/importar',
  '/catalogos/articulos/fotos',
  '/catalogos/categorias',
  '/catalogos/unidades',
  '/produccion/recetas',
  '/produccion/recetas/nueva',
  '/produccion/plan',
  '/produccion/resumen',
  '/produccion/ordenes',
  '/produccion/ordenes/nueva',
  '/produccion/cierres',
  '/produccion/importar',
  '/produccion/importaciones',
  '/produccion/areas',
  '/logistica/pedidos',
  '/logistica/pedidos/nuevo',
  '/logistica/traspasos',
  '/logistica/traspasos/nuevo',
  '/ventas/clientes',
  '/ventas/clientes/nuevo',
  '/ventas/pedidos',
  '/ventas/pedidos/nuevo',
  '/ventas/remisiones',
  '/compras/requerimiento',
  '/compras/proveedores',
  '/compras/proveedores/nuevo',
  '/compras/requisiciones',
  '/compras/requisiciones/nueva',
  '/compras/ordenes',
  '/compras/ordenes/nueva',
  '/compras/recepciones',
  '/admin/usuarios',
  '/admin/usuarios/nuevo',
  '/admin/roles',
  '/admin/roles/nuevo',
  '/admin/bitacora',
  '/admin/configuracion',
];

async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const scroller = document.querySelector('mat-sidenav-content');
    const doc = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const shell = scroller ? scroller.scrollWidth - scroller.clientWidth : 0;
    return Math.max(doc, shell);
  });
}

test('sin scroll horizontal a 360 px', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Se revisa con el ancho de un celular.');
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await signIn(page, adminCredentials());
  const failures: string[] = [];
  for (const route of ROUTES) {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1').first()).toBeVisible();
    const px = await overflow(page);
    if (px > 0) failures.push(`${route}: ${px} px`);
  }
  expect(failures, failures.join('\n')).toEqual([]);
});
