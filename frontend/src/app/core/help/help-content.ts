/**
 * Manual de usuario por pantalla (botón de ayuda flotante). La clave es el patrón de la ruta
 * (`logistica/traspasos/:id/recibir`; el tablero es `''`). `video` es un archivo de `public/help/` que graba
 * `npm run help:record` (scripts/help-videos); si falta, el panel muestra solo el texto.
 */
export interface HelpField {
  name: string;
  help: string;
}

export interface HelpTopic {
  title: string;
  summary: string;
  steps?: string[];
  fields?: HelpField[];
  tips?: string[];
  video?: string;
}

export const GENERIC_HELP: HelpTopic = {
  title: 'Ayuda',
  summary:
    'Usa el menú lateral para moverte entre módulos. Lo que ves depende de tu rol y de la ubicación activa (arriba a la derecha).',
  tips: [
    'Cambia la ubicación activa en la barra superior para trabajar con otra sucursal, la fábrica o el comisariato.',
    'Desde el menú de tu usuario puedes cambiar tu contraseña, el tema claro u oscuro y cerrar sesión.',
  ],
};

const LIST_TIPS = [
  'Toca un renglón para abrir el detalle.',
  'Ordena con los encabezados de la tabla y busca por folio o nombre.',
];

const ITEM_FIELDS: HelpField[] = [
  { name: 'SKU', help: 'Clave única del artículo (ej. HAR-001). No se puede repetir.' },
  { name: 'Nombre', help: 'Cómo lo verán todos en listas, pedidos y documentos.' },
  {
    name: 'Tipo',
    help: 'Materia prima, intermedio o producto terminado; define si puede tener receta.',
  },
  { name: 'Categoría', help: 'Agrupa artículos para filtrar y para los conteos por categoría.' },
  {
    name: 'Unidad base',
    help: 'Unidad en la que se guarda la existencia (kg, l, pza). No cambia después de tener movimientos.',
  },
  {
    name: 'Unidad de compra y factor',
    help: 'Cómo se compra (ej. caja) y cuántas unidades base trae (ej. 25 kg).',
  },
  {
    name: 'Maneja lotes y vida útil',
    help: 'Actívalo si el artículo caduca: pedirá lote y caducidad al recibir; la vida útil propone la caducidad.',
  },
  { name: 'Almacenamiento', help: 'Ambiente, refrigerado o congelado.' },
  { name: 'IVA', help: 'Tasa que se aplica en las órdenes de compra.' },
  {
    name: 'Mín/Máx por ubicación',
    help: 'Pestaña para fijar mínimos y máximos; alimentan las alertas y el pedido sugerido.',
  },
];

const ITEM_FORM: HelpTopic = {
  title: 'Alta y edición de artículos',
  summary:
    'Registra un insumo, intermedio o producto terminado con su unidad, lotes e impuestos. Todo lo que se compra, produce o mueve en inventario es un artículo.',
  steps: [
    'Captura SKU y nombre, y elige tipo y categoría.',
    'Define la unidad base y, si se compra en otra presentación, la unidad de compra y su factor.',
    'Indica si maneja lotes y su vida útil, el almacenamiento y el IVA.',
    'Guarda. En la edición, ajusta los mín/máx por ubicación en su pestaña.',
  ],
  fields: ITEM_FIELDS,
  video: 'catalogos-articulos-nuevo.webm',
};

const USER_FORM: HelpTopic = {
  title: 'Alta y edición de usuarios',
  summary:
    'Crea la cuenta de una persona, con sus roles (qué puede hacer) y las ubicaciones en las que puede trabajar.',
  steps: [
    'Escribe nombre completo y correo (será su usuario).',
    'Genera o escribe una contraseña inicial y compártela con la persona; ella puede cambiarla desde su menú.',
    'Elige uno o varios roles y las ubicaciones permitidas, y marca su ubicación default.',
    'Guarda. En la edición puedes desactivar la cuenta o restablecer su contraseña.',
  ],
  fields: [
    { name: 'Nombre completo', help: 'Aparece en la bitácora y en los documentos que registre.' },
    { name: 'Correo electrónico', help: 'Con él inicia sesión. Debe ser único.' },
    {
      name: 'Contraseña inicial',
      help: 'Mínimo 10 caracteres, con mayúscula, minúscula y número; "Generar" crea una segura.',
    },
    { name: 'Roles', help: 'Conjuntos de permisos (ej. Encargado de sucursal).' },
    { name: 'Ubicaciones permitidas', help: 'Dónde puede consultar y registrar movimientos.' },
    { name: 'Ubicación default', help: 'La que verá activa al iniciar sesión.' },
  ],
  video: 'admin-usuarios-nuevo.webm',
};

const ROLE_FORM: HelpTopic = {
  title: 'Alta y edición de roles',
  summary:
    'Un rol agrupa permisos. Asignas roles a los usuarios en lugar de dar permisos uno por uno.',
  steps: [
    'Escribe el nombre y una descripción breve.',
    'Marca en la matriz los permisos de cada módulo.',
    'Guarda. Los usuarios con ese rol reciben los cambios al renovar su sesión.',
  ],
  fields: [
    { name: 'Nombre', help: 'Cómo se elegirá al asignarlo (ej. Almacén).' },
    { name: 'Descripción', help: 'Para qué sirve el rol.' },
    { name: 'Permisos', help: 'Ver, crear, aprobar, etc. por módulo.' },
  ],
  video: 'admin-roles-nuevo.webm',
};

const SUPPLIER_FORM: HelpTopic = {
  title: 'Alta y edición de proveedores',
  summary:
    'Registra los datos fiscales y de contacto del proveedor y los artículos que surte con su precio.',
  steps: [
    'Captura RFC y razón social; el RFC se valida.',
    'Agrega contacto, teléfono, correo y días de crédito.',
    'Guarda y, en la edición, agrega los artículos que surte con precio y tiempo de entrega; marca el preferido.',
  ],
  fields: [
    {
      name: 'RFC',
      help: '12 caracteres (persona moral) o 13 (física). No se repite, salvo los genéricos.',
    },
    { name: 'Razón social', help: 'Nombre fiscal del proveedor.' },
    { name: 'Contacto, teléfono y correo', help: 'Para pedir y aclarar entregas.' },
    { name: 'Días de crédito', help: 'Plazo de pago acordado.' },
    {
      name: 'Artículos del proveedor',
      help: 'Precio sin IVA en la unidad de compra; el preferido se propone en requisiciones.',
    },
  ],
  video: 'compras-proveedores-nuevo.webm',
};

const REQUISITION_FORM: HelpTopic = {
  title: 'Requisición de compra',
  summary:
    'Solicitud interna de compra de la fábrica o el comisariato. Una vez aprobada se convierte en orden de compra.',
  steps: [
    'Indica para cuándo se requiere y notas si hace falta.',
    'Agrega artículos y cantidades en su unidad de compra; se propone el proveedor preferido con su precio.',
    'Guarda como borrador o "Guardar y enviar" para que la aprueben.',
  ],
  fields: [
    { name: 'Se requiere para', help: 'Fecha en que se necesita el material.' },
    { name: 'Artículo y cantidad', help: 'En la unidad de compra (ej. cajas).' },
    { name: 'Proveedor', help: 'Sugerido por línea; puedes cambiarlo.' },
    { name: 'Notas', help: 'Motivo o aclaraciones para quien aprueba.' },
  ],
  video: 'compras-requisiciones-nueva.webm',
};

const PURCHASE_ORDER_FORM: HelpTopic = {
  title: 'Orden de compra',
  summary:
    'Pedido formal a un proveedor con precios sin IVA. Si el subtotal supera el umbral configurado, requiere aprobación.',
  steps: [
    'Elige el proveedor; la entrega es en tu ubicación activa.',
    'Agrega artículos, cantidades y precio en la unidad de compra (se propone el precio del proveedor).',
    'Revisa subtotal, IVA y total, y "Guardar y enviar".',
  ],
  fields: [
    { name: 'Proveedor', help: 'Solo proveedores activos.' },
    { name: 'Fecha esperada', help: 'Opcional; cuándo debe llegar.' },
    {
      name: 'Cantidad y precio',
      help: 'En unidad de compra y sin IVA; el IVA sale de cada artículo.',
    },
    { name: 'Notas', help: 'Condiciones o instrucciones para el proveedor.' },
  ],
  video: 'compras-ordenes-nueva.webm',
};

const BRANCH_ORDER_FORM: HelpTopic = {
  title: 'Pedido de sucursal',
  summary:
    'La sucursal pide a la fábrica o al comisariato lo que necesita. Al aprobarse se generan los traspasos.',
  steps: [
    'Elige a quién pedir y para cuándo se requiere.',
    '"Sugerir por mín/máx" llena las cantidades para llegar al máximo de cada artículo.',
    'Ajusta o agrega artículos y "Guardar y enviar".',
  ],
  fields: [
    { name: 'Sucursal que pide', help: 'Tu sucursal activa (solo cambia si ves varias).' },
    { name: 'Pedir a', help: 'Fábrica o comisariato que surte.' },
    { name: 'Se requiere para', help: 'Fecha en que lo necesitas.' },
    { name: 'Cantidad', help: 'En la unidad base; debajo ves mín, máx y existencia.' },
  ],
  video: 'logistica-pedidos-nuevo.webm',
};

const TRANSFER_FORM: HelpTopic = {
  title: 'Traspaso',
  summary:
    'Envío de mercancía entre ubicaciones. Se guarda como borrador; el inventario se mueve al despachar.',
  steps: [
    'Elige el destino (sucursal); el origen es tu ubicación activa.',
    'Agrega artículos y cantidades; en artículos con lote puedes elegirlo al despachar.',
    'Guarda el borrador y luego "Despachar" desde su detalle con vehículo y chofer.',
  ],
  fields: [
    { name: 'Destino', help: 'A dónde va la mercancía.' },
    {
      name: 'Artículo y cantidad',
      help: 'En unidad base; se valida contra la existencia al despachar.',
    },
    { name: 'Notas', help: 'Instrucciones para quien recibe.' },
  ],
  video: 'logistica-traspasos-nuevo.webm',
};

const RECIPE_FORM: HelpTopic = {
  title: 'Receta',
  summary:
    'Lista de componentes para fabricar un intermedio o terminado. Si la receta ya se usó, guardar crea una versión nueva.',
  steps: [
    'Elige el producto y su rendimiento (cuánto sale).',
    'Agrega cada componente con su cantidad y % de merma.',
    'Guarda. En el historial puedes activar otra versión.',
  ],
  fields: [
    { name: 'Rendimiento', help: 'Cantidad que produce la receta, en la unidad del producto.' },
    { name: 'Componente y cantidad', help: 'Lo que consume para ese rendimiento.' },
    { name: '% de merma', help: 'Pérdida esperada; se suma al consumo teórico.' },
  ],
  video: 'produccion-recetas-nueva.webm',
};

const PRODUCTION_ORDER_FORM: HelpTopic = {
  title: 'Orden de producción',
  summary:
    'Planea cuánto producir. La explosión muestra lo que se necesita de cada componente y si alcanza (en rojo lo faltante).',
  steps: [
    'Elige el producto (usa su receta activa) y la cantidad planeada.',
    'Revisa la explosión con disponibilidad.',
    'Fija la fecha programada y guarda; luego "Liberar" y "Completar" desde el detalle.',
  ],
  fields: [
    { name: 'Producto', help: 'Debe tener receta activa.' },
    { name: 'Cantidad planeada', help: 'En la unidad del producto.' },
    { name: 'Fecha programada', help: 'Aparece en el tablero el día que toca.' },
  ],
  video: 'produccion-ordenes-nueva.webm',
};

export const HELP: Record<string, HelpTopic> = {
  '': {
    title: 'Tablero',
    summary:
      'Resumen de la ubicación activa: alertas de inventario y documentos que requieren tu atención.',
    tips: [
      'Las tarjetas en naranja tienen pendientes; tócalas para abrir la lista filtrada.',
      'Con acceso a todas las ubicaciones verás la gráfica de artículos bajo mínimo por ubicación; toca una barra para ir a ella.',
    ],
  },
  perfil: {
    title: 'Cambiar contraseña',
    summary: 'Cambia tu contraseña. Después de guardar vuelves a iniciar sesión con la nueva.',
    fields: [
      { name: 'Contraseña actual', help: 'La que usas hoy.' },
      {
        name: 'Nueva contraseña',
        help: 'Mínimo 10 caracteres, con mayúscula, minúscula y número.',
      },
    ],
  },
  'sin-acceso': {
    title: 'Sin acceso',
    summary:
      'Tu rol no permite abrir esa pantalla. Si la necesitas, pide el permiso a un administrador.',
  },

  // Inventario
  'inventario/existencias': {
    title: 'Existencias',
    summary: 'Cuánto hay de cada artículo en la ubicación activa, con su costo promedio y valor.',
    tips: [
      'Toca un renglón para ver sus lotes y caducidades.',
      '"Solo bajo mínimo" y "Ver lotes por caducar" filtran lo urgente.',
      'El ícono de la derecha abre el kardex del artículo.',
    ],
  },
  'inventario/kardex': {
    title: 'Kardex',
    summary: 'Todos los movimientos de inventario con su costo, documento de origen y usuario.',
    tips: [
      'Filtra por ubicación, artículo, tipo de movimiento y periodo.',
      'Eligiendo un artículo verás el saldo después de cada movimiento.',
      'El folio del documento abre su detalle.',
    ],
  },
  'inventario/ajustes': {
    title: 'Ajustes',
    summary: 'Mermas, caducados, dañados, uso interno y correcciones registrados.',
    tips: LIST_TIPS,
  },
  'inventario/ajustes/nuevo': {
    title: 'Nuevo ajuste',
    summary:
      'Corrige la existencia por merma, caducidad, daño, uso interno o corrección. Cantidades negativas sacan y positivas meten.',
    steps: [
      'Elige el motivo.',
      'Agrega cada artículo con su cantidad (negativa para salidas).',
      'En entradas de artículos con lote captura lote, caducidad y costo.',
      '"Registrar ajuste": si falta existencia verás el detalle y no se registra nada.',
    ],
    fields: [
      { name: 'Motivo', help: 'Merma, caducado, dañado, uso interno o corrección.' },
      { name: 'Cantidad', help: 'Con signo: −5 saca 5, 5 mete 5.' },
      {
        name: 'Lote y caducidad',
        help: 'Solo en artículos con lotes; en salidas sin lote se toma el que caduca primero (FEFO).',
      },
      { name: 'Costo', help: 'Solo en entradas; afecta el costo promedio.' },
      { name: 'Notas', help: 'Explica la causa.' },
    ],
    video: 'inventario-ajustes-nuevo.webm',
  },
  'inventario/ajustes/:id': {
    title: 'Detalle de ajuste',
    summary: 'Lo registrado y los movimientos que generó (con el lote y el costo real aplicados).',
  },
  'inventario/existencias-iniciales': {
    title: 'Existencias iniciales',
    summary:
      'Carga única de existencias al empezar a usar el sistema, desde un CSV. Si hay un solo error, no se carga nada.',
    steps: [
      'Descarga la plantilla.',
      'Llénala con ubicación, SKU, cantidad, costo y lote.',
      'Súbela, revisa la vista previa y confirma.',
    ],
  },
  'inventario/conteos': {
    title: 'Conteos físicos',
    summary: 'Conteos de anaquel. Al cerrarlos, las diferencias se ajustan automáticamente.',
    tips: ['"Nuevo conteo" pide ubicación y, si quieres, una categoría.', ...LIST_TIPS],
  },
  'inventario/conteos/:id': {
    title: 'Conteo físico',
    summary:
      'Captura lo que hay en anaquel. Se guarda solo mientras escribes; al cerrar se registran los ajustes por diferencia.',
    steps: [
      '"Iniciar conteo" toma la foto del sistema.',
      'Busca por nombre, SKU o lote y escribe lo contado; Enter pasa al siguiente.',
      '"Agregar artículo" si encuentras algo que no estaba en la lista.',
      '"Revisar y cerrar": revisa las diferencias y confirma.',
    ],
    fields: [
      { name: 'Contado', help: 'Lo que hay físicamente, en la unidad base.' },
      { name: 'Buscar', help: 'Filtra las líneas por nombre, SKU o lote.' },
    ],
    tips: ['El conteo es ciego: no muestra la existencia del sistema mientras capturas.'],
    video: 'inventario-conteos-captura.webm',
  },
  'inventario/consumos': {
    title: 'Consumos',
    summary: 'Salidas diarias de las sucursales.',
    tips: LIST_TIPS,
  },
  'inventario/consumos/nuevo': {
    title: 'Consumo del día',
    summary: 'Registra lo que se usó en la sucursal; se descuenta de la existencia al confirmarlo.',
    steps: [
      'Verifica que la ubicación activa sea tu sucursal.',
      'Busca el artículo, escribe la cantidad y Enter (si repites un artículo, se suma).',
      '"Registrar consumo" y confirma el resumen.',
    ],
    fields: [
      { name: 'Artículo', help: 'Busca por nombre o SKU.' },
      { name: 'Cantidad', help: 'En la unidad base.' },
      { name: 'Día', help: 'Por default hoy.' },
    ],
    video: 'inventario-consumos-nuevo.webm',
  },
  'inventario/consumos/:id': {
    title: 'Detalle de consumo',
    summary: 'Lo registrado y los movimientos que generó.',
  },

  // Logística
  'logistica/pedidos': {
    title: 'Pedidos',
    summary: 'Pedidos de las sucursales a la fábrica y al comisariato.',
    tips: ['La pestaña "Por aprobar" muestra los que debes revisar.', ...LIST_TIPS],
  },
  'logistica/pedidos/nuevo': BRANCH_ORDER_FORM,
  'logistica/pedidos/:id/editar': BRANCH_ORDER_FORM,
  'logistica/pedidos/:id': {
    title: 'Detalle de pedido',
    summary:
      'Estado del pedido. Quien surte lo aprueba (con cantidades aprobadas) o lo rechaza; al aprobar se crean los traspasos.',
    tips: ['Aprobar todo en 0 no está permitido.', '"Ir a despachar" abre el traspaso generado.'],
  },
  'logistica/traspasos': {
    title: 'Traspasos',
    summary: 'Envíos desde y hacia la ubicación activa.',
    tips: [
      '"Por despachar" y "En tránsito" muestran lo pendiente; "Recibir" abre la recepción.',
      ...LIST_TIPS,
    ],
  },
  'logistica/traspasos/nuevo': TRANSFER_FORM,
  'logistica/traspasos/:id/editar': TRANSFER_FORM,
  'logistica/traspasos/:id': {
    title: 'Detalle de traspaso',
    summary: 'Origen, destino, quién despachó y recibió, líneas con lotes y diferencias.',
    tips: ['"Despachar" pide vehículo y chofer y mueve el inventario a tránsito.'],
  },
  'logistica/traspasos/:id/recibir': {
    title: 'Recibir traspaso',
    summary:
      'Confirma lo que llegó. Lo enviado viene prellenado; si llega menos, indica el motivo del faltante.',
    steps: [
      'Revisa cada línea; cambia la cantidad si llegó menos.',
      'En faltantes elige el motivo (faltante, dañado…) y agrega notas.',
      '"Recibir" y confirma el resumen.',
    ],
    fields: [
      { name: 'Recibido', help: 'No puede ser mayor a lo enviado.' },
      { name: 'Motivo del faltante', help: 'Obligatorio si recibes menos.' },
    ],
    video: 'logistica-traspasos-recibir.webm',
  },

  // Producción
  'produccion/recetas': {
    title: 'Recetas',
    summary: 'Productos con receta activa y su versión.',
    tips: LIST_TIPS,
  },
  'produccion/recetas/nueva': RECIPE_FORM,
  'produccion/recetas/:id': RECIPE_FORM,
  'produccion/ordenes': {
    title: 'Órdenes de producción',
    summary: 'Producción planeada, liberada y completada.',
    tips: ['Filtra por estado y fecha programada.', ...LIST_TIPS],
  },
  'produccion/ordenes/nueva': PRODUCTION_ORDER_FORM,
  'produccion/ordenes/:id/editar': PRODUCTION_ORDER_FORM,
  'produccion/ordenes/:id': {
    title: 'Detalle de orden de producción',
    summary: 'Explosión, estado y, ya completada, costo y merma reales.',
    tips: ['"Liberar" la deja lista para producir; "Completar" registra lo producido.'],
  },
  'produccion/ordenes/:id/completar': {
    title: 'Completar orden de producción',
    summary:
      'Registra lo que realmente se produjo y consumió. Al confirmar, se descuentan los componentes y entra el producto.',
    steps: [
      'Captura la cantidad producida.',
      'Ajusta el consumo real de cada componente (viene el teórico).',
      'Opcional: elige lotes; revisa costo y merma, y "Completar".',
    ],
    fields: [
      { name: 'Producido', help: 'Cantidad real obtenida.' },
      { name: 'Consumo real', help: 'Lo que se usó de cada componente.' },
    ],
    video: 'produccion-ordenes-completar.webm',
  },

  // Compras
  'compras/proveedores': {
    title: 'Proveedores',
    summary: 'Datos fiscales, crédito y artículos que surte cada proveedor.',
    tips: LIST_TIPS,
  },
  'compras/proveedores/nuevo': SUPPLIER_FORM,
  'compras/proveedores/:id': SUPPLIER_FORM,
  'compras/requisiciones': {
    title: 'Requisiciones',
    summary: 'Solicitudes de compra de la fábrica y el comisariato.',
    tips: ['Selecciona aprobadas y "Convertir a OC" para agruparlas por proveedor.', ...LIST_TIPS],
  },
  'compras/requisiciones/nueva': REQUISITION_FORM,
  'compras/requisiciones/:id/editar': REQUISITION_FORM,
  'compras/requisiciones/:id': {
    title: 'Detalle de requisición',
    summary: 'Estado de la solicitud; se aprueba, rechaza o convierte a orden de compra.',
  },
  'compras/ordenes': {
    title: 'Órdenes de compra',
    summary: 'Compras a proveedores, con IVA.',
    tips: ['"Por aprobar" y "Por recibir" muestran lo pendiente.', ...LIST_TIPS],
  },
  'compras/ordenes/nueva': PURCHASE_ORDER_FORM,
  'compras/ordenes/:id/editar': PURCHASE_ORDER_FORM,
  'compras/ordenes/:id': {
    title: 'Detalle de orden de compra',
    summary: 'Totales, aprobación y avance de recepción por línea.',
    tips: [
      '"Recibir" registra la llegada de mercancía.',
      '"Cerrar con saldo" termina la OC aunque falte por recibir.',
    ],
  },
  'compras/recepciones': {
    title: 'Recepciones',
    summary: 'Entradas al inventario por compras. Para recibir, abre la orden de compra.',
    tips: LIST_TIPS,
  },
  'compras/recepciones/nueva': {
    title: 'Recepción de compra',
    summary:
      'Registra lo que entregó el proveedor contra la orden de compra; entra al inventario al confirmar.',
    steps: [
      'Escribe la factura del proveedor.',
      'Captura lo recibido por línea (hasta la tolerancia configurada).',
      'En artículos con lote captura lote y caducidad; "Registrar recepción".',
    ],
    fields: [
      { name: 'Factura del proveedor', help: 'Folio de su factura o remisión.' },
      { name: 'Cantidad', help: 'En la unidad de compra.' },
      { name: 'Lote y caducidad', help: 'Sin fecha se propone hoy más la vida útil.' },
    ],
    video: 'compras-recepciones-nueva.webm',
  },
  'compras/recepciones/:id': {
    title: 'Detalle de recepción',
    summary: 'Lo recibido con lotes, costo y factura.',
  },

  // Catálogos
  'catalogos/ubicaciones': {
    title: 'Ubicaciones',
    summary: 'Sucursales, fábrica y comisariato.',
    steps: [
      '"Nueva ubicación" abre el formulario.',
      'Captura código, nombre, tipo y dirección, y guarda.',
    ],
    fields: [
      { name: 'Código', help: 'Clave corta (ej. SUC-01).' },
      { name: 'Tipo', help: 'Sucursal, fábrica o comisariato; define qué operaciones permite.' },
    ],
    video: 'catalogos-ubicaciones.webm',
  },
  'catalogos/categorias': {
    title: 'Categorías',
    summary: 'Agrupan los artículos (ej. Secos, Lácteos). Toca una para editarla.',
  },
  'catalogos/unidades': {
    title: 'Unidades de medida',
    summary: 'kg, l, pza… Las existencias se guardan en la unidad base de cada artículo.',
  },
  'catalogos/articulos': {
    title: 'Artículos',
    summary: 'Materia prima, intermedios y producto terminado.',
    tips: ['"Importar CSV" da de alta o actualiza muchos a la vez.', ...LIST_TIPS],
  },
  'catalogos/articulos/importar': {
    title: 'Importar artículos',
    summary:
      'Alta o actualización masiva desde un CSV. Si hay un solo error, no se importa nada y verás el error por fila.',
    steps: [
      'Descarga la plantilla.',
      'Llénala y súbela.',
      'Corrige los errores marcados y vuelve a subirla.',
    ],
  },
  'catalogos/articulos/nuevo': ITEM_FORM,
  'catalogos/articulos/:id': ITEM_FORM,

  // Administración
  'admin/usuarios': {
    title: 'Usuarios',
    summary: 'Cuentas, roles y ubicaciones permitidas.',
    tips: ['Filtra por estado, rol o ubicación.', ...LIST_TIPS],
  },
  'admin/usuarios/nuevo': USER_FORM,
  'admin/usuarios/:id': USER_FORM,
  'admin/roles': {
    title: 'Roles',
    summary: 'Conjuntos de permisos que se asignan a los usuarios.',
    tips: LIST_TIPS,
  },
  'admin/roles/nuevo': ROLE_FORM,
  'admin/roles/:id': ROLE_FORM,
  'admin/bitacora': {
    title: 'Bitácora',
    summary: 'Quién cambió qué y cuándo. Toca un registro para ver los valores antes y después.',
    tips: ['Filtra por entidad, usuario y periodo.'],
  },
  'admin/configuracion': {
    title: 'Configuración',
    summary:
      'Parámetros generales: umbral de aprobación de OC, tolerancia de recepción, días de alerta de caducidad.',
  },
  'demo/componentes': {
    title: 'Componentes',
    summary:
      'Catálogo interno de componentes compartidos con datos de ejemplo (solo administradores).',
  },
};
