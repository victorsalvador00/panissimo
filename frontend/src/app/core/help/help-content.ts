/** A field of the screen and what to capture in it. */
export interface HelpField {
  name: string;
  text: string;
}

/** The manual of a screen (frontend §4.3). */
export interface HelpTopic {
  title: string;
  summary: string;
  steps?: readonly string[];
  fields?: readonly HelpField[];
  tips?: readonly string[];
  /** Video in `public/help/` (capture screens only); it downloads when the panel opens. */
  video?: string;
}

// Shared topics: the same form for "nuevo" and ":id/editar", or the same idea in several screens.

const ITEM_FORM: HelpTopic = {
  title: 'Artículo',
  summary:
    'Alta y edición de un artículo: materia prima, insumo, semiterminado o producto terminado, con sus unidades, lotes, impuestos y presentación.',
  steps: [
    'Captura el SKU: el código de Paníssimo, único, que identifica al artículo en todo el sistema y en la importación de órdenes.',
    'Elige el tipo, la categoría y la unidad base. La unidad de compra y su factor solo aplican a lo que se compra.',
    'Indica si lleva lotes y su vida útil en días: con lotes, cada entrada pide número de lote y las salidas van por FEFO.',
    'Para producto terminado elige la presentación: a granel (sucursales) o empaquetado (clientes), ligado a su versión a granel.',
    'Guarda. Después aparecen las pestañas Foto, Mín/Máx por ubicación y, si es a granel, sus versiones empaquetadas.',
  ],
  fields: [
    {
      name: 'Unidad base',
      text: 'En ella se guardan existencias y movimientos. En piezas no se aceptan decimales.',
    },
    {
      name: 'Múltiplo de OP',
      text: 'El plan sugiere producir en múltiplos de esta cantidad (charolas, tandas).',
    },
    { name: 'IVA', text: '0 % o 16 %; lo usan las órdenes de compra.' },
  ],
  tips: [
    'Si el artículo ya tiene movimientos no se pueden cambiar su unidad base ni el control de lotes.',
    'La pestaña Foto acepta una foto de la galería o de la cámara; se reduce a 512 px antes de subirla.',
  ],
};

const RECIPE_FORM: HelpTopic = {
  title: 'Receta',
  summary:
    'La receta de un semiterminado o producto terminado: cuánto produce (rendimiento) y qué consume, con su merma esperada. La pestaña Costos muestra el costo de cada versión.',
  steps: [
    'Elige el producto y captura el rendimiento: lo que se obtiene con las cantidades de abajo.',
    'Agrega los componentes (materia prima, insumo o semiterminado) con su cantidad y % de merma.',
    'Guarda. Si esta versión ya se usó en órdenes, se crea la versión siguiente y la anterior queda para esas órdenes.',
  ],
  tips: [
    'Las órdenes escalan los componentes a lo que se planea producir; la merma se suma al consumo teórico.',
    'En la pestaña Costos se ve el costo por unidad de cada versión y los insumos que subieron de precio.',
  ],
};

const PRODUCTION_ORDER_FORM: HelpTopic = {
  title: 'Orden de producción',
  summary:
    'Una orden para producir un producto en una fecha, área y turno, con su explosión de materiales calculada con la receta activa.',
  steps: [
    'Elige el producto, la cantidad, la fecha programada, el área y el turno.',
    'Revisa la explosión: lo que consume cada componente, la existencia y si falta algo.',
    'Guarda como borrador y libérala cuando se vaya a producir.',
  ],
  tips: ['El faltante no impide guardar: es un aviso para comprar o producir antes de cerrar.'],
};

const BRANCH_ORDER_FORM: HelpTopic = {
  title: 'Pedido de sucursal',
  summary:
    'Lo que la sucursal pide a la Planta para una fecha, con la existencia actual de cada artículo a la vista.',
  steps: [
    'Elige la fecha requerida.',
    'Agrega los artículos y cantidades, o usa "Sugerir por mín/máx" para llenar lo que falta hasta el máximo.',
    'Guarda y envíalo: la Planta lo aprueba y lo surte con traspasos.',
  ],
  tips: ['Un pedido enviado ya no se edita; si cambió algo, cancélalo y haz otro.'],
  video: 'pedido-sucursal.webm',
};

const TRANSFER_FORM: HelpTopic = {
  title: 'Traspaso',
  summary:
    'Envío de mercancía de una ubicación a otra. Se arma en borrador y se despacha cuando sale el vehículo.',
  steps: [
    'Elige el destino y agrega artículos y cantidades.',
    'Guarda el borrador. Al despachar se eligen los lotes (FEFO) y la mercancía sale del inventario.',
  ],
  tips: [
    'El destino recibe y anota faltantes o daños; la diferencia queda registrada en el traspaso.',
  ],
};

const VOUCHER_FORM: HelpTopic = {
  title: 'Vale interno',
  summary:
    'Movimiento entre subalmacenes de la misma ubicación (por ejemplo, de materias primas a producción).',
  steps: [
    'Elige el subalmacén de origen y el de destino.',
    'Agrega los artículos; el lote es opcional (si no lo eliges, se toma por FEFO al enviar).',
    'Guarda el borrador y envíalo; el subalmacén destino lo recibe.',
  ],
};

const CUSTOMER_ORDER_FORM: HelpTopic = {
  title: 'Pedido de cliente',
  summary: 'Pedido de un cliente con su punto de entrega, fecha y productos empaquetados.',
  steps: [
    'Elige el cliente y, si tiene varios, el punto de entrega.',
    'Captura la fecha requerida y la referencia del cliente (su número de pedido), si la hay.',
    'Agrega productos y cantidades. El precio se toma de la lista del cliente cuando existe.',
    'Guarda y confirma: el pedido entra al plan de producción.',
  ],
};

const SUPPLIER_FORM: HelpTopic = {
  title: 'Proveedor',
  summary:
    'Datos del proveedor y los artículos que vende con su precio, tiempo de entrega y si es el preferido.',
  fields: [
    {
      name: 'RFC',
      text: 'Se valida el formato; para proveedores sin RFC usa el genérico XAXX010101000.',
    },
    { name: 'Días de crédito', text: 'Plazo de pago acordado; es informativo.' },
  ],
  tips: ['El proveedor preferido de un artículo es el que propone la requisición sugerida.'],
};

const REQUISITION_FORM: HelpTopic = {
  title: 'Requisición',
  summary:
    'Solicitud interna de compra: qué se necesita, cuánto y para cuándo, con proveedor sugerido.',
  steps: [
    'Captura la fecha en que se necesita.',
    'Agrega artículos y cantidades en unidad de compra; al elegir un artículo se propone su proveedor preferido.',
    'Guarda y envíala para aprobación. Las aprobadas se convierten en órdenes de compra.',
  ],
};

const PURCHASE_ORDER_FORM: HelpTopic = {
  title: 'Orden de compra',
  summary: 'Compra a un proveedor con precios, IVA y fecha esperada de entrega.',
  steps: [
    'Elige el proveedor; sus artículos traen el último precio acordado.',
    'Captura cantidades y la fecha esperada.',
    'Guarda y envíala: si pasa del monto de aprobación, la aprueba un autorizado.',
  ],
  tips: ['Los totales se redondean por línea, igual que en la factura del proveedor.'],
};

const CUSTOMER_FORM: HelpTopic = {
  title: 'Cliente',
  summary: 'Datos del cliente, sus puntos de entrega y sus productos con clave y precio propios.',
  tips: ['Los pedidos y remisiones usan la clave del cliente y su precio cuando están capturados.'],
};

const USER_FORM: HelpTopic = {
  title: 'Usuario',
  summary: 'Cuenta de una persona: sus roles (qué puede hacer) y sus ubicaciones (dónde).',
  steps: [
    'Captura nombre y correo; al crearlo, una contraseña temporal.',
    'Asigna roles y ubicaciones. La ubicación predeterminada es la que ve al entrar.',
  ],
  tips: ['No puedes dar permisos que tú no tienes. Desactivar un usuario cierra sus sesiones.'],
};

const ROLE_FORM: HelpTopic = {
  title: 'Rol',
  summary: 'Conjunto de permisos que se asigna a los usuarios.',
  tips: ['Los cambios aplican a todos los usuarios con ese rol en pocos minutos.'],
};

/** Manual by route pattern (`HelpService`). Every route has one: a unit test checks it. */
export const HELP: Readonly<Record<string, HelpTopic>> = {
  '': {
    title: 'Inicio',
    summary:
      'El tablero de la ubicación activa: lo pendiente según tus permisos. Cada tarjeta abre su lista ya filtrada.',
    tips: [
      'Las alertas con algo pendiente (bajo mínimo, por caducar, alzas, pedidos vencidos) se marcan en naranja.',
      'En el celular hay acciones rápidas arriba: recibir traspaso, contar, cerrar producción…',
      'Cambia de ubicación en la barra superior para ver su tablero.',
    ],
  },
  login: {
    title: 'Iniciar sesión',
    summary: 'Entra con el correo y la contraseña que te dio el administrador.',
    tips: ['Tras varios intentos fallidos la cuenta se bloquea unos minutos.'],
  },
  perfil: {
    title: 'Mi perfil',
    summary: 'Tus datos, tus ubicaciones y el cambio de contraseña.',
    tips: ['Al cambiar la contraseña se cierran tus otras sesiones.'],
  },
  'sin-acceso': {
    title: 'Sin acceso',
    summary:
      'Tu usuario no tiene permiso para esa pantalla. Si la necesitas, pídelo al administrador.',
  },
  'demo/componentes': {
    title: 'Demostración de componentes',
    summary:
      'Muestra los controles compartidos del sistema; sirve para revisar el diseño. No guarda nada.',
  },

  // Inventario
  'inventario/existencias': {
    title: 'Existencias',
    summary:
      'Lo que hay en la ubicación activa y sus subalmacenes: cantidad, costo promedio, valor y nivel contra mín/máx.',
    tips: [
      'Expande un renglón para ver sus lotes; los vencidos aparecen en rojo.',
      '"Solo bajo mínimo" deja lo que hay que pedir o producir. Arriba se listan los lotes por caducar.',
      'El SKU abre el kardex del artículo.',
    ],
  },
  'inventario/analisis-consumo': {
    title: 'Análisis de consumo',
    summary:
      'Cuánto sale cada artículo por día en las últimas semanas completas, su tendencia y el mín/máx sugerido.',
    steps: [
      'Elige cuántas semanas analizar y busca el artículo.',
      'Expande un renglón para ver el consumo por día de la semana.',
      'Si el sugerido te convence, usa "Aplicar sugerido": queda como el mín/máx de esta ubicación.',
    ],
    tips: ['La tendencia compara las últimas 4 semanas contra las 4 anteriores.'],
  },
  'inventario/trazabilidad': {
    title: 'Trazabilidad',
    summary:
      'Sigue un lote por toda la cadena: de dónde viene (proveedor, OC, cierre) y a dónde llegó (lotes, traspasos, sucursales, clientes).',
    steps: [
      'Escribe un folio OC-, OP-, TR-, RM- o un número de lote y elige la entrada de la lista.',
      'La dirección se pone sola: hacia adelante para una OC, hacia atrás para una remisión y ambas para lo demás. Puedes cambiarla.',
      'Usa "Rastrear". También llegas aquí con el botón "Rastrear" de existencias, kardex, OP, OC, recepciones, traspasos y remisiones.',
    ],
    tips: ['Cada consulta queda en la bitácora con la entrada y la dirección.'],
  },
  'inventario/trazabilidad/:sourceType/:sourceId': {
    title: 'Resultado de trazabilidad',
    summary:
      'La cadena de la entrada en un mapa por etapas, el resumen para un retiro y la bitácora de eventos en orden.',
    steps: [
      'En el mapa, el grosor de la cinta es la cantidad de piezas. Toca una tarjeta para resaltar su cadena y ver su ficha.',
      'Origen, Cadena completa y Destino cambian qué se resalta. Esc cierra la ficha; un segundo Esc quita la selección.',
      'Resumen: dónde queda existencia hoy, qué se remisionó a cada cliente, qué lotes de materia prima se usaron y la pérdida en tránsito.',
      'Bitácora: los eventos por día; un renglón te lleva a su tarjeta en el mapa.',
    ],
    tips: [
      'Arrastra el fondo del mapa para recorrerlo; con las flechas vas a padres, hijos y tarjetas del mismo carril.',
      '"Exportar CSV" baja la bitácora y el resumen. Los costos solo aparecen con permiso de producción o compras.',
    ],
    video: 'trazabilidad.webm',
  },
  'inventario/kardex': {
    title: 'Kardex',
    summary:
      'Todos los movimientos de inventario con su documento, costo y, por artículo, el saldo corrido.',
    tips: [
      'Elige un artículo para ver el saldo después de cada movimiento. El folio abre el documento que lo causó.',
    ],
  },
  'inventario/ajustes': {
    title: 'Ajustes',
    summary:
      'Entradas y salidas manuales: correcciones, mermas, caducados, dañados, uso interno y devoluciones.',
  },
  'inventario/ajustes/nuevo': {
    title: 'Nuevo ajuste',
    summary: 'Registra una entrada o salida que no viene de otro documento, con su motivo.',
    steps: [
      'Elige el subalmacén y el motivo.',
      'Agrega los artículos. En "Corrección" cada línea puede ser entrada o salida; en los demás motivos todas son salidas.',
      'En entradas con lotes captura el lote y su caducidad; en salidas elige el lote o deja que se tome por FEFO.',
      'Registra y confirma el resumen.',
    ],
    tips: ['Si no hay existencia suficiente, el sistema muestra lo que falta y no registra nada.'],
    video: 'ajuste.webm',
  },
  'inventario/ajustes/:id': {
    title: 'Ajuste',
    summary: 'Detalle de un ajuste registrado: líneas, lotes y movimientos de kardex que generó.',
  },
  'inventario/conteos': {
    title: 'Conteos',
    summary:
      'Conteos físicos de la ubicación. Al cerrar, la diferencia contra lo esperado se registra como ajuste.',
    tips: ['Solo puede haber un conteo en proceso por ubicación.'],
  },
  'inventario/conteos/:id': {
    title: 'Conteo físico',
    summary:
      'Captura a ciegas: anota lo que cuentas sin ver la existencia del sistema. Se guarda solo mientras capturas.',
    steps: [
      'Busca el artículo, cuenta y escribe la cantidad (Enter pasa al siguiente).',
      'Si falta un artículo en la lista, agrégalo.',
      'Al terminar, cierra el conteo: se registran los ajustes por la diferencia.',
    ],
    tips: ['Puedes dejar el conteo y seguir después; lo capturado no se pierde.'],
    video: 'conteo.webm',
  },
  'inventario/consumos': {
    title: 'Consumos',
    summary: 'Lo que la sucursal usa o vende del día (salidas de inventario), registrado por día.',
  },
  'inventario/consumos/nuevo': {
    title: 'Registrar consumo',
    summary: 'Captura rápida de lo consumido en el día: artículo, cantidad y Enter.',
    steps: [
      'Elige el día (hoy o uno anterior).',
      'Escribe el artículo, la cantidad y Enter; repetir un artículo suma a su línea.',
      'Revisa el resumen y confirma.',
    ],
    tips: ['El lote es opcional: si no lo eliges se descuenta por FEFO.'],
    video: 'consumo.webm',
  },
  'inventario/consumos/:id': {
    title: 'Consumo',
    summary: 'Detalle de un consumo registrado con sus líneas y lotes.',
  },
  'inventario/vales-internos': {
    title: 'Vales internos',
    summary:
      'Movimientos entre subalmacenes de la ubicación activa: por enviar, en tránsito y recibidos.',
  },
  'inventario/vales-internos/nuevo': VOUCHER_FORM,
  'inventario/vales-internos/:id/editar': VOUCHER_FORM,
  'inventario/vales-internos/:id': {
    title: 'Vale interno',
    summary:
      'Detalle del vale: origen, destino, líneas y, según su estado, enviar, recibir o cancelar.',
  },
  'inventario/vales-internos/:id/recibir': {
    title: 'Recibir vale interno',
    summary:
      'Confirma lo que llegó al subalmacén destino; cada línea viene prellenada con lo enviado.',
    tips: ['Si llegó menos, corrige la cantidad y anota el motivo.'],
  },
  'inventario/existencias-iniciales': {
    title: 'Existencias iniciales',
    summary: 'Carga de un archivo CSV con la existencia y el costo de arranque de cada artículo.',
    steps: [
      'Descarga la plantilla, llénala y súbela.',
      'Si hay errores se muestran por fila y no se registra nada.',
    ],
  },

  // Catálogos
  'catalogos/ubicaciones': {
    title: 'Ubicaciones',
    summary: 'La Planta, las sucursales y sus subalmacenes.',
    tips: [
      'Un subalmacén guarda existencia de su ubicación; los documentos eligen de cuál sale o entra.',
    ],
  },
  'catalogos/articulos': {
    title: 'Artículos',
    summary: 'Catálogo de materias primas, insumos, semiterminados y productos terminados.',
    tips: [
      '"Importar CSV" da de alta muchos artículos; "Importar fotos" sube fotos nombradas con el SKU.',
    ],
  },
  'catalogos/articulos/nuevo': ITEM_FORM,
  'catalogos/articulos/:id': ITEM_FORM,
  'catalogos/articulos/importar': {
    title: 'Importar artículos',
    summary: 'Alta masiva de artículos desde un CSV; todo o nada.',
    steps: [
      'Descarga la plantilla y llénala.',
      'Súbela: si hay errores se listan por fila y columna y no se crea ninguno.',
    ],
  },
  'catalogos/articulos/fotos': {
    title: 'Importar fotos',
    summary:
      'Sube muchas fotos a la vez; cada archivo se liga al artículo cuyo SKU es su nombre (TRENZA.jpg).',
    steps: [
      'Elige las fotos.',
      'Revisa que cada una encontró su artículo.',
      'Súbelas: se procesan una por una.',
    ],
    tips: ['Una foto nueva reemplaza la que tuviera el artículo.'],
  },
  'catalogos/categorias': {
    title: 'Categorías',
    summary: 'Agrupan los artículos para filtrar listas y organizar conteos.',
  },
  'catalogos/unidades': {
    title: 'Unidades de medida',
    summary: 'Kilogramo, gramo, litro, pieza, caja… En piezas no se permiten decimales.',
  },

  // Producción
  'produccion/recetas': {
    title: 'Recetas',
    summary:
      'Recetas activas de cada producto con su versión. Activa "Ver inactivas" para el historial.',
  },
  'produccion/recetas/nueva': RECIPE_FORM,
  'produccion/recetas/:id': RECIPE_FORM,
  'produccion/plan': {
    title: 'Plan de producción',
    summary:
      'Qué producir por día y área: pedidos de sucursal y de cliente, reposición a mínimo y semiterminados de otras órdenes, contra existencia y órdenes abiertas.',
    steps: [
      'Elige el rango de fechas y, si quieres, el área.',
      'Revisa "Por producir"; expande un renglón para ver los pedidos que lo originan.',
      'Elige los renglones, ajusta la cantidad (el múltiplo es una sugerencia) y genera las órdenes en borrador.',
    ],
    tips: ['Las órdenes generadas quedan ligadas a los pedidos que atienden.'],
  },
  'produccion/resumen': {
    title: 'Resumen de producción',
    summary:
      'Planeado contra producido, % de cumplimiento, costo y merma por área, producto o día en un periodo.',
    tips: ['Cada unidad va en su propio renglón: nunca se suman kilos con piezas.'],
  },
  'produccion/ordenes': {
    title: 'Órdenes de producción',
    summary: 'Órdenes por producir, en proceso, borradores y todas, con su avance.',
  },
  'produccion/ordenes/nueva': PRODUCTION_ORDER_FORM,
  'produccion/ordenes/:id/editar': PRODUCTION_ORDER_FORM,
  'produccion/ordenes/:id': {
    title: 'Orden de producción',
    summary: 'Detalle con componentes, cierres, pedidos que atiende e historial.',
    tips: [
      'Liberarla la deja lista para cerrar; con cierres registrados ya no se cancela.',
      'Cada cierre parcial genera un lote con su caducidad.',
    ],
  },
  'produccion/ordenes/:id/cerrar': {
    title: 'Cierre de producción',
    summary:
      'Registra lo producido y lo realmente consumido. Puede ser un cierre parcial o el final de la orden.',
    steps: [
      'Captura la cantidad producida: el consumo teórico se recalcula.',
      'Ajusta el consumo real de los componentes que cambiaron y elige lotes si hace falta.',
      'Revisa costo y merma en la barra de abajo.',
      'Registra el cierre parcial o cierra la orden; si quedó por debajo de lo planeado, elige el motivo.',
    ],
    tips: ['Al cambiar la cantidad solo se recalculan las líneas que no tocaste.'],
    video: 'cierre.webm',
  },
  'produccion/cierres': {
    title: 'Cierres de producción',
    summary: 'Todos los cierres con su orden, producto, turno, cantidad, costo y merma.',
  },
  'produccion/cierres/:id': {
    title: 'Cierre',
    summary: 'Detalle de un cierre: lo producido, el lote generado y los consumos con sus lotes.',
  },
  'produccion/importar': {
    title: 'Importar órdenes',
    summary: 'Crea órdenes de producción desde un Excel: primero se valida y luego se confirma.',
    steps: [
      'Descarga la plantilla y llena fecha, SKU, cantidad, área y turno.',
      'Súbela: los errores bloquean; los avisos deben aceptarse con la casilla.',
      'Confirma para crear las órdenes agrupadas.',
    ],
    tips: ['Un archivo ya importado se detecta y pide confirmación.'],
  },
  'produccion/importaciones': {
    title: 'Importaciones de órdenes',
    summary: 'Historial de archivos importados y las órdenes que creó cada uno.',
  },
  'produccion/importaciones/:id': {
    title: 'Importación',
    summary: 'Detalle de una importación: archivo, avisos y órdenes creadas.',
  },
  'produccion/areas': {
    title: 'Áreas de producción',
    summary: 'Hornos, pastelería, empaque… Ordenan el plan y el resumen de producción.',
  },

  // Logística
  'logistica/flotilla': {
    title: 'Vehículos y choferes',
    summary:
      'Catálogo de la flotilla. Al despachar un traspaso o una remisión se elige un vehículo y un chofer activos de aquí.',
    steps: [
      'Da de alta cada vehículo con sus placas (únicas) y una descripción que lo identifique.',
      'Da de alta a los choferes; el teléfono es opcional.',
      'Desactiva lo que ya no se usa: deja de aparecer al despachar y los documentos anteriores conservan su nombre.',
    ],
  },
  'logistica/pedidos': {
    title: 'Pedidos de sucursal',
    summary: 'Pedidos de la sucursal activa; quien aprueba ve también la pestaña "Por aprobar".',
  },
  'logistica/pedidos/nuevo': BRANCH_ORDER_FORM,
  'logistica/pedidos/:id/editar': BRANCH_ORDER_FORM,
  'logistica/pedidos/:id': {
    title: 'Pedido de sucursal',
    summary:
      'Detalle del pedido: lo pedido, lo aprobado y lo surtido. Quien aprueba puede ajustar cantidades.',
  },
  'logistica/traspasos': {
    title: 'Traspasos',
    summary: 'Traspasos por despachar, en tránsito y recibidos de la ubicación activa.',
  },
  'logistica/traspasos/nuevo': TRANSFER_FORM,
  'logistica/traspasos/:id/editar': TRANSFER_FORM,
  'logistica/traspasos/:id': {
    title: 'Traspaso',
    summary: 'Detalle del traspaso: líneas, lotes, despacho y recepción con diferencias.',
  },
  'logistica/traspasos/:id/recibir': {
    title: 'Recibir traspaso',
    summary: 'Confirma lo que llegó a la sucursal; cada tarjeta viene prellenada con lo enviado.',
    steps: [
      'Revisa cada artículo contra lo que llegó.',
      'Si llegó menos o dañado, corrige la cantidad y elige el motivo.',
      'Confirma la recepción: la mercancía entra al inventario.',
    ],
  },

  // Ventas
  'ventas/clientes': {
    title: 'Clientes',
    summary: 'Clientes de producto empaquetado con sus datos y puntos de entrega.',
  },
  'ventas/clientes/nuevo': CUSTOMER_FORM,
  'ventas/clientes/:id': CUSTOMER_FORM,
  'ventas/pedidos': {
    title: 'Pedidos de cliente',
    summary: 'Pedidos por surtir, borradores y todos, con su fecha y avance.',
  },
  'ventas/pedidos/nuevo': CUSTOMER_ORDER_FORM,
  'ventas/pedidos/:id/editar': CUSTOMER_ORDER_FORM,
  'ventas/pedidos/:id': {
    title: 'Pedido de cliente',
    summary: 'Detalle del pedido con sus remisiones. "Nueva remisión" surte lo pendiente.',
  },
  'ventas/remisiones': {
    title: 'Remisiones',
    summary:
      'Remisiones por despachar y todas. Una remisión saca el producto del inventario al despacharse.',
  },
  'ventas/remisiones/:id': {
    title: 'Remisión',
    summary:
      'Prepara la remisión: cantidades, lotes, vehículo y chofer; despáchala, imprímela y registra su entrega.',
    steps: [
      'Despacha eligiendo vehículo y chofer del catálogo; imprime la remisión para que el cliente la firme.',
      'Al regresar el chofer, usa "Registrar entrega": fecha y hora, quién recibió y lo que el cliente rechazó por lote.',
      'Cada rechazo lleva motivo y destino: regresa a la Planta (entra al subalmacén que elijas, en el mismo lote) o es merma.',
      'Lo rechazado vuelve a quedar pendiente en el pedido: remisiónalo otra vez o cierra el pedido con saldo.',
    ],
    tips: [
      'No se pueden surtir lotes vencidos. La impresión cabe en una hoja carta.',
      'La entrega es final: si algo quedó mal, corrígelo con un ajuste de inventario.',
    ],
  },

  // Compras
  'compras/requerimiento': {
    title: 'Requerimiento de materia prima',
    summary:
      'Lo que necesitan las órdenes abiertas hasta una fecha, contra existencia, mínimo y lo que ya viene en camino.',
    steps: [
      'Elige hasta qué fecha considerar órdenes.',
      'Revisa "Por comprar"; elige artículos o deja todos.',
      'Crea la requisición sugerida: queda en borrador con unidades de compra completas y el proveedor preferido.',
    ],
    tips: ['Los semiterminados faltantes van a "Por producir" y enlazan al plan.'],
  },
  'compras/proveedores': {
    title: 'Proveedores',
    summary: 'Proveedores con sus datos y los artículos que venden.',
  },
  'compras/proveedores/nuevo': SUPPLIER_FORM,
  'compras/proveedores/:id': SUPPLIER_FORM,
  'compras/requisiciones': {
    title: 'Requisiciones',
    summary:
      'Solicitudes de compra. Elige las aprobadas y conviértelas en órdenes de compra por proveedor.',
  },
  'compras/requisiciones/nueva': REQUISITION_FORM,
  'compras/requisiciones/:id/editar': REQUISITION_FORM,
  'compras/requisiciones/:id': {
    title: 'Requisición',
    summary: 'Detalle de la requisición: enviar, aprobar, rechazar o cancelar según su estado.',
  },
  'compras/ordenes': {
    title: 'Órdenes de compra',
    summary: 'Órdenes por aprobar, por recibir y todas.',
  },
  'compras/ordenes/nueva': PURCHASE_ORDER_FORM,
  'compras/ordenes/:id/editar': PURCHASE_ORDER_FORM,
  'compras/ordenes/:id': {
    title: 'Orden de compra',
    summary: 'Detalle con lo pedido y lo recibido; desde aquí se aprueba, se recibe o se cierra.',
  },
  'compras/recepciones': {
    title: 'Recepciones de compra',
    summary: 'Recepciones registradas con su orden, proveedor y factura.',
  },
  'compras/recepciones/nueva': {
    title: 'Recibir orden de compra',
    summary:
      'Registra lo que llegó del proveedor: cantidades, lotes con caducidad y número de factura.',
    steps: [
      'Captura en cada tarjeta lo que llegó; con lotes, el número y la caducidad ("Otro lote" si vinieron varios).',
      'Captura la factura del proveedor.',
      'Confirma: la mercancía entra al inventario con el costo de la orden.',
    ],
    tips: ['Se avisa si recibes más de lo pendiente según la tolerancia configurada.'],
  },
  'compras/recepciones/:id': {
    title: 'Recepción de compra',
    summary: 'Detalle de la recepción con sus lotes y costos.',
  },

  // Administración
  'admin/usuarios': { title: 'Usuarios', summary: 'Cuentas del sistema, sus roles y ubicaciones.' },
  'admin/usuarios/nuevo': USER_FORM,
  'admin/usuarios/:id': USER_FORM,
  'admin/roles': { title: 'Roles', summary: 'Roles y sus permisos.' },
  'admin/roles/nuevo': ROLE_FORM,
  'admin/roles/:id': ROLE_FORM,
  'admin/bitacora': {
    title: 'Bitácora',
    summary: 'Quién cambió qué y cuándo, con los valores antes y después.',
  },
  'admin/configuracion': {
    title: 'Configuración',
    summary:
      'Parámetros del sistema: umbral de aprobación de compras, tolerancias, días de alerta y de cobertura.',
  },
};
