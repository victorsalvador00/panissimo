import { filterMenu, MENU } from './menu';

describe('filterMenu', () => {
  const labels = (permissions: string[]) =>
    filterMenu(MENU, (p) => permissions.includes(p)).map((section) => ({
      section: section.label,
      items: section.items.map((item) => item.label),
    }));

  it('encargado de sucursal solo ve su menú', () => {
    const branchManager = [
      'inventory.view',
      'inventory.count',
      'inventory.consumption',
      'logistics.view',
      'logistics.orders.create',
      'logistics.transfers.receive',
    ];

    expect(labels(branchManager)).toEqual([
      { section: 'General', items: ['Tablero'] },
      {
        section: 'Inventario',
        items: ['Existencias', 'Kardex', 'Conteos físicos', 'Consumo del día'],
      },
      { section: 'Logística', items: ['Pedidos', 'Traspasos'] },
    ]);
  });

  it('sin permisos solo queda el tablero', () => {
    expect(labels([])).toEqual([{ section: 'General', items: ['Tablero'] }]);
  });
});
