/** A menu entry: visible with the permission, or with any one of the list (frontend §7). */
export interface NavItem {
  label: string;
  icon: string;
  route: string;
  permission?: string | readonly string[];
}

export interface NavSection {
  label: string;
  items: readonly NavItem[];
}

/** Menu by module (frontend §7). F-03 draws it as the sidebar; each item keeps the minimum permission of its route. */
export const NAVIGATION: readonly NavSection[] = [
  {
    label: 'General',
    items: [{ label: 'Inicio', icon: 'home', route: '/' }],
  },
  {
    label: 'Inventario',
    items: [
      {
        label: 'Existencias',
        icon: 'inventory_2',
        route: '/inventario/existencias',
        permission: 'inventory.view',
      },
      {
        label: 'Kardex',
        icon: 'receipt_long',
        route: '/inventario/kardex',
        permission: 'inventory.view',
      },
      {
        label: 'Ajustes',
        icon: 'tune',
        route: '/inventario/ajustes',
        permission: 'inventory.adjust',
      },
      {
        label: 'Conteos',
        icon: 'fact_check',
        route: '/inventario/conteos',
        permission: 'inventory.count',
      },
      {
        label: 'Consumos',
        icon: 'restaurant',
        route: '/inventario/consumos',
        permission: 'inventory.consumption',
      },
      {
        label: 'Vales internos',
        icon: 'swap_horiz',
        route: '/inventario/vales-internos',
        permission: 'inventory.view',
      },
      {
        label: 'Análisis de consumo',
        icon: 'monitoring',
        route: '/inventario/analisis-consumo',
        permission: 'inventory.view',
      },
      {
        label: 'Trazabilidad',
        icon: 'account_tree',
        route: '/inventario/trazabilidad',
        permission: 'inventory.traceability',
      },
    ],
  },
  {
    label: 'Producción',
    items: [
      {
        label: 'Plan',
        icon: 'event_note',
        route: '/produccion/plan',
        permission: 'production.view',
      },
      {
        label: 'Órdenes',
        icon: 'assignment',
        route: '/produccion/ordenes',
        permission: 'production.view',
      },
      {
        label: 'Cierres',
        icon: 'task_alt',
        route: '/produccion/cierres',
        permission: 'production.view',
      },
      {
        label: 'Recetas',
        icon: 'menu_book',
        route: '/produccion/recetas',
        permission: 'production.view',
      },
      {
        label: 'Importar OP',
        icon: 'upload_file',
        route: '/produccion/importar',
        permission: 'production.orders.import',
      },
      {
        label: 'Resumen',
        icon: 'bar_chart',
        route: '/produccion/resumen',
        permission: 'production.view',
      },
    ],
  },
  {
    label: 'Logística',
    items: [
      {
        label: 'Pedidos de sucursal',
        icon: 'shopping_cart',
        route: '/logistica/pedidos',
        permission: 'logistics.view',
      },
      {
        label: 'Traspasos',
        icon: 'local_shipping',
        route: '/logistica/traspasos',
        permission: 'logistics.view',
      },
      {
        label: 'Vehículos y choferes',
        icon: 'person_check',
        route: '/logistica/flotilla',
        permission: 'logistics.fleet.manage',
      },
    ],
  },
  {
    label: 'Ventas',
    items: [
      {
        label: 'Clientes',
        icon: 'storefront',
        route: '/ventas/clientes',
        permission: 'sales.view',
      },
      {
        label: 'Pedidos de cliente',
        icon: 'request_quote',
        route: '/ventas/pedidos',
        permission: 'sales.view',
      },
      {
        label: 'Remisiones',
        icon: 'outbox',
        route: '/ventas/remisiones',
        permission: 'sales.view',
      },
    ],
  },
  {
    label: 'Compras',
    items: [
      {
        label: 'Requerimiento',
        icon: 'calculate',
        route: '/compras/requerimiento',
        permission: ['purchasing.view', 'production.view'],
      },
      {
        label: 'Requisiciones',
        icon: 'playlist_add_check',
        route: '/compras/requisiciones',
        permission: 'purchasing.view',
      },
      {
        label: 'Órdenes de compra',
        icon: 'shopping_bag',
        route: '/compras/ordenes',
        permission: 'purchasing.view',
      },
      {
        label: 'Recepciones',
        icon: 'move_to_inbox',
        route: '/compras/recepciones',
        permission: 'purchasing.view',
      },
      {
        label: 'Proveedores',
        icon: 'handshake',
        route: '/compras/proveedores',
        permission: 'purchasing.view',
      },
    ],
  },
  {
    label: 'Catálogos',
    items: [
      {
        label: 'Artículos',
        icon: 'bakery_dining',
        route: '/catalogos/articulos',
        permission: 'catalog.view',
      },
      {
        label: 'Categorías',
        icon: 'label',
        route: '/catalogos/categorias',
        permission: 'catalog.view',
      },
      {
        label: 'Unidades',
        icon: 'straighten',
        route: '/catalogos/unidades',
        permission: 'catalog.view',
      },
      {
        label: 'Ubicaciones',
        icon: 'location_on',
        route: '/catalogos/ubicaciones',
        permission: 'locations.view',
      },
    ],
  },
  {
    label: 'Administración',
    items: [
      {
        label: 'Usuarios',
        icon: 'group',
        route: '/admin/usuarios',
        permission: 'security.users.manage',
      },
      {
        label: 'Roles',
        icon: 'admin_panel_settings',
        route: '/admin/roles',
        permission: 'security.roles.manage',
      },
      {
        label: 'Bitácora',
        icon: 'history',
        route: '/admin/bitacora',
        permission: 'security.audit.view',
      },
      {
        label: 'Configuración',
        icon: 'settings',
        route: '/admin/configuracion',
        permission: 'settings.manage',
      },
    ],
  },
];

/** The sections with only the items the user may open; sections left empty disappear. */
export function visibleNavigation(
  can: (permission: string | readonly string[]) => boolean,
  sections: readonly NavSection[] = NAVIGATION,
): NavSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.permission === undefined || can(item.permission)),
    }))
    .filter((section) => section.items.length > 0);
}
