/** Opción del menú lateral. `permission` es el mínimo para verla (spec frontend §7). */
export interface MenuItem {
  label: string;
  icon: string;
  route: string;
  permission?: string;
}

export interface MenuSection {
  label: string;
  items: MenuItem[];
}

export const MENU: MenuSection[] = [
  {
    label: 'General',
    items: [{ label: 'Tablero', icon: 'dashboard', route: '/' }],
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
        label: 'Conteos físicos',
        icon: 'fact_check',
        route: '/inventario/conteos',
        permission: 'inventory.count',
      },
      {
        label: 'Consumo del día',
        icon: 'restaurant',
        route: '/inventario/consumos/nuevo',
        permission: 'inventory.consumption',
      },
      {
        label: 'Existencias iniciales',
        icon: 'upload_file',
        route: '/inventario/existencias-iniciales',
        permission: 'inventory.adjust',
      },
    ],
  },
  {
    label: 'Logística',
    items: [
      {
        label: 'Pedidos',
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
    ],
  },
  {
    label: 'Producción',
    items: [
      {
        label: 'Recetas',
        icon: 'menu_book',
        route: '/produccion/recetas',
        permission: 'production.view',
      },
      {
        label: 'Órdenes de producción',
        icon: 'precision_manufacturing',
        route: '/produccion/ordenes',
        permission: 'production.view',
      },
    ],
  },
  {
    label: 'Compras',
    items: [
      {
        label: 'Proveedores',
        icon: 'store',
        route: '/compras/proveedores',
        permission: 'purchasing.view',
      },
      {
        label: 'Requisiciones',
        icon: 'assignment',
        route: '/compras/requisiciones',
        permission: 'purchasing.view',
      },
      {
        label: 'Órdenes de compra',
        icon: 'request_quote',
        route: '/compras/ordenes',
        permission: 'purchasing.view',
      },
      {
        label: 'Recepciones',
        icon: 'move_to_inbox',
        route: '/compras/recepciones',
        permission: 'purchasing.view',
      },
    ],
  },
  {
    label: 'Catálogos',
    items: [
      {
        label: 'Artículos',
        icon: 'category',
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
      {
        label: 'Componentes (demo)',
        icon: 'widgets',
        route: '/demo/componentes',
        permission: 'settings.manage',
      },
    ],
  },
];

/** Deja solo las opciones permitidas y quita las secciones vacías. */
export function filterMenu(
  menu: MenuSection[],
  can: (permission: string) => boolean,
): MenuSection[] {
  return menu
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.permission || can(item.permission)),
    }))
    .filter((section) => section.items.length > 0);
}
