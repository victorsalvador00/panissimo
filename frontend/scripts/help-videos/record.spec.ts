import { APIRequestContext, Browser, Locator, Page, test } from '@playwright/test';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  ensureActiveRecipe,
  ensureProduct,
  itemId,
  locationId,
} from '../../e2e/support/production';
import { ensurePreferredSupplier } from '../../e2e/support/purchasing';
import { adminApi, adminCredentials } from '../../e2e/support/session';

/**
 * Videos del manual de usuario (botón de ayuda). Cada prueba graba una pantalla de captura llenando sus campos
 * con una leyenda que explica cada uno, y **nunca guarda**: no deja documentos ni mueve inventario. Lo que hace
 * falta para abrir algunas pantallas (un conteo en captura, una OC aprobada, una OP liberada) se crea por API y
 * se cancela al final. El traspaso por recibir se toma de los que ya están en tránsito.
 */
const OUT = join(__dirname, '..', '..', 'public', 'help');
// Pequeño para que se lea en el panel de ayuda; el menú va contraído para dar el espacio al formulario.
const VIEWPORT = { width: 1024, height: 640 };
const TODAY = new Date().toISOString().slice(0, 10);

interface Session {
  page: Page;
  explain: (target: Locator, text: string, ms?: number) => Promise<void>;
  type: (target: Locator, text: string, caption: string) => Promise<void>;
  pick: (label: string, caption: string, search?: string, option?: RegExp) => Promise<void>;
}

/** Abre una sesión grabada en `url` y guarda el video como `name` al terminar `script`. */
async function record(
  browser: Browser,
  baseURL: string,
  name: string,
  url: string,
  script: (session: Session) => Promise<void>,
  activeLocation?: string,
): Promise<void> {
  const context = await browser.newContext({
    baseURL,
    locale: 'es-MX',
    viewport: VIEWPORT,
    recordVideo: { dir: join(OUT, '.tmp'), size: VIEWPORT },
  });
  const { email, password } = adminCredentials();
  const login = await context.request.post('/api/v1/auth/login', { data: { email, password } });
  if (!login.ok()) throw new Error(`Login falló (${login.status()})`);
  await context.addInitScript(
    ([location]) => {
      localStorage.setItem('sgo.theme', 'light');
      localStorage.setItem('sgo.sidebarCollapsed', 'true');
      if (location) localStorage.setItem('sgo.activeLocationId', location);
      // El botón de ayuda no sale en su propio video.
      const style = document.createElement('style');
      style.textContent = '.sgo-help-fab { display: none !important; }';
      document.addEventListener('DOMContentLoaded', () => document.head.append(style));
    },
    [activeLocation ?? null],
  );

  const page = await context.newPage();
  // Si un elemento no existe, el paso se omite rápido en lugar de esperar (y grabar) hasta el límite de la prueba.
  page.setDefaultTimeout(4000);
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(600);

  const explain = async (target: Locator, text: string, ms = 1700) => {
    await target.scrollIntoViewIfNeeded().catch(() => undefined);
    const box = await target.boundingBox().catch(() => null);
    if (!box) {
      console.warn(`[${name}] no se encontró: ${text}`);
      return;
    }
    await page.evaluate(
      ({ box, text }) => {
        document.querySelectorAll('.help-rec').forEach((element) => element.remove());
        const ring = document.createElement('div');
        const tip = document.createElement('div');
        ring.className = tip.className = 'help-rec';
        Object.assign(ring.style, {
          position: 'fixed',
          left: `${box.x - 4}px`,
          top: `${box.y - 4}px`,
          width: `${box.width + 8}px`,
          height: `${box.height + 8}px`,
          border: '3px solid #ff9800',
          borderRadius: '14px',
          boxShadow: '0 0 14px rgba(255, 152, 0, 0.7)',
          zIndex: '2147483646',
          pointerEvents: 'none',
        });
        const below = box.y + box.height + 70 < innerHeight;
        tip.textContent = text;
        Object.assign(tip.style, {
          position: 'fixed',
          left: `${Math.min(Math.max(8, box.x), innerWidth - 392)}px`,
          top: `${below ? box.y + box.height + 12 : box.y - 64}px`,
          maxWidth: '380px',
          padding: '8px 12px',
          borderRadius: '10px',
          background: '#1b1f3b',
          color: '#fff',
          font: '600 19px Roboto, sans-serif',
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.3)',
          zIndex: '2147483647',
          pointerEvents: 'none',
        });
        document.body.append(ring, tip);
      },
      { box, text },
    );
    await page.waitForTimeout(ms);
  };
  const clear = () =>
    page.evaluate(() =>
      document.querySelectorAll('.help-rec').forEach((element) => element.remove()),
    );
  const type = async (target: Locator, text: string, caption: string) => {
    await explain(target, caption, 900);
    // Enfocar en lugar de clic: un panel de sugerencias abierto taparía el campo.
    await target.focus().catch(() => undefined);
    await target.fill('').catch(() => undefined); // los campos prellenados se reemplazan, no se concatenan
    await target.pressSequentially(text, { delay: 70 }).catch(() => undefined);
    await page.waitForTimeout(500);
    await clear();
  };
  const pick = async (label: string, caption: string, search?: string, option?: RegExp) => {
    const field = page.getByRole('combobox', { name: label }).first();
    await explain(field, caption, 900);
    if (search) {
      await field.pressSequentially(search, { delay: 90 }).catch(() => undefined);
    } else {
      await field.focus().catch(() => undefined);
      await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(500);
    const choice = option
      ? page.getByRole('option', { name: option }).first()
      : page.getByRole('option').first();
    await choice.click({ timeout: 4000 }).catch(() => page.keyboard.press('Escape'));
    await page.waitForTimeout(400);
    await clear();
  };

  try {
    await script({ page, explain, type, pick });
    await clear();
    await page.waitForTimeout(800);
  } finally {
    const video = page.video();
    await context.close();
    mkdirSync(OUT, { recursive: true });
    if (video) copyFileSync(await video.path(), join(OUT, `${name}.webm`));
  }
}

let api: APIRequestContext;
test.beforeAll(async ({ baseURL }) => {
  api = await adminApi(baseURL!);
});
test.afterAll(async () => {
  await api?.dispose();
  rmSync(join(OUT, '.tmp'), { recursive: true, force: true });
});

test('catalogos-articulos-nuevo', async ({ browser, baseURL }) => {
  await record(
    browser,
    baseURL!,
    'catalogos-articulos-nuevo',
    '/catalogos/articulos/nuevo',
    async (s) => {
      await s.type(s.page.getByLabel('SKU'), 'DEMO-001', 'SKU: clave única del artículo');
      await s.type(
        s.page.getByLabel('Nombre', { exact: true }),
        'Leche entera',
        'Nombre como lo verán todos',
      );
      await s.pick('Tipo', 'Tipo: materia prima, intermedio o terminado');
      await s.pick('Categoría', 'Categoría para filtrar y contar');
      await s.pick('Unidad base', 'Unidad en la que se guarda la existencia', undefined, /^l /);
      await s.pick('Unidad de compra', 'Cómo se compra (ej. caja)');
      await s.type(s.page.getByLabel('Factor de compra'), '12', 'Cuántas unidades base trae');
      await s.explain(
        s.page.getByRole('switch').first(),
        'Actívalo si el artículo caduca: pedirá lote',
      );
      await s.page
        .getByRole('switch')
        .first()
        .click()
        .catch(() => undefined);
      await s.type(s.page.getByLabel('Vida útil'), '10', 'Días que dura; propone la caducidad');
      await s.explain(
        s.page.getByRole('button', { name: /Crear artículo|Guardar/ }).first(),
        'Guarda el artículo',
      );
    },
  );
});

test('catalogos-ubicaciones', async ({ browser, baseURL }) => {
  await record(browser, baseURL!, 'catalogos-ubicaciones', '/catalogos/ubicaciones', async (s) => {
    const create = s.page.getByRole('button', { name: 'Nueva ubicación' });
    await s.explain(create, 'Abre el formulario de alta');
    await create.click();
    const dialog = s.page.getByRole('dialog');
    await s.type(dialog.getByLabel('Código'), 'SUC-11', 'Código corto de la ubicación');
    await s.type(dialog.getByLabel('Nombre'), 'Sucursal Centro', 'Nombre visible');
    await s.pick('Tipo', 'Sucursal, fábrica o comisariato');
    await s.type(dialog.getByLabel('Dirección'), 'Av. Juárez 120', 'Dirección (opcional)');
    await s.explain(
      dialog.getByRole('button', { name: /Guardar|Crear/ }).first(),
      'Guarda la ubicación',
    );
  });
});

test('inventario-ajustes-nuevo', async ({ browser, baseURL }) => {
  await record(
    browser,
    baseURL!,
    'inventario-ajustes-nuevo',
    '/inventario/ajustes/nuevo',
    async (s) => {
      await s.pick('Motivo', 'Motivo: merma, caducado, dañado, uso interno o corrección');
      await s.pick('Artículo', 'Busca el artículo por nombre o SKU', 'AZU', /AZU-001/);
      const qty = s.page.getByLabel(/A dar de baja|entrada/).first();
      await s.type(qty, '2', 'Cantidad: en mermas es lo que se da de baja');
      await s.type(s.page.getByLabel('Notas').first(), 'Bolsa rota', 'Explica la causa');
      await s.explain(
        s.page.getByRole('button', { name: 'Registrar ajuste' }),
        'Registra el ajuste (pide confirmación)',
      );
    },
  );
});

test('inventario-conteos-captura', async ({ browser, baseURL }) => {
  const location = await locationId(api, 'SUC-01');
  const open = await (
    await api.get(`/api/v1/physical-counts?locationId=${location}&status=InProgress`)
  ).json();
  for (const count of open.items as { id: string }[]) {
    const detail = await (await api.get(`/api/v1/physical-counts/${count.id}`)).json();
    await api.post(`/api/v1/physical-counts/${count.id}/cancel`, {
      data: { version: detail.version },
    });
  }
  let count = await (
    await api.post('/api/v1/physical-counts', {
      data: { locationId: location, categoryId: null, notes: 'Video de ayuda' },
    })
  ).json();
  count = await (
    await api.post(`/api/v1/physical-counts/${count.id}/start`, {
      data: { version: count.version },
    })
  ).json();
  try {
    await record(
      browser,
      baseURL!,
      'inventario-conteos-captura',
      `/inventario/conteos/${count.id}`,
      async (s) => {
        const counted = s.page.locator('input[aria-label^="Contado de"]').first();
        await s.type(counted, '3', 'Escribe lo que hay en anaquel; se guarda solo');
        await s.explain(
          s.page.getByLabel('Buscar por nombre, SKU o lote'),
          'Busca por nombre, SKU o lote para ir directo',
        );
        await s.explain(
          s.page.getByText(/Guardado|Guardando/).first(),
          'Se guarda mientras capturas',
        );
        // Dice "Faltan N" mientras queden líneas sin contar.
        await s.explain(
          s.page.getByRole('button', { name: /Revisar y cerrar|Faltan/ }),
          'Al terminar, revisa diferencias y cierra',
        );
      },
      location,
    );
  } finally {
    const detail = await (await api.get(`/api/v1/physical-counts/${count.id}`)).json();
    await api.post(`/api/v1/physical-counts/${count.id}/cancel`, {
      data: { version: detail.version },
    });
  }
});

test('inventario-consumos-nuevo', async ({ browser, baseURL }) => {
  const branch = await locationId(api, 'SUC-02');
  await record(
    browser,
    baseURL!,
    'inventario-consumos-nuevo',
    '/inventario/consumos/nuevo',
    async (s) => {
      await s.pick('Artículo', 'Busca lo que se usó', 'AZU', /AZU-001/);
      await s.type(
        s.page.getByLabel('Cantidad', { exact: true }),
        '1.5',
        'Cantidad usada; Enter la agrega',
      );
      await s.page.keyboard.press('Enter');
      await s.page.waitForTimeout(600);
      await s.explain(
        s.page.getByRole('heading', { name: /Consumo \(/ }),
        'Lista de lo capturado; puedes corregirla',
      );
      await s.explain(
        s.page.getByRole('button', { name: 'Registrar consumo' }),
        'Registra y descuenta de la existencia',
      );
    },
    branch,
  );
});

test('logistica-pedidos-nuevo', async ({ browser, baseURL }) => {
  const branch = await locationId(api, 'SUC-01');
  await record(
    browser,
    baseURL!,
    'logistica-pedidos-nuevo',
    '/logistica/pedidos/nuevo',
    async (s) => {
      await s.pick('Pedir a', 'Fábrica o comisariato que surte', undefined, /^COM/);
      await s.explain(s.page.getByLabel('Se requiere para'), 'Fecha en que lo necesitas');
      const suggest = s.page.getByRole('button', { name: 'Sugerir por mín/máx' });
      await s.explain(suggest, 'Llena cantidades para llegar al máximo');
      await suggest.click().catch(() => undefined);
      await s.page.waitForTimeout(1200);
      await s.type(
        s.page.getByLabel('Notas').first(),
        'Para el fin de semana',
        'Notas para quien surte',
      );
      await s.explain(
        s.page.getByRole('button', { name: 'Guardar y enviar' }),
        'Envía el pedido a aprobación',
      );
    },
    branch,
  );
});

test('logistica-traspasos-nuevo', async ({ browser, baseURL }) => {
  const com = await locationId(api, 'COM');
  await record(
    browser,
    baseURL!,
    'logistica-traspasos-nuevo',
    '/logistica/traspasos/nuevo',
    async (s) => {
      await s.pick('Destino', 'Sucursal que recibe', undefined, /^SUC-01/);
      await s.pick('Artículo', 'Artículo a enviar', 'HAR', /HAR-001/);
      await s.type(
        s.page.getByLabel('Cantidad', { exact: true }).first(),
        '5',
        'Cantidad en unidad base',
      );
      await s.type(
        s.page.getByLabel('Notas').first(),
        'Entregar temprano',
        'Instrucciones para quien recibe',
      );
      await s.explain(
        s.page.getByRole('button', { name: 'Guardar borrador' }),
        'Guarda; el inventario se mueve al despachar',
      );
    },
    com,
  );
});

test('logistica-traspasos-recibir', async ({ browser, baseURL }) => {
  const page = await (await api.get('/api/v1/transfers?status=Dispatched&pageSize=1')).json();
  test.skip(
    page.items.length === 0,
    'No hay traspasos en tránsito (corre npm run lighthouse o el E2E 06).',
  );
  const transfer = page.items[0] as { id: string };
  await record(
    browser,
    baseURL!,
    'logistica-traspasos-recibir',
    `/logistica/traspasos/${transfer.id}/recibir`,
    async (s) => {
      const received = s.page.getByLabel(/^Recibido de /).first();
      await s.explain(received, 'Viene lo enviado; corrige si llegó menos');
      await s.type(received, '0.5', 'Escribe lo que realmente llegó');
      await s.pick('Motivo del faltante', 'Si falta algo, el motivo es obligatorio');
      await s.explain(
        s.page.getByRole('button', { name: 'Recibir', exact: true }),
        'Recibe y suma a tu existencia',
      );
    },
  );
});

test('produccion-recetas-nueva', async ({ browser, baseURL }) => {
  await record(
    browser,
    baseURL!,
    'produccion-recetas-nueva',
    '/produccion/recetas/nueva',
    async (s) => {
      await s.pick('Producto', 'Producto que se fabrica', 'E2E', /E2E-PT/);
      await s.type(s.page.getByLabel('Rendimiento'), '10', 'Cuánto produce la receta');
      await s.pick('Componente', 'Componente que consume', 'HAR', /HAR-001/);
      await s.type(
        s.page.getByLabel('Cantidad', { exact: true }).first(),
        '6',
        'Cantidad para ese rendimiento',
      );
      await s.type(
        s.page.getByLabel('Merma', { exact: true }).first(),
        '2.5',
        '% de merma esperada',
      );
      await s.explain(
        s.page.getByRole('button', { name: 'Agregar componente' }),
        'Agrega más componentes',
      );
    },
  );
});

test('produccion-ordenes-nueva', async ({ browser, baseURL }) => {
  const product = await ensureProduct(api);
  await ensureActiveRecipe(api, product);
  const factory = await locationId(api, 'FAB');
  await record(
    browser,
    baseURL!,
    'produccion-ordenes-nueva',
    '/produccion/ordenes/nueva',
    async (s) => {
      await s.pick('Producto', 'Producto a fabricar (usa su receta activa)', 'E2E', /E2E-PT/);
      await s.type(s.page.getByLabel('Cantidad planeada'), '20', 'Cuánto producir');
      await s.page.waitForTimeout(1200);
      await s.explain(
        s.page.getByText(/Explosi|Disponible/).first(),
        'Lo que se necesita y si alcanza (rojo = falta)',
        2500,
      );
      await s.explain(
        s.page.getByRole('button', { name: 'Guardar borrador' }),
        'Guarda; luego se libera y completa',
      );
    },
    factory,
  );
});

test('produccion-ordenes-completar', async ({ browser, baseURL }) => {
  const product = await ensureProduct(api);
  await ensureActiveRecipe(api, product);
  const factory = await locationId(api, 'FAB');
  let order = await (
    await api.post('/api/v1/production-orders', {
      data: {
        locationId: factory,
        outputItemId: product,
        plannedQty: 10,
        scheduledDate: TODAY,
        notes: 'Video de ayuda',
      },
    })
  ).json();
  order = await (
    await api.post(`/api/v1/production-orders/${order.id}/release`, {
      data: { version: order.version },
    })
  ).json();
  try {
    await record(
      browser,
      baseURL!,
      'produccion-ordenes-completar',
      `/produccion/ordenes/${order.id}/completar`,
      async (s) => {
        await s.type(s.page.getByLabel('Cantidad producida'), '9.5', 'Lo que realmente se produjo');
        const actual = s.page.getByLabel(/^Consumo real/).first();
        await s.explain(actual, 'Consumo real de cada componente (viene el teórico)');
        await s.explain(
          s.page.getByRole('button', { name: 'Completar', exact: true }),
          'Revisa costo y merma, y completa',
        );
      },
      factory,
    );
  } finally {
    const detail = await (await api.get(`/api/v1/production-orders/${order.id}`)).json();
    await api.post(`/api/v1/production-orders/${order.id}/cancel`, {
      data: { version: detail.version },
    });
  }
});

test('compras-proveedores-nuevo', async ({ browser, baseURL }) => {
  await record(
    browser,
    baseURL!,
    'compras-proveedores-nuevo',
    '/compras/proveedores/nuevo',
    async (s) => {
      await s.type(
        s.page.getByLabel('RFC', { exact: true }),
        'ABC010203XYZ',
        'RFC: se valida el formato',
      );
      await s.type(
        s.page.getByLabel('Razón social'),
        'Lácteos del Norte SA de CV',
        'Nombre fiscal',
      );
      await s.type(s.page.getByLabel('Contacto'), 'Laura Pérez', 'Persona de contacto');
      await s.type(s.page.getByLabel('Teléfono'), '6691234567', 'Teléfono');
      await s.type(s.page.getByLabel('Correo'), 'ventas@lacteos.mx', 'Correo para pedidos');
      await s.type(s.page.getByLabel('Días de crédito'), '30', 'Plazo de pago');
      await s.explain(
        s.page.getByRole('button', { name: 'Crear proveedor' }),
        'Crea y luego agrega sus artículos',
      );
    },
  );
});

test('compras-requisiciones-nueva', async ({ browser, baseURL }) => {
  const com = await locationId(api, 'COM');
  await ensurePreferredSupplier(api, 'HAR-001');
  await record(
    browser,
    baseURL!,
    'compras-requisiciones-nueva',
    '/compras/requisiciones/nueva',
    async (s) => {
      await s.explain(s.page.getByLabel('Se requiere para'), 'Fecha en que se necesita');
      await s.pick('Artículo', 'Artículo a comprar', 'HAR', /HAR-001/);
      await s.explain(
        s.page.getByRole('combobox', { name: 'Proveedor' }).first(),
        'Se propone el proveedor preferido',
      );
      await s.type(
        s.page.getByLabel('Cantidad', { exact: true }).first(),
        '4',
        'Cantidad en unidad de compra',
      );
      await s.explain(
        s.page.getByRole('button', { name: 'Guardar y enviar' }),
        'Envía a aprobación',
      );
    },
    com,
  );
});

test('compras-ordenes-nueva', async ({ browser, baseURL }) => {
  const com = await locationId(api, 'COM');
  const supplier = await ensurePreferredSupplier(api, 'HAR-001');
  await record(
    browser,
    baseURL!,
    'compras-ordenes-nueva',
    '/compras/ordenes/nueva',
    async (s) => {
      await s.pick(
        'Proveedor',
        'Proveedor al que se compra',
        supplier.slice(0, 8),
        new RegExp(`^${supplier.slice(0, 8)}`),
      );
      await s.pick('Artículo', 'Artículo', 'HAR', /HAR-001/);
      await s.type(
        s.page.getByLabel('Cantidad', { exact: true }).first(),
        '2',
        'Cantidad en unidad de compra',
      );
      await s.explain(
        s.page.getByLabel('Precio').first(),
        'Precio sin IVA (se propone el del proveedor)',
      );
      await s.explain(s.page.getByText('Total').last(), 'Subtotal, IVA y total');
      await s.explain(
        s.page.getByRole('button', { name: 'Guardar y enviar' }),
        'Envía (si supera el umbral, a aprobación)',
      );
    },
    com,
  );
});

test('compras-recepciones-nueva', async ({ browser, baseURL }) => {
  const com = await locationId(api, 'COM');
  await ensurePreferredSupplier(api, 'HAR-001');
  const flour = await itemId(api, 'HAR-001');
  const offers = await (await api.get(`/api/v1/items/${flour}/supplier-offers`)).json();
  const preferred = offers.offers.find((o: { isPreferred: boolean }) => o.isPreferred);
  let order = await (
    await api.post('/api/v1/purchase-orders', {
      data: {
        supplierId: preferred.supplierId,
        deliveryLocationId: com,
        expectedDate: null,
        notes: 'Video de ayuda',
        lines: [{ itemId: flour, quantity: 2, unitPrice: null }],
      },
    })
  ).json();
  order = await (
    await api.post(`/api/v1/purchase-orders/${order.id}/submit`, {
      data: { version: order.version },
    })
  ).json();
  if (order.status !== 'Approved') {
    order = await (
      await api.post(`/api/v1/purchase-orders/${order.id}/approve`, {
        data: { version: order.version },
      })
    ).json();
  }
  try {
    await record(
      browser,
      baseURL!,
      'compras-recepciones-nueva',
      `/compras/recepciones/nueva?oc=${order.id}`,
      async (s) => {
        await s.type(
          s.page.getByLabel('Factura del proveedor'),
          'F-1234',
          'Folio de la factura o remisión',
        );
        await s.explain(
          s.page.getByLabel('Recibido').first(),
          'Cantidad recibida en unidad de compra',
        );
        await s.type(
          s.page.getByLabel('Lote', { exact: true }).first(),
          'L-2410',
          'Lote del proveedor',
        );
        await s.explain(
          s.page.getByLabel('Caducidad').first(),
          'Sin fecha se propone hoy + vida útil',
        );
        await s.explain(
          s.page.getByRole('button', { name: 'Registrar recepción' }),
          'Registra la entrada al inventario',
        );
      },
      com,
    );
  } finally {
    const detail = await (await api.get(`/api/v1/purchase-orders/${order.id}`)).json();
    await api.post(`/api/v1/purchase-orders/${order.id}/cancel`, {
      data: { version: detail.version },
    });
  }
});

test('admin-usuarios-nuevo', async ({ browser, baseURL }) => {
  await record(browser, baseURL!, 'admin-usuarios-nuevo', '/admin/usuarios/nuevo', async (s) => {
    await s.type(s.page.getByLabel('Nombre completo'), 'Ana Torres', 'Nombre completo');
    await s.type(
      s.page.getByLabel('Correo electrónico'),
      'ana.torres@cafeteria.mx',
      'Correo: con él inicia sesión',
    );
    const generate = s.page.getByRole('button', { name: 'Generar' });
    await s.explain(generate, 'Genera una contraseña inicial segura');
    await generate.click().catch(() => undefined);
    await s.pick('Roles', 'Roles: qué puede hacer', undefined, /Encargado de sucursal/);
    await s.page.keyboard.press('Escape');
    await s.pick('Ubicaciones permitidas', 'Dónde puede trabajar', undefined, /^SUC-01/);
    await s.page.keyboard.press('Escape');
    await s.explain(
      s.page.getByRole('combobox', { name: 'Ubicación default' }),
      'La que verá activa al entrar',
    );
    await s.explain(s.page.getByRole('button', { name: 'Crear usuario' }), 'Crea la cuenta');
  });
});

test('admin-roles-nuevo', async ({ browser, baseURL }) => {
  await record(browser, baseURL!, 'admin-roles-nuevo', '/admin/roles/nuevo', async (s) => {
    await s.type(s.page.getByLabel('Nombre'), 'Auditor', 'Nombre del rol');
    await s.type(
      s.page.getByLabel('Descripción'),
      'Consulta inventario y bitácora',
      'Para qué sirve',
    );
    const checks = s.page.getByRole('checkbox');
    await s.explain(checks.first(), 'Marca los permisos de cada módulo', 2000);
    for (let i = 0; i < 3; i++) {
      await checks
        .nth(i)
        .check()
        .catch(() => undefined);
      await s.page.waitForTimeout(400);
    }
    await s.explain(
      s.page.getByRole('button', { name: /Crear rol|Guardar/ }).first(),
      'Guarda el rol',
    );
  });
});
