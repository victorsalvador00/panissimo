import { buildCsv } from '../../../../shared/data-access/csv';
import { enumLabel } from '../../../../shared/pipes/labels';
import { formatQty } from '../../../../shared/pipes/pipes';
import type { TraceEvent, TraceGraph } from '../../data-access/traceability-api';
import type { TraceLayout } from './trace-layout';
import { shortDate, shortTime } from './trace-text';

export type EventStage = 'purchasing' | 'production' | 'shipping' | 'difference' | 'other';

export interface EventRow {
  event: TraceEvent;
  time: string;
  stage: EventStage;
  /** Signed quantity: exits are negative. */
  qty: number | null;
  /** Card of the map that stands for the event (null when the map does not draw it). */
  cardId: string | null;
}

export interface EventDay {
  /** `Mar 21-oct-2026`. */
  label: string;
  rows: EventRow[];
}

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const EXITS = /^(Despacho|Remisión|Consumo|Merma|Salida)/;

function localDate(at: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date(at));
}

export function eventSign(event: TraceEvent): number | null {
  if (event.qty === null) return null;
  return EXITS.test(event.description) ? -Math.abs(event.qty) : event.qty;
}

/** The card of the map behind an event (Bitácora → Mapa, trazabilidad-ui §7). */
export function eventCard(
  event: TraceEvent,
  graph: TraceGraph,
  layout: Pick<TraceLayout, 'cardOf'>,
): string | null {
  const byLot = (n: { lotNumber?: string | null }) =>
    !event.lotNumber || n.lotNumber === event.lotNumber;
  const node = graph.nodes.find((n) => {
    switch (event.docType) {
      case 'GoodsReceipt':
        return n.type === 'PurchaseReceipt' && n.receiptId === event.docId && byLot(n);
      case 'ProductionClose':
        return n.type === 'ProductionClose' && n.closeId === event.docId;
      case 'Transfer':
        return n.type === 'Transfer' && n.transferId === event.docId;
      case 'CustomerShipment':
        return n.type === 'CustomerShipment' && n.shipmentId === event.docId;
      default:
        return n.type === 'InitialStock' && n.docId === event.docId && byLot(n);
    }
  });
  const stock = graph.nodes.find(
    (n) =>
      n.type === 'Stock' &&
      n.lotNumber === event.lotNumber &&
      n.locationCode === event.locationCode,
  );
  return layout.cardOf.get((node ?? stock)?.id ?? '') ?? null;
}

function stageOf(event: TraceEvent, graph: TraceGraph): EventStage {
  switch (event.docType) {
    case 'GoodsReceipt':
      return 'purchasing';
    case 'ProductionClose':
      return 'production';
    case 'Transfer': {
      const transfer = graph.nodes.find(
        (n) => n.type === 'Transfer' && n.transferId === event.docId,
      );
      const short = (transfer?.transferLines ?? []).some(
        (l) => l.receivedQty !== null && l.receivedQty < l.shippedQty,
      );
      return short && event.description.startsWith('Recepción') ? 'difference' : 'shipping';
    }
    case 'CustomerShipment':
      return 'shipping';
    default:
      return event.description.startsWith('Entrada') ? 'purchasing' : 'other';
  }
}

/** Events by day, in time order (Bitácora, trazabilidad-ui §7). */
export function eventDays(graph: TraceGraph, layout: Pick<TraceLayout, 'cardOf'>): EventDay[] {
  const days = new Map<string, EventRow[]>();
  const sorted = [...graph.events].sort(
    (a, b) => a.at.localeCompare(b.at) || a.folio.localeCompare(b.folio),
  );
  for (const event of sorted) {
    const day = localDate(event.at);
    days.set(day, [
      ...(days.get(day) ?? []),
      {
        event,
        time: shortTime(event.at),
        stage: stageOf(event, graph),
        qty: eventSign(event),
        cardId: eventCard(event, graph, layout),
      },
    ]);
  }
  return [...days].map(([day, rows]) => {
    const [y, m, d] = day.split('-').map(Number);
    return {
      label: `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${shortDate(day)}`,
      rows,
    };
  });
}

function plain(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

/**
 * "Exportar CSV" (trazabilidad §6.3): the events and the recall summary in one file, generated in the browser with the
 * CSV helper (BOM for Excel). Quantities without thousands separators so a spreadsheet reads them as numbers.
 */
export function traceCsv(graph: TraceGraph): string {
  const headers = [
    'Sección',
    'Fecha',
    'Documento',
    'Evento',
    'Artículo',
    'Lote',
    'Cantidad',
    'Unidad',
    'Ubicación',
  ];
  const rows: string[][] = [];
  for (const e of [...graph.events].sort((a, b) => a.at.localeCompare(b.at)))
    rows.push([
      'Bitácora',
      new Date(e.at).toISOString(),
      e.folio,
      e.description,
      e.sku ?? '',
      e.lotNumber ?? '',
      plain(eventSign(e)),
      e.baseUom ?? '',
      e.locationCode ?? '',
    ]);
  const s = graph.summary;
  for (const o of s.origins)
    rows.push([
      'Origen',
      '',
      [o.purchaseOrderFolio, o.receiptFolio, o.docFolio].filter(Boolean).join(' / '),
      o.supplierName ?? 'Sin proveedor',
      o.sku,
      o.lotNumber,
      plain(o.consumedQty),
      o.baseUom,
      '',
    ]);
  for (const l of s.finishedLots)
    rows.push([
      'Lote terminado',
      l.expirationDate ?? '',
      '',
      l.itemName,
      l.sku,
      l.lotNumber,
      plain(l.producedQty),
      l.baseUom,
      '',
    ]);
  for (const l of s.locations)
    rows.push([
      'Ubicación',
      '',
      '',
      `${enumLabel('LocationType', l.locationType)}: recibido ${l.receivedQty}, consumido ${l.consumedQty}, merma ${l.wasteQty}`,
      '',
      '',
      plain(l.onHandQty),
      l.baseUom,
      l.locationCode,
    ]);
  for (const c of s.customers)
    rows.push([
      'Cliente',
      '',
      c.shipmentFolios.join(' '),
      c.customerName,
      '',
      '',
      plain(c.shippedQty),
      c.baseUom,
      '',
    ]);
  if (s.inTransitLossQty > 0)
    rows.push(['Pérdida en tránsito', '', '', '', '', '', plain(s.inTransitLossQty), '', '']);
  return buildCsv(headers, rows);
}

/** `trazabilidad-OP-000412-2026-10-21.csv`. */
export function traceCsvName(graph: TraceGraph): string {
  const label = graph.source.label.replace(/[^\w.-]+/g, '_');
  return `trazabilidad-${label}-${localDate(graph.asOf)}.csv`;
}

export const STAGE_LABELS: Readonly<Record<EventStage, string>> = {
  purchasing: 'Compras',
  production: 'Producción',
  shipping: 'Envío y recepción',
  difference: 'Recepción con diferencia',
  other: 'Movimiento en ubicación',
};

export function signedQty(row: EventRow): string {
  if (row.qty === null) return '';
  return `${row.qty > 0 ? '+' : ''}${formatQty(row.qty, row.event.baseUom)}`;
}
