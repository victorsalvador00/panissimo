import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { TraceGraph, TraceNode } from '../../data-access/traceability-api';
import { warningText } from '../../pages/traceability-page';
import { DetailModel, DetailTarget, detailModel } from './trace-detail-model';
import { traceCsv, traceCsvName, eventDays, eventSign } from './trace-events';
import { referenceGraph } from './trace-fixture.spec-helper';
import { TraceGraphView, fichaPositions } from './trace-graph';
import { layoutTrace } from './trace-layout';
import { cardText } from './trace-text';

/** The reference graph with what the fichas read (costs, close lines, transfer lines, events). */
function detailedGraph(costs = true): TraceGraph {
  const graph = referenceGraph();
  const node = (id: string) => graph.nodes.find((n) => n.id === id)!;
  const set = (id: string, values: Partial<TraceNode>) => Object.assign(node(id), values);
  set('rec:1:old', {
    receiptId: 'gr1',
    receiptFolio: 'REC-000018',
    supplierInvoiceNumber: 'A-1182',
    purchaseQty: 62,
    purchaseUom: 'kg',
    unitCostBase: costs ? 9.5 : null,
    purchaseOrderSubtotal: costs ? 589 : null,
    purchaseOrderStatus: 'Received',
    purchaseOrderDate: '2026-10-01',
  });
  set('lot:old', { expirationDate: '2026-12-10' });
  set('sup:b', { paymentTermsDays: 30, taxId: 'HCE980312ABC' });
  const line = (lotId: string | null, sku: string, qty: number, cost: number) => ({
    itemId: sku,
    sku,
    itemName: sku,
    lotId,
    lotNumber: lotId ? (graph.nodes.find((n) => n.lotId === lotId)?.lotNumber ?? null) : null,
    theoreticalQty: qty,
    actualQty: qty,
    unitCost: costs ? cost : null,
    baseUom: 'kg',
  });
  set('cp:801', {
    closeId: 'c801',
    totalCost: costs ? 1500 : null,
    unitCost: costs ? 0.8333 : null,
    wasteCost: costs ? 0 : null,
    closedByName: 'Jefe de producción',
    businessDate: '2026-10-21',
    shift: 'Night',
    lines: [
      line('old', 'HARINA', 62, 9.5),
      line('new', 'HARINA', 28.1, 9.8),
      line(null, 'AGUA', 45, 0.01),
    ],
  });
  set('cp:802', { closeId: 'c802', lines: [line('new', 'HARINA', 85.0944, 9.8)] });
  set('lot:01', {
    expirationDate: '2026-10-23',
    createdAt: '2026-10-21T05:40:00Z',
    unitCost: costs ? 0.83 : null,
  });
  set('tr:2', {
    transferId: 't2',
    transferStatus: 'ReceivedWithDiscrepancies',
    deliveredAt: '2026-10-21T06:55:00Z',
    branchOrderFolio: 'PS-000310',
    transferLines: [
      {
        lotId: '01',
        lotNumber: 'OP-000412-01',
        shippedQty: 600,
        receivedQty: 600,
        discrepancyReason: null,
        discrepancyNotes: null,
      },
      {
        lotId: '02',
        lotNumber: 'OP-000412-02',
        shippedQty: 400,
        receivedQty: 390,
        discrepancyReason: 'Damaged',
        discrepancyNotes: 'Charolas aplastadas',
      },
    ],
  });
  if (!costs) graph.groups[0] = { ...graph.groups[0], totalCost: null, unitCost: null };
  graph.events = [
    {
      at: '2026-10-21T05:40:00Z',
      docType: 'ProductionClose',
      docId: 'c801',
      folio: 'CP-000801',
      description: 'Cierre parcial de producción',
      sku: 'MICHAS',
      lotNumber: 'OP-000412-01',
      qty: 1800,
      baseUom: 'pza',
      locationCode: 'PLANTA',
    },
    {
      at: '2026-10-21T05:55:00Z',
      docType: 'Transfer',
      docId: 't2',
      folio: 'TR-2',
      description: 'Despacho a SUC-02',
      sku: 'MICHAS',
      lotNumber: 'OP-000412-01',
      qty: 1000,
      baseUom: 'pza',
      locationCode: 'PLANTA',
    },
    {
      at: '2026-10-21T06:55:00Z',
      docType: 'Transfer',
      docId: 't2',
      folio: 'TR-2',
      description: 'Recepción de traspaso',
      sku: 'MICHAS',
      lotNumber: 'OP-000412-01',
      qty: 990,
      baseUom: 'pza',
      locationCode: 'SUC-02',
    },
    {
      at: '2026-10-01T16:00:00Z',
      docType: 'GoodsReceipt',
      docId: 'gr1',
      folio: 'REC-000018',
      description: 'Recepción de compra',
      sku: 'HARINA',
      lotNumber: 'HT-2609-C',
      qty: 62,
      baseUom: 'kg',
      locationCode: 'PLANTA',
    },
  ];
  graph.summary = {
    ...graph.summary,
    locations: [
      {
        locationId: 'planta',
        locationCode: 'PLANTA',
        locationName: 'Planta',
        locationType: 'Plant',
        receivedQty: 3500,
        consumedQty: 0,
        wasteQty: 0,
        onHandQty: 400,
        baseUom: 'pza',
      },
    ],
  };
  return graph;
}

function model(graph: TraceGraph, id: string): DetailModel {
  const layout = layoutTrace(graph);
  const card = layout.cards.find((c) => c.id === id);
  const group = layout.groups.find((g) => g.id === id);
  const target: DetailTarget = card ? { kind: 'card', card } : { kind: 'group', group: group! };
  return detailModel(target, graph, layout);
}

const section = (m: DetailModel, title: string) => m.sections.find((s) => s.title === title)!;
const stat = (m: DetailModel, label: string) => m.stats.find((s) => s.label === label)?.value;

describe('ficha (trazabilidad-ui §6.3)', () => {
  it('shows the receipt with its use, its data and the consumption per close', () => {
    const m = model(detailedGraph(), 'rec:1:old');
    expect(m.title).toBe('OC-000101');
    expect(stat(m, 'Comprado')).toBe('62 kg');
    expect(stat(m, 'Usado en la cadena')).toBe('62 kg');
    expect(stat(m, 'Precio por unidad base')).toBe('$9.50');
    expect(section(m, 'Uso del lote')).toMatchObject({ kind: 'meter', percent: 100 });
    const table = section(m, 'Consumo por cierre');
    expect(table).toMatchObject({
      kind: 'table',
      rows: [{ close: 'CP-000801', actual: '62 kg', cost: '$589.00' }],
    });
    expect(m.link).toEqual(['/compras/ordenes', 'po1']);
    expect(m.traceFrom).toEqual({ type: 'PurchaseOrder', id: 'po1' });
  });

  it('hides prices and cost columns without the permission (null in the response)', () => {
    const m = model(detailedGraph(false), 'rec:1:old');
    expect(stat(m, 'Precio por unidad base')).toBeUndefined();
    expect(m.stats).toHaveLength(4);
    const table = section(m, 'Consumo por cierre') as Extract<
      DetailModel['sections'][number],
      { kind: 'table' }
    >;
    expect(table.columns.map((c) => c.key)).not.toContain('cost');
    const close = model(detailedGraph(false), 'cp:801');
    expect(stat(close, 'Costo del cierre')).toBeUndefined();
    const lines = section(close, 'Consumo real por lote') as Extract<
      DetailModel['sections'][number],
      { kind: 'table' }
    >;
    expect(lines.columns.map((c) => c.key)).toEqual(['item', 'lot', 'qty']);
    const order = model(detailedGraph(false), 'op:op412');
    expect(order.stats.map((s) => s.label)).toEqual(['Planeado', 'Producido', 'Cierres']);
  });

  it('shows the close with its real consumption per lot, the unlotted ones and what changed in the order', () => {
    const m = model(detailedGraph(), 'cp:801');
    expect(m.type).toBe('Cierre parcial · #1');
    expect(stat(m, 'Costo del cierre')).toBe('$1,500.00');
    const lines = section(m, 'Consumo real por lote') as Extract<
      DetailModel['sections'][number],
      { kind: 'table' }
    >;
    expect(lines.rows.map((r) => [r['item'], r['lot']])).toEqual([
      ['HARINA', 'HT-2609-C'],
      ['HARINA', 'HT-2610-A'],
      ['AGUA', 'sin lote'],
    ]);
    expect(m.sections.some((s) => s.kind === 'note' && s.text.includes('En proceso'))).toBe(true);
  });

  it('shows where a finished lot is today and the loss in transit', () => {
    const graph = detailedGraph();
    graph.nodes.find((n) => n.id === 'lot:02')!.expirationDate = '2026-10-23';
    const m = model(graph, 'lot:02');
    expect(stat(m, 'En existencia hoy')).toBe('1,690 pza');
    const stack = section(m, 'Dónde está hoy') as Extract<
      DetailModel['sections'][number],
      { kind: 'stack' }
    >;
    expect(stack.parts.map((p) => [p.label, p.text, p.warn])).toEqual([
      ['PLANTA', '400 pza', false],
      ['SUC-02', '390 pza', false],
      ['SUC-03', '900 pza', false],
      ['Pérdida en tránsito', '10 pza', true],
    ]);
    expect(m.sections.some((s) => s.kind === 'note' && s.tone === 'warn')).toBe(true);
  });

  it('shows the transfer with its difference per lot', () => {
    const m = model(detailedGraph(), 'tr:2');
    expect(stat(m, 'Enviado')).toBe('1,000 pza');
    expect(stat(m, 'Recibido')).toBe('990 pza');
    expect(stat(m, 'Diferencia')).toBe('10 pza');
    expect(stat(m, 'Minutos en tránsito')).toBe('55 min');
    expect(m.status).toEqual({ value: 'ReceivedWithDiscrepancies', kind: 'TransferStatus' });
    const note = m.sections.find((s) => s.kind === 'note')!;
    expect(note).toMatchObject({ tone: 'warn' });
    expect((note as { text: string }).text).toContain(
      'Faltaron 10 pza del lote OP-000412-02 · motivo: Dañado',
    );
  });

  it('builds a ficha for every kind of card and group', () => {
    const graph = detailedGraph();
    const layout = layoutTrace(graph);
    for (const card of layout.cards) expect(model(graph, card.id).title, card.id).not.toBe('');
    for (const group of layout.groups)
      expect(model(graph, group.id).stats.length, group.id).toBeGreaterThan(0);
    expect(model(graph, 'sup:b').stats.map((s) => s.value)).toEqual([
      '1',
      '1',
      '$589.00',
      '30 días',
    ]);
  });
});

describe('tarjetas (trazabilidad-ui §4.6)', () => {
  const graph = detailedGraph();
  const layout = layoutTrace(graph);
  const text = (id: string) =>
    cardText(
      layout.cards.find((c) => c.id === id)!,
      layout,
      graph.asOf,
    );

  it('writes the four rows of each kind', () => {
    expect(text('cp:801')).toMatchObject({
      header: 'Cierre · #1',
      tag: 'Parcial',
      title: 'CP-000801',
      figure: '1,800 pza',
    });
    expect(text('rec:1:old')).toMatchObject({ title: 'OC-000101', figure: '62 kg usados' });
    expect(text('lot:01')).toMatchObject({
      tag: '2 días',
      tone: 'orange',
      secondary: 'Caduca 23-oct-2026',
    });
    expect(text('tr:2')).toMatchObject({
      tag: 'Diferencia',
      tone: 'orange',
      figure: '1,000 pza enviadas',
    });
    expect(text('stk:02:SUC-02')).toMatchObject({ tag: '−10', figure: '390 de 400 pza' });
    expect(text('stk:01:SUC-01')).toMatchObject({ tag: 'Completo', figure: '1,200 pza' });
    expect(text('sup:a')).toMatchObject({ figure: '1 OC recibida' });
  });
});

describe('bitácora y CSV (trazabilidad §6.3)', () => {
  const graph = detailedGraph();

  it('groups the events by day in time order, with signs and the card of each one', () => {
    const days = eventDays(graph, layoutTrace(graph));
    // In the plant's time zone (UTC−6): 05:40 and 05:55 UTC are the night of the 20th, 06:55 UTC is the 21st.
    expect(days.map((d) => d.label)).toEqual([
      'Jue 01-oct-2026',
      'Mar 20-oct-2026',
      'Mié 21-oct-2026',
    ]);
    expect(
      [...days[1].rows, ...days[2].rows].map((r) => [
        r.event.folio,
        r.time,
        r.qty,
        r.stage,
        r.cardId,
      ]),
    ).toEqual([
      ['CP-000801', '23:40', 1800, 'production', 'cp:801'],
      ['TR-2', '23:55', -1000, 'shipping', 'tr:2'],
      ['TR-2', '00:55', 990, 'difference', 'tr:2'],
    ]);
    expect(days[0].rows[0].cardId).toBe('rec:1:old');
    expect(eventSign({ ...graph.events[0], description: 'Merma', qty: 5 })).toBe(-5);
  });

  it('exports the events and the summary with a BOM', () => {
    const csv = traceCsv(graph);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).trim().split('\r\n');
    expect(lines[0]).toBe('Sección,Fecha,Documento,Evento,Artículo,Lote,Cantidad,Unidad,Ubicación');
    expect(lines[1]).toContain(
      'Bitácora,2026-10-01T16:00:00.000Z,REC-000018,Recepción de compra,HARINA,HT-2609-C,62,kg,PLANTA',
    );
    expect(lines).toContain(
      'Bitácora,2026-10-21T05:55:00.000Z,TR-2,Despacho a SUC-02,MICHAS,OP-000412-01,-1000,pza,PLANTA',
    );
    expect(lines.some((l) => l.startsWith('Ubicación,') && l.endsWith(',400,pza,PLANTA'))).toBe(
      true,
    );
    expect(lines.at(-1)).toBe('Pérdida en tránsito,,,,,,10,,');
    expect(traceCsvName(graph)).toBe('trazabilidad-OP-000412-2026-10-21.csv');
  });

  it('explains the warnings', () => {
    expect(
      warningText('no_lots', { ...graph, source: { ...graph.source, type: 'PurchaseOrder' } }),
    ).toBe('Esta OC todavía no tiene recepciones.');
    expect(warningText('truncated', { ...graph, unexpandedNodeIds: ['a', 'b'] })).toContain(
      '2 lotes sin expandir',
    );
  });
});

describe('mapa: ficha y teclado (trazabilidad-ui §5 y §6.1)', () => {
  it('opens the ficha on the right, else on the left, else below', () => {
    expect(fichaPositions({ left: 100, right: 284 }, 1280)[0].overlayX).toBe('start');
    expect(fichaPositions({ left: 800, right: 984 }, 1024)[0].overlayX).toBe('end');
    expect(fichaPositions({ left: 300, right: 484 }, 768)[0].originY).toBe('bottom');
  });

  it('selects with Enter, closes with Esc in two steps and gives the focus back to the card', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(TraceGraphView);
    fixture.componentRef.setInput('graph', detailedGraph());
    fixture.componentRef.setInput('direction', 'Forward');
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    const button = (id: string) => host.querySelector<HTMLButtonElement>(`[data-card="${id}"]`)!;

    button('rec:1:old').click();
    await fixture.whenStable();
    expect(button('rec:1:old').getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('app-trace-detail h2')?.textContent).toContain('OC-000101');
    expect(host.querySelector('.selection-bar')?.textContent).toContain('SUC-01');
    expect(
      host.querySelector<HTMLElement>('app-trace-card:has([data-card="stk:02:SUC-03"])')!.style
        .opacity,
    ).toBe('0.28');

    button('cp:801').focus();
    button('cp:801').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    expect(document.activeElement).toBe(button('lot:01'));

    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    expect(document.querySelector('app-trace-detail')).toBeNull();
    expect(document.activeElement).toBe(button('rec:1:old'));
    expect(button('rec:1:old').getAttribute('aria-pressed')).toBe('true');

    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(button('rec:1:old').getAttribute('aria-pressed')).toBe('false');
    expect(host.querySelector('.selection-bar')?.textContent).toContain('Toca una tarjeta');
    fixture.destroy();
  });
});
