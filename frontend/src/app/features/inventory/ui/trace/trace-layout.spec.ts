import type { TraceGraph } from '../../data-access/traceability-api';
import { referenceGraph } from './trace-fixture.spec-helper';
import {
  CARD_H,
  ORDER_HEADER,
  STEP,
  bandWidth,
  closeLevels,
  layoutTrace,
  stackPorts,
} from './trace-layout';
import { neighbour, summarizeChain, traceChain } from './trace-selection';

describe('trace-layout (trazabilidad-ui §4)', () => {
  const layout = layoutTrace(referenceGraph());
  const card = (id: string) => layout.cards.find((c) => c.id === id)!;
  const lane = (key: string) =>
    layout.cards
      .filter((c) => c.lane === key)
      .sort((a, b) => a.y - b.y)
      .map((c) => c.node.folio ?? c.node.purchaseOrderFolio ?? c.lot?.lotNumber ?? c.node.label);

  it('puts every node type in its fixed lane, in order', () => {
    expect(layout.lanes.map((l) => [l.stage, l.label, l.count])).toEqual([
      [1, 'Proveedor', 2],
      [2, 'Orden de compra', 3],
      [3, 'Producción', 2],
      [4, 'Lote', 2],
      [5, 'Almacén', 2],
      [6, 'Envío', 3],
      [7, 'Destino', 4],
    ]);
    expect(card('cp:801').x).toBeLessThan(card('lot:01').x);
  });

  it('compacts a receipt with one lot and hides the plant stock of raw materials (§4.4)', () => {
    const receipt = card('rec:1:old');
    expect(receipt.lot?.lotNumber).toBe('HT-2609-C');
    expect(layout.cardOf.get('lot:old')).toBe('rec:1:old');
    expect(layout.cardOf.get('stk:old:planta')).toBe('rec:1:old');
    expect(layout.cards.some((c) => c.id === 'lot:old' || c.id === 'stk:old:planta')).toBe(false);
    const material = layout.links.find((l) => l.from === 'rec:1:old' && l.to === 'cp:801')!;
    expect(material.type).toBe('material');
    expect(material.label).toBe('62 kg');
  });

  it('orders the reference scenario like the prototype', () => {
    expect(lane('supplier')).toEqual(['Harinera Central', 'Molinos del Bajío']);
    expect(lane('purchase')).toEqual(['OC-000101', 'OC-000102', 'OC-000102']);
    expect(lane('production')).toEqual(['CP-000801', 'CP-000802']);
    expect(lane('lot')).toEqual(['OP-000412-01', 'OP-000412-02']);
    expect(lane('shipping')).toEqual(['TR-1', 'TR-2', 'TR-3']);
    expect(lane('destination')).toEqual([
      'OP-000412-01 · SUC-01',
      'OP-000412-01 · SUC-02',
      'OP-000412-02 · SUC-02',
      'OP-000412-02 · SUC-03',
    ]);
  });

  it('keeps a step between cards and reserves the header of each group', () => {
    for (const l of layout.lanes) {
      const ys = layout.cards
        .filter((c) => c.lane === l.key)
        .map((c) => c.y)
        .sort((a, b) => a - b);
      for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(STEP);
    }
    const order = layout.groups.find((g) => g.kind === 'order')!;
    expect(order.order?.folio).toBe('OP-000412');
    expect(order.cardIds.sort()).toEqual(['cp:801', 'cp:802']);
    expect(card('cp:801').y - order.y).toBe(ORDER_HEADER);
    expect(order.y + order.height).toBeGreaterThanOrEqual(card('cp:802').y + CARD_H);
    const plant = layout.groups.find((g) => g.kind === 'location')!;
    expect(plant.location).toEqual({ code: 'PLANTA', name: 'Planta', onHand: 400, uom: 'pza' });
    expect(layout.height).toBeGreaterThan(Math.max(...layout.cards.map((c) => c.y)) + CARD_H);
  });

  it('marks a receipt short of what was shipped as a difference', () => {
    const short = layout.links.find((l) => l.from === 'tr:2' && l.to === 'stk:02:SUC-02')!;
    expect(short.type).toBe('difference');
    expect(short.label).toBe('390 de 400 pza');
    expect(layout.links.find((l) => l.from === 'tr:2' && l.to === 'stk:01:SUC-02')!.type).toBe(
      'product',
    );
    expect(layout.links.find((l) => l.from === 'sup:a')!.type).toBe('supplier');
  });

  it('sizes the product band by quantity against the largest one', () => {
    expect(bandWidth(1800, 1800)).toBe(12);
    expect(bandWidth(600, 1800)).toBe(4);
    expect(bandWidth(10, 1800)).toBe(2.5);
    const produced = layout.links.find((l) => l.from === 'cp:801' && l.to === 'lot:01')!;
    expect(produced.width).toBe(12);
    expect(layout.links.find((l) => l.from === 'cp:801' && l.to === 'lot:01')!.label).toBe(
      '1,800 pza',
    );
  });

  it('stacks the ports centred on the card, in the order given', () => {
    const ports = stackPorts({ y: 100 }, [
      { id: 'a', width: 12 },
      { id: 'b', width: 4 },
    ]);
    // 12 + 3 + 4 = 19 px centred on 144.
    expect(ports.get('a')).toBeCloseTo(144 - 9.5 + 6);
    expect(ports.get('b')).toBeCloseTo(144 - 9.5 + 12 + 3 + 2);
    const thin = stackPorts({ y: 0 }, [
      { id: 'a', width: 1.3 },
      { id: 'b', width: 1.3 },
    ]);
    expect(thin.get('b')! - thin.get('a')!).toBeCloseTo(1.3 + 5);
    // The links leaving TR-2 follow the position of their targets.
    const out = layout.links.filter((l) => l.from === 'tr:2');
    const upper = out.find((l) => l.to === 'stk:01:SUC-02')!;
    const lower = out.find((l) => l.to === 'stk:02:SUC-02')!;
    expect(Number(upper.d.split(' ')[2])).toBeLessThan(Number(lower.d.split(' ')[2]));
  });

  it('places every lane of a forward-only graph below the headers', () => {
    const full = referenceGraph();
    const keep = (id: string) =>
      id.startsWith('lot:0') ||
      id.includes(':planta') ||
      id.startsWith('tr:') ||
      id.includes(':SUC');
    const forward: TraceGraph = {
      ...full,
      direction: 'Forward',
      nodes: full.nodes.filter(
        (n) =>
          keep(n.id) &&
          !n.id.startsWith('stk:old') &&
          !n.id.startsWith('stk:new') &&
          !n.id.startsWith('stk:sug'),
      ),
      edges: full.edges.filter((e) => keep(e.from) && keep(e.to)),
      groups: [],
    };
    const result = layoutTrace(forward);
    expect(result.lanes.map((l) => l.label)).toEqual(['Lote', 'Almacén', 'Envío', 'Destino']);
    for (const c of result.cards) expect(c.y, c.id).toBeGreaterThanOrEqual(STEP - 32);
  });

  it('inserts a production and a lot lane per semi-finished level', () => {
    const graph: TraceGraph = {
      ...referenceGraph(),
      nodes: [
        {
          id: 'lot:m',
          type: 'Lot',
          label: 'MASA-01',
          lotId: 'm',
          lotNumber: 'MASA-01',
          itemType: 'SemiFinished',
        },
        {
          id: 'stk:m:planta',
          type: 'Stock',
          label: 'MASA',
          lotId: 'm',
          itemType: 'SemiFinished',
          locationType: 'Plant',
          locationId: 'planta',
        },
        {
          id: 'cp:1',
          type: 'ProductionClose',
          label: 'CP-1',
          folio: 'CP-1',
          productionOrderId: 'a',
        },
        {
          id: 'cp:2',
          type: 'ProductionClose',
          label: 'CP-2',
          folio: 'CP-2',
          productionOrderId: 'b',
        },
        {
          id: 'lot:p',
          type: 'Lot',
          label: 'PAN-01',
          lotId: 'p',
          lotNumber: 'PAN-01',
          itemType: 'FinishedGood',
        },
      ],
      edges: [
        { from: 'cp:1', to: 'lot:m', kind: 'Produced', qty: 10, baseUom: 'kg', at: null },
        { from: 'lot:m', to: 'stk:m:planta', kind: 'Entered', qty: 10, baseUom: 'kg', at: null },
        { from: 'stk:m:planta', to: 'cp:2', kind: 'Consumed', qty: 10, baseUom: 'kg', at: null },
        { from: 'cp:2', to: 'lot:p', kind: 'Produced', qty: 100, baseUom: 'pza', at: null },
      ],
      groups: [],
    };
    const levels = closeLevels(graph);
    expect(levels.close.get('cp:1')).toBe(1);
    expect(levels.close.get('cp:2')).toBe(0);
    const semi = layoutTrace(graph);
    expect(semi.lanes.map((l) => l.label)).toEqual([
      'Producción · nivel 2',
      'Lote · nivel 2',
      'Producción',
      'Lote',
    ]);
    expect(semi.links.find((l) => l.from === 'lot:m' && l.to === 'cp:2')!.type).toBe('material');
  });
});

describe('trace-selection (trazabilidad-ui §5.2)', () => {
  const layout = layoutTrace(referenceGraph());

  it('goes forward from the oldest flour to two branches and 1,800 pieces', () => {
    const chain = traceChain(layout, ['rec:1:old'], 'Forward');
    expect(summarizeChain(layout, chain)).toEqual({
      suppliers: 0,
      purchaseOrders: 1,
      rawLots: 1,
      closes: 1,
      finishedLots: 1,
      transfers: 2,
      branches: ['SUC-01', 'SUC-02'],
      shippedQty: 1800,
      shippedUom: 'pza',
    });
    expect(chain.cards.has('stk:02:SUC-03')).toBe(false);
    expect(chain.cards.has('cp:802')).toBe(false);
  });

  it('goes back to the suppliers without mixing branches', () => {
    const chain = traceChain(layout, ['lot:01'], 'Backward');
    expect([...chain.cards].sort()).toEqual([
      'cp:801',
      'lot:01',
      'rec:1:old',
      'rec:2:new',
      'rec:3:sug',
      'sup:a',
      'sup:b',
    ]);
    const both = traceChain(layout, ['lot:01'], 'Both');
    expect(both.cards.has('tr:3')).toBe(false);
    expect(both.cards.has('cp:802')).toBe(false);
    expect(both.cards.has('stk:01:SUC-01')).toBe(true);
  });

  it('selects a whole group through its cards', () => {
    const chain = traceChain(layout, ['cp:801', 'cp:802'], 'Forward');
    expect(summarizeChain(layout, chain).branches).toEqual(['SUC-01', 'SUC-02', 'SUC-03']);
  });

  it('moves with the arrows to parents, children and the lane', () => {
    expect(neighbour(layout, 'cp:801', 'ArrowRight')).toBe('lot:01');
    expect(neighbour(layout, 'cp:801', 'ArrowLeft')).toBe('rec:1:old');
    expect(neighbour(layout, 'cp:801', 'ArrowDown')).toBe('cp:802');
    expect(neighbour(layout, 'cp:801', 'ArrowUp')).toBeNull();
  });
});
