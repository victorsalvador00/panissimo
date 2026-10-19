import { referenceGraph } from './trace-fixture.spec-helper';
import { detailModel } from './trace-detail-model';
import { layoutTrace } from './trace-layout';
import { cardText } from './trace-text';

/** RN-114: a shipment of the -02 lot with part of it rejected on delivery. */
function withRejection() {
  const graph = referenceGraph();
  graph.nodes.push(
    {
      id: 'rm:1',
      type: 'CustomerShipment',
      label: 'RM-000001',
      folio: 'RM-000001',
      shipmentId: 'ship1',
      customerName: 'OXXO-01',
      shipmentStatus: 'DeliveredWithDiscrepancies',
      dispatchedAt: '2026-10-21T08:00:00Z',
      baseUom: 'pza',
    } as never,
    {
      id: 'cus:1',
      type: 'Customer',
      label: 'OXXO-01',
      customerName: 'OXXO-01',
      customerCode: 'CLI-00001',
    } as never,
    {
      id: 'rej:ship1',
      type: 'Rejection',
      label: 'Rechazo de RM-000001',
      folio: 'RM-000001',
      shipmentId: 'ship1',
      customerName: 'OXXO-01',
      baseUom: 'pza',
      deliveredAt: '2026-10-21T11:00:00Z',
      returnedQty: 10,
      lostQty: 5,
      returnLocationCodes: 'PLANTA-PT',
      returnFolios: 'AJ-000007',
    } as never,
  );
  const edge = (from: string, to: string, kind: string, qty: number) =>
    graph.edges.push({ from, to, kind, qty, baseUom: 'pza', at: null } as never);
  edge('stk:02:planta', 'rm:1', 'Shipped', 100);
  edge('rm:1', 'cus:1', 'Delivered', 85);
  edge('rm:1', 'rej:ship1', 'Rejected', 15);
  return graph;
}

describe('rejection on delivery (RN-114)', () => {
  it('draws its own card in Destino, linked like a difference', () => {
    const graph = withRejection();
    const layout = layoutTrace(graph);
    const card = layout.cards.find((c) => c.id === 'rej:ship1')!;
    const customer = layout.cards.find((c) => c.id === 'cus:1')!;
    expect(card.kind).toBe('rejection');
    expect(card.lane).toBe(customer.lane);
    expect(layout.links.find((l) => l.to === 'rej:ship1')?.type).toBe('difference');
    expect(layout.links.find((l) => l.to === 'cus:1')?.type).toBe('product');

    const text = cardText(card, layout, graph.asOf);
    expect([text.header, text.tag, text.title, text.figure, text.secondary]).toEqual([
      'Rechazo del cliente',
      'Regresó',
      'RM-000001',
      '15 pza rechazadas',
      '10 pza a PLANTA-PT · 5 pza merma',
    ]);
    const shipment = cardText(
      layout.cards.find((c) => c.id === 'rm:1')!,
      layout,
      graph.asOf,
    );
    expect([shipment.tag, shipment.tone]).toEqual(['Con rechazo', 'orange']);
  });

  it('opens a ficha with what returned and what was lost', () => {
    const graph = withRejection();
    const layout = layoutTrace(graph);
    const model = detailModel(
      { kind: 'card', card: layout.cards.find((c) => c.id === 'rej:ship1')! },
      graph,
      layout,
    );
    expect(model.type).toBe('Rechazo en la entrega');
    expect(model.stats.map((s) => [s.label, s.value])).toContainEqual(['Regresó', '10 pza']);
    expect(model.stats.map((s) => [s.label, s.value])).toContainEqual(['Merma', '5 pza']);
  });
});

/** RN-116: the branch SUC-02 rejected 20 pieces of TR-2 on receipt; they went back to PLANTA-PT. */
function withTransferRejection() {
  const graph = referenceGraph();
  graph.nodes.push({
    id: 'rej:t2',
    type: 'Rejection',
    label: 'Rechazo de TR-2',
    folio: 'TR-2',
    transferId: 't2',
    toLocationCode: 'SUC-02',
    baseUom: 'pza',
    deliveredAt: '2026-10-21T07:00:00Z',
    returnedQty: 20,
    lostQty: 0,
    returnLocationCodes: 'PLANTA-PT',
  } as never);
  graph.edges.push({
    from: 'tr:2',
    to: 'rej:t2',
    kind: 'Rejected',
    qty: 20,
    baseUom: 'pza',
    at: null,
  } as never);
  return graph;
}

describe('rejection on a transfer receipt (RN-116)', () => {
  it('names the branch and opens a ficha linked to the transfer', () => {
    const graph = withTransferRejection();
    const layout = layoutTrace(graph);
    const card = layout.cards.find((c) => c.id === 'rej:t2')!;
    expect(card.kind).toBe('rejection');

    const text = cardText(card, layout, graph.asOf);
    expect([text.header, text.tag, text.figure, text.secondary]).toEqual([
      'Rechazo en SUC-02',
      'Regresó',
      '20 pza rechazadas',
      '20 pza a PLANTA-PT',
    ]);

    const model = detailModel({ kind: 'card', card }, graph, layout);
    expect([model.type, model.subtitle]).toEqual(['Rechazo en la recepción', 'SUC-02']);
    expect(model.link).not.toBeNull();
  });
});
