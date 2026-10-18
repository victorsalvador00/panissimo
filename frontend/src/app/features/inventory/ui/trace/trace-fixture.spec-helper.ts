import type { TraceEdge, TraceGraph, TraceNode } from '../../data-access/traceability-api';

/**
 * Reduced scenario of trazabilidad §9 for the unit tests: two flour lots (HT-2609-C, the oldest, and HT-2610-A) from two
 * suppliers and a sugar lot; OP-000412 with two closes (CP-000801 consumes the old flour, CP-000802 the new one) that
 * produce MICHAS lots -01 (1,800) and -02 (1,700); TR1 1,200 of -01 to SUC-01, TR2 600 of -01 and 400 of -02 to SUC-02
 * (990 received), TR3 900 of -02 to SUC-03, and 400 of -02 left in the plant.
 */
export function referenceGraph(): TraceGraph {
  const nodes: TraceNode[] = [];
  const edges: TraceEdge[] = [];
  const node = (n: Partial<TraceNode> & Pick<TraceNode, 'id' | 'type' | 'label'>) =>
    nodes.push(n as TraceNode);
  const edge = (
    from: string,
    to: string,
    kind: TraceEdge['kind'],
    qty: number | null,
    uom: string | null,
    extra: Partial<TraceEdge> = {},
  ) => edges.push({ from, to, kind, qty, baseUom: uom, at: null, ...extra });

  node({ id: 'sup:a', type: 'Supplier', label: 'Molinos del Bajío' });
  node({ id: 'sup:b', type: 'Supplier', label: 'Harinera Central' });
  const receipt = (
    id: string,
    sup: string,
    po: string,
    poId: string,
    lot: string,
    lotNumber: string,
    sku: string,
    at: string,
    qty: number,
  ) => {
    node({
      id,
      type: 'PurchaseReceipt',
      label: po,
      purchaseOrderId: poId,
      purchaseOrderFolio: po,
      lotId: lot,
      lotNumber,
      sku,
      receivedAt: at,
      baseQty: qty,
      baseUom: 'kg',
    });
    node({
      id: `lot:${lot}`,
      type: 'Lot',
      label: lotNumber,
      lotId: lot,
      lotNumber,
      sku,
      itemType: 'RawMaterial',
      baseUom: 'kg',
      createdAt: at,
    });
    node({
      id: `stk:${lot}:planta`,
      type: 'Stock',
      label: `${lotNumber} · PLANTA`,
      lotId: lot,
      lotNumber,
      itemType: 'RawMaterial',
      locationId: 'planta',
      locationCode: 'PLANTA',
      locationType: 'Plant',
      baseUom: 'kg',
      onHandQty: 0,
    });
    edge(sup, id, 'Supplied', null, null);
    edge(id, `lot:${lot}`, 'Received', qty, 'kg');
    edge(`lot:${lot}`, `stk:${lot}:planta`, 'Entered', qty, 'kg');
  };
  receipt(
    'rec:1:old',
    'sup:b',
    'OC-000101',
    'po1',
    'old',
    'HT-2609-C',
    'HARINA',
    '2026-10-01T10:00:00Z',
    62,
  );
  receipt(
    'rec:2:new',
    'sup:a',
    'OC-000102',
    'po2',
    'new',
    'HT-2610-A',
    'HARINA',
    '2026-10-10T10:00:00Z',
    150,
  );
  receipt(
    'rec:3:sug',
    'sup:a',
    'OC-000102',
    'po2',
    'sug',
    'AZ-01',
    'AZUCAR',
    '2026-10-10T10:00:00Z',
    500,
  );

  for (const [close, seq, lot, qty, at] of [
    ['801', 1, '01', 1800, '2026-10-21T05:40:00Z'],
    ['802', 2, '02', 1700, '2026-10-21T09:10:00Z'],
  ] as const) {
    node({
      id: `cp:${close}`,
      type: 'ProductionClose',
      label: `CP-000${close}`,
      folio: `CP-000${close}`,
      sequence: seq,
      kind: seq === 2 ? 'Final' : 'Partial',
      productionOrderId: 'op412',
      closedAt: at,
      producedQty: qty,
      baseUom: 'pza',
    });
    node({
      id: `lot:${lot}`,
      type: 'Lot',
      label: `OP-000412-${lot}`,
      lotId: lot,
      lotNumber: `OP-000412-${lot}`,
      sku: 'MICHAS',
      itemType: 'FinishedGood',
      baseUom: 'pza',
      createdAt: at,
    });
    node({
      id: `stk:${lot}:planta`,
      type: 'Stock',
      label: `OP-000412-${lot} · PLANTA`,
      lotId: lot,
      lotNumber: `OP-000412-${lot}`,
      itemType: 'FinishedGood',
      locationId: 'planta',
      locationCode: 'PLANTA',
      locationName: 'Planta',
      locationType: 'Plant',
      baseUom: 'pza',
      onHandQty: lot === '02' ? 400 : 0,
    });
    edge(`cp:${close}`, `lot:${lot}`, 'Produced', qty, 'pza');
    edge(`lot:${lot}`, `stk:${lot}:planta`, 'Entered', qty, 'pza');
  }
  edge('stk:old:planta', 'cp:801', 'Consumed', 62, 'kg');
  edge('stk:new:planta', 'cp:801', 'Consumed', 28.1, 'kg');
  edge('stk:new:planta', 'cp:802', 'Consumed', 85.0944, 'kg');
  edge('stk:sug:planta', 'cp:801', 'Consumed', 250, 'kg');
  edge('stk:sug:planta', 'cp:802', 'Consumed', 250, 'kg');

  const transfer = (id: string, to: string, at: string) => {
    node({
      id: `tr:${id}`,
      type: 'Transfer',
      label: `TR-${id}`,
      folio: `TR-${id}`,
      fromLocationCode: 'PLANTA',
      toLocationCode: to,
      dispatchedAt: at,
      baseUom: 'pza',
    });
  };
  const branch = (lot: string, code: string, onHand: number) =>
    node({
      id: `stk:${lot}:${code}`,
      type: 'Stock',
      label: `OP-000412-${lot} · ${code}`,
      lotId: lot,
      lotNumber: `OP-000412-${lot}`,
      itemType: 'FinishedGood',
      locationId: code,
      locationCode: code,
      locationType: 'Branch',
      baseUom: 'pza',
      onHandQty: onHand,
    });
  transfer('1', 'SUC-01', '2026-10-21T05:55:00Z');
  transfer('2', 'SUC-02', '2026-10-21T06:00:00Z');
  transfer('3', 'SUC-03', '2026-10-21T10:00:00Z');
  branch('01', 'SUC-01', 1200);
  branch('01', 'SUC-02', 600);
  branch('02', 'SUC-02', 390);
  branch('02', 'SUC-03', 900);
  edge('stk:01:planta', 'tr:1', 'Dispatched', 1200, 'pza');
  edge('tr:1', 'stk:01:SUC-01', 'Delivered', 1200, 'pza', { shippedQty: 1200 });
  edge('stk:01:planta', 'tr:2', 'Dispatched', 600, 'pza');
  edge('stk:02:planta', 'tr:2', 'Dispatched', 400, 'pza');
  edge('tr:2', 'stk:01:SUC-02', 'Delivered', 600, 'pza', { shippedQty: 600 });
  edge('tr:2', 'stk:02:SUC-02', 'Delivered', 390, 'pza', {
    shippedQty: 400,
    discrepancyReason: 'Damaged',
  });
  edge('stk:02:planta', 'tr:3', 'Dispatched', 900, 'pza');
  edge('tr:3', 'stk:02:SUC-03', 'Delivered', 900, 'pza', { shippedQty: 900 });

  return {
    source: { type: 'ProductionOrder', id: 'op412', label: 'OP-000412' },
    direction: 'Both',
    asOf: '2026-10-21T13:30:00Z',
    truncated: false,
    unexpandedNodeIds: [],
    warnings: [],
    nodes,
    edges,
    groups: [
      {
        id: 'op:op412',
        productionOrderId: 'op412',
        folio: 'OP-000412',
        itemId: 'm',
        sku: 'MICHAS',
        itemName: 'Michas',
        plannedQty: 3500,
        producedQty: 3500,
        baseUom: 'pza',
        status: 'Completed',
        scheduledDate: '2026-10-21',
        shift: 'Night',
        areaName: 'Panadería',
        recipeName: 'Michas',
        recipeVersion: 2,
        source: 'Manual',
        totalCost: 7000,
        unitCost: 2,
        shortfallReason: null,
        statusHistory: [],
        demands: [],
        nodeIds: ['cp:801', 'cp:802'],
      },
    ],
    events: [],
    summary: { origins: [], finishedLots: [], locations: [], customers: [], inTransitLossQty: 10 },
  } as TraceGraph;
}
