import { documentLink } from '../../../../shared/data-access/document-links';
import { EnumName, enumLabel } from '../../../../shared/pipes/labels';
import { formatMxn, formatQty } from '../../../../shared/pipes/pipes';
import type { TraceGraph, TraceNode, TraceSourceType } from '../../data-access/traceability-api';
import type { TraceCard, TraceGroupBox, TraceLayout } from './trace-layout';
import {
  CARD_ICONS,
  EXPIRY_ALERT_DAYS,
  daysTo,
  minutesBetween,
  shortDate,
  shortDateTime,
} from './trace-text';

export interface DetailStat {
  label: string;
  value: string;
  tone: 'ok' | 'warn' | null;
}

export interface DetailColumn {
  key: string;
  label: string;
  end?: boolean;
}

export type DetailSection =
  | { kind: 'facts'; title: string; items: { label: string; value: string }[] }
  | {
      kind: 'table';
      title: string;
      columns: DetailColumn[];
      rows: Record<string, string>[];
      total: Record<string, string> | null;
    }
  | { kind: 'meter'; title: string; percent: number; label: string; rest: string }
  | {
      kind: 'stack';
      title: string;
      parts: { label: string; text: string; share: number; warn: boolean }[];
    }
  | { kind: 'note'; title: string | null; text: string; tone: 'info' | 'warn' }
  | { kind: 'steps'; title: string; steps: { label: string; at: string }[] };

export interface DetailModel {
  icon: string;
  type: string;
  title: string;
  subtitle: string;
  status: { value: string; kind: EnumName } | null;
  stats: DetailStat[];
  sections: DetailSection[];
  link: string[] | null;
  traceFrom: { type: TraceSourceType; id: string } | null;
}

export type DetailTarget =
  { kind: 'card'; card: TraceCard } | { kind: 'group'; group: TraceGroupBox };

type Candidate = DetailStat | null;

/** §6.3: the first four available figures; a cost without its permission comes null and the next one takes its place. */
function stats(...candidates: Candidate[]): DetailStat[] {
  return candidates.filter((c): c is DetailStat => c !== null).slice(0, 4);
}

function stat(
  label: string,
  value: string | null | undefined,
  tone: DetailStat['tone'] = null,
): Candidate {
  return value === null || value === undefined || value === '' ? null : { label, value, tone };
}

function money(value: number | null | undefined, decimals = 2): string | null {
  return value === null || value === undefined ? null : formatMxn(value, decimals);
}

function table(
  title: string,
  columns: (DetailColumn | null)[],
  rows: Record<string, string>[],
  total: Record<string, string> | null = null,
): DetailSection {
  return {
    kind: 'table',
    title,
    columns: columns.filter((c): c is DetailColumn => c !== null),
    rows,
    total,
  };
}

/** The ficha of a card or a group (trazabilidad-ui §6.2 and §6.3). */
export function detailModel(
  target: DetailTarget,
  graph: TraceGraph,
  layout: TraceLayout,
): DetailModel {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const ctx = { graph, layout, nodes };
  if (target.kind === 'group')
    return target.group.kind === 'order'
      ? orderDetail(target.group, ctx)
      : locationDetail(target.group, ctx);
  const card = target.card;
  switch (card.kind) {
    case 'supplier':
      return supplierDetail(card, ctx);
    case 'origin':
      return originDetail(card, ctx);
    case 'receipt':
    case 'rawLot':
      return receiptDetail(card, ctx);
    case 'close':
      return closeDetail(card, ctx);
    case 'lot':
      return lotDetail(card, ctx);
    case 'stock':
      return stockDetail(card.node, card);
    case 'transfer':
      return transferDetail(card, ctx);
    case 'branch':
      return branchDetail(card, ctx);
    case 'shipment':
    case 'customer':
      return shipmentDetail(card, ctx);
    case 'rejection':
      return rejectionDetail(card);
  }
}

/**
 * RN-114: what the customer rejected of a shipment, returned to the plant (with its adjustment) or lost. RN-116: what a
 * branch rejected on receiving a transfer, back to the sub-warehouse it left (with the same transfer) or lost.
 */
function rejectionDetail(card: TraceCard): DetailModel {
  const n = card.node;
  const uom = n.baseUom ?? null;
  const returned = n.returnedQty ?? 0;
  const lost = n.lostQty ?? 0;
  const onTransfer = !!n.transferId;
  return {
    icon: CARD_ICONS.rejection.icon,
    type: onTransfer ? 'Rechazo en la recepción' : 'Rechazo en la entrega',
    title: n.folio ?? n.label,
    subtitle: onTransfer ? (n.toLocationCode ?? '') : (n.customerName ?? ''),
    status: null,
    stats: stats(
      stat('Rechazado', formatQty(returned + lost, uom)),
      stat('Regresó', formatQty(returned, uom)),
      stat('Merma', formatQty(lost, uom)),
      stat(onTransfer ? 'Recepción' : 'Entrega', shortDateTime(n.deliveredAt)),
    ),
    sections: [
      {
        kind: 'facts',
        title: 'Destino',
        items: [
          { label: 'Regresó a', value: returned > 0 ? (n.returnLocationCodes ?? '—') : '—' },
          onTransfer
            ? { label: 'Documento', value: n.folio ?? '—' }
            : { label: 'Ajuste de devolución', value: n.returnFolios ?? '—' },
          { label: 'Merma', value: lost > 0 ? 'No regresa; queda como pérdida' : '—' },
        ],
      },
    ],
    link: n.transferId
      ? documentLink('Transfer', n.transferId)
      : n.shipmentId
        ? documentLink('CustomerShipment', n.shipmentId)
        : null,
    traceFrom: null,
  };
}

interface Ctx {
  graph: TraceGraph;
  layout: TraceLayout;
  nodes: Map<string, TraceNode>;
}

function base(
  card: TraceCard,
  type: string,
  title: string,
  subtitle: string,
): Omit<DetailModel, 'stats' | 'sections'> {
  return {
    icon: CARD_ICONS[card.kind].icon,
    type,
    title,
    subtitle,
    status: null,
    link: null,
    traceFrom: null,
  };
}

const lotTrace = (lotId: string | null | undefined) =>
  lotId ? { type: 'Lot' as const, id: lotId } : null;

function supplierDetail(card: TraceCard, { layout }: Ctx): DetailModel {
  const n = card.node;
  const receipts = layout.links
    .filter((l) => l.from === card.id)
    .map((l) => layout.cards.find((c) => c.id === l.to)!);
  const orders = [...new Map(receipts.map((r) => [r.node.purchaseOrderId, r.node])).values()];
  const subtotals = orders.map((o) => o.purchaseOrderSubtotal);
  const subtotal = subtotals.some((s) => s === null || s === undefined)
    ? null
    : subtotals.reduce((sum: number, s) => sum + (s ?? 0), 0);
  const used = (r: TraceCard) => usedInChain(r, layout);
  return {
    ...base(card, 'Proveedor', n.label, n.taxId ?? ''),
    stats: stats(
      stat('OC en la cadena', String(orders.length)),
      stat('Lotes usados', String(receipts.length)),
      stat('Subtotal sin IVA', money(subtotal)),
      stat('Condiciones de pago', n.paymentTermsDays ? `${n.paymentTermsDays} días` : 'Contado'),
    ),
    sections: [
      table(
        'Órdenes de compra',
        [
          { key: 'folio', label: 'Folio' },
          { key: 'date', label: 'Fecha' },
          { key: 'status', label: 'Estado' },
          subtotal === null ? null : { key: 'subtotal', label: 'Subtotal', end: true },
        ],
        orders.map((o) => ({
          folio: o.purchaseOrderFolio ?? '',
          date: shortDate(o.purchaseOrderDate),
          status: enumLabel('PurchaseOrderStatus', o.purchaseOrderStatus),
          subtotal: money(o.purchaseOrderSubtotal) ?? '',
        })),
      ),
      table(
        'Lotes que llegaron a la cadena',
        [
          { key: 'item', label: 'Artículo' },
          { key: 'lot', label: 'Lote' },
          { key: 'used', label: 'Usado', end: true },
        ],
        receipts.map((r) => ({
          item: r.node.sku ?? '',
          lot: r.lot?.lotNumber ?? r.node.lotNumber ?? '',
          used: formatQty(used(r), r.lot?.baseUom ?? r.node.baseUom),
        })),
      ),
    ],
    link: null,
    traceFrom: null,
  };
}

/** What the chain took from a raw lot card: the raw material links that leave it. */
function usedInChain(card: TraceCard, layout: TraceLayout): number {
  return layout.links
    .filter((l) => l.from === card.id && l.type === 'material')
    .reduce((sum, l) => sum + (l.qty ?? 0), 0);
}

function originDetail(card: TraceCard, { graph }: Ctx): DetailModel {
  const n = card.node;
  const qty = graph.edges.filter((e) => e.from === n.id).reduce((s, e) => s + (e.qty ?? 0), 0);
  const uom = graph.edges.find((e) => e.from === n.id)?.baseUom ?? null;
  return {
    ...base(card, 'Existencia inicial', n.folio ?? n.label, 'Ajuste o conteo, sin proveedor'),
    stats: stats(stat('Cantidad', formatQty(qty, uom)), stat('Fecha', shortDateTime(n.postedAt))),
    sections: [],
    link: n.docType && n.docId ? documentLink(n.docType, n.docId) : null,
    traceFrom: null,
  };
}

function receiptDetail(card: TraceCard, { graph, layout, nodes }: Ctx): DetailModel {
  const receipt = card.kind === 'receipt' ? card.node : null;
  const lot = card.lot ?? (card.kind === 'rawLot' ? card.node : null);
  const uom = lot?.baseUom ?? receipt?.baseUom ?? null;
  const bought = receipt?.baseQty ?? null;
  const used = usedInChain(card, layout);
  const days = daysTo(lot?.expirationDate, graph.asOf);
  const closes = graph.nodes.filter(
    (n) => n.type === 'ProductionClose' && (n.lines ?? []).some((l) => l.lotId === lot?.lotId),
  );
  const lines = closes.map((c) => ({
    close: c,
    line: c.lines!.find((l) => l.lotId === lot?.lotId)!,
  }));
  const showCost = lines.some((x) => x.line.unitCost !== null);
  const stocks = card.nodeIds
    .map((id) => nodes.get(id))
    .filter((n): n is TraceNode => n?.type === 'Stock');
  const depleted = stocks.length > 0 && stocks.every((s) => (s.onHandQty ?? 0) <= 0);
  const sections: DetailSection[] = [];
  if (bought !== null && bought > 0)
    sections.push({
      kind: 'meter',
      title: 'Uso del lote',
      percent: Math.min(100, (used / bought) * 100),
      label: `${Math.round((used / bought) * 100)} % usado en esta cadena`,
      rest: `${formatQty(Math.max(0, bought - used), uom)} no se usaron aquí`,
    });
  if (receipt)
    sections.push({
      kind: 'facts',
      title: 'Recepción',
      items: [
        { label: 'Folio', value: receipt.receiptFolio ?? '' },
        { label: 'Fecha', value: shortDateTime(receipt.receivedAt) },
        { label: 'Factura', value: receipt.supplierInvoiceNumber ?? '—' },
        {
          label: 'Presentación',
          value: receipt.purchaseQty ? formatQty(receipt.purchaseQty, receipt.purchaseUom) : '—',
        },
        { label: 'Lote', value: lot?.lotNumber ?? '—' },
        { label: 'Caducidad', value: lot?.expirationDate ? shortDate(lot.expirationDate) : '—' },
      ],
    });
  sections.push(
    table(
      'Consumo por cierre',
      [
        { key: 'close', label: 'Cierre' },
        { key: 'theoretical', label: 'Teórico', end: true },
        { key: 'actual', label: 'Real', end: true },
        showCost ? { key: 'cost', label: 'Costo', end: true } : null,
      ],
      lines.map(({ close, line }) => ({
        close: close.folio ?? '',
        theoretical: formatQty(line.theoreticalQty, line.baseUom),
        actual: formatQty(line.actualQty, line.baseUom),
        cost: money(line.unitCost === null ? null : line.unitCost * line.actualQty) ?? '',
      })),
      lines.length > 1
        ? {
            close: 'Total',
            theoretical: formatQty(
              lines.reduce((s, x) => s + x.line.theoreticalQty, 0),
              uom,
            ),
            actual: formatQty(
              lines.reduce((s, x) => s + x.line.actualQty, 0),
              uom,
            ),
            cost: showCost
              ? (money(lines.reduce((s, x) => s + (x.line.unitCost ?? 0) * x.line.actualQty, 0)) ??
                '')
              : '',
          }
        : null,
    ),
  );
  if (depleted)
    sections.push({
      kind: 'note',
      title: null,
      text: 'El lote se agotó en la planta: FEFO tomó el siguiente lote para los consumos posteriores.',
      tone: 'info',
    });
  return {
    icon: CARD_ICONS[card.kind].icon,
    type: receipt ? 'Orden de compra · recepción' : 'Lote de materia prima',
    title: receipt?.purchaseOrderFolio ?? lot?.lotNumber ?? card.node.label,
    subtitle: [lot?.sku ?? receipt?.sku, lot?.itemName ?? receipt?.itemName]
      .filter(Boolean)
      .join(' · '),
    status: receipt?.purchaseOrderStatus
      ? { value: receipt.purchaseOrderStatus, kind: 'PurchaseOrderStatus' }
      : null,
    stats: stats(
      stat('Comprado', bought === null ? null : formatQty(bought, uom)),
      stat('Usado en la cadena', formatQty(used, uom)),
      stat('Precio por unidad base', money(receipt?.unitCostBase, 4)),
      stat(
        'Caducidad',
        days === null
          ? null
          : days < 0
            ? 'Caducado'
            : `caduca en ${days} ${days === 1 ? 'día' : 'días'}`,
        days !== null && days <= EXPIRY_ALERT_DAYS ? 'warn' : null,
      ),
      stat('Lote', lot?.lotNumber),
    ),
    sections,
    link: receipt?.purchaseOrderId ? documentLink('PurchaseOrder', receipt.purchaseOrderId) : null,
    traceFrom: receipt?.purchaseOrderId
      ? { type: 'PurchaseOrder', id: receipt.purchaseOrderId }
      : lotTrace(lot?.lotId),
  };
}

function orderDetail(group: TraceGroupBox, { nodes }: Ctx): DetailModel {
  const o = group.order!;
  const closes = o.nodeIds
    .map((id) => nodes.get(id))
    .filter((n): n is TraceNode => n?.type === 'ProductionClose');
  const percent = o.plannedQty > 0 ? (o.producedQty / o.plannedQty) * 100 : 0;
  const waste = closes.some((c) => c.wasteCost === null || c.wasteCost === undefined)
    ? null
    : closes.reduce((s, c) => s + (c.wasteCost ?? 0), 0);
  const steps = [
    ...o.statusHistory.map((s) => ({
      label: enumLabel('ProductionOrderStatus', s.status) + (s.byName ? ` · ${s.byName}` : ''),
      at: s.at,
    })),
    ...closes.map((c) => ({
      label: `Cierre ${c.kind === 'Final' ? 'final' : 'parcial'} ${c.folio} · ${formatQty(c.producedQty, c.baseUom)}`,
      at: c.closedAt ?? '',
    })),
  ]
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((s) => ({ label: s.label, at: shortDateTime(s.at) }));
  const sections: DetailSection[] = [
    {
      kind: 'meter',
      title: 'Avance',
      percent: Math.min(100, percent),
      label: `${formatQty(o.producedQty, null)} de ${formatQty(o.plannedQty, o.baseUom)}`,
      rest: enumLabel('ProductionOrderStatus', o.status),
    },
    { kind: 'steps', title: 'Recorrido', steps },
    {
      kind: 'facts',
      title: 'Datos',
      items: [
        { label: 'Receta', value: `${o.recipeName} · v${o.recipeVersion}` },
        {
          label: 'Área y turno',
          value: [o.areaName, enumLabel('Shift', o.shift)].filter(Boolean).join(' · ') || '—',
        },
        { label: 'Fecha', value: shortDate(o.scheduledDate) },
        { label: 'Origen', value: enumLabel('ProductionOrderSource', o.source) },
        ...(waste === null ? [] : [{ label: 'Merma', value: formatMxn(waste) }]),
      ],
    },
  ];
  if (o.demands.length > 0)
    sections.push(
      table(
        'Pedidos que atiende',
        [
          { key: 'folio', label: 'Folio' },
          { key: 'party', label: 'Sucursal o cliente' },
          { key: 'qty', label: 'Piezas', end: true },
        ],
        o.demands.map((d) => ({
          folio: d.folio,
          party: d.partyName,
          qty: formatQty(d.quantity, o.baseUom),
        })),
        {
          folio: 'Total',
          party: '',
          qty: formatQty(
            o.demands.reduce((s, d) => s + d.quantity, 0),
            o.baseUom,
          ),
        },
      ),
    );
  if (o.shortfallReason)
    sections.push({
      kind: 'note',
      title: 'Motivo del faltante',
      text: enumLabel('ShortfallReason', o.shortfallReason),
      tone: 'warn',
    });
  return {
    icon: 'factory',
    type: 'Orden de producción',
    title: o.folio,
    subtitle: `${o.sku} · ${o.itemName}`,
    status: { value: o.status, kind: 'ProductionOrderStatus' },
    stats: stats(
      stat('Planeado', formatQty(o.plannedQty, o.baseUom)),
      stat('Producido', formatQty(o.producedQty, o.baseUom), percent >= 100 ? 'ok' : null),
      stat('Costo total', money(o.totalCost)),
      stat('Costo por pieza', money(o.unitCost, 4)),
      stat('Cierres', String(closes.length)),
    ),
    sections,
    link: documentLink('ProductionOrder', o.productionOrderId),
    traceFrom: { type: 'ProductionOrder', id: o.productionOrderId },
  };
}

function locationDetail(group: TraceGroupBox, { nodes }: Ctx): DetailModel {
  const stocks = group.cardIds.map((id) => nodes.get(id)!);
  const loc = group.location!;
  const inQty = stocks.reduce((s, n) => s + (n.inQty ?? 0), 0);
  const out = stocks.reduce(
    (s, n) => s + Object.values(n.outByType ?? {}).reduce((a, b) => a + b, 0),
    0,
  );
  return {
    icon: 'inventory_2',
    type: 'Almacén',
    title: loc.name || loc.code,
    subtitle: loc.code,
    status: null,
    stats: stats(
      stat('Entró', formatQty(inQty, loc.uom)),
      stat('Salió', formatQty(out, loc.uom)),
      stat('Saldo', formatQty(loc.onHand, loc.uom), loc.onHand > 0 ? 'warn' : null),
      stat('Lotes', String(stocks.length)),
    ),
    sections: [
      table(
        'Lotes',
        [
          { key: 'lot', label: 'Lote' },
          { key: 'in', label: 'Entró', end: true },
          { key: 'onHand', label: 'Saldo', end: true },
        ],
        stocks.map((s) => ({
          lot: s.lotNumber ?? '',
          in: formatQty(s.inQty, s.baseUom),
          onHand: formatQty(s.onHandQty, s.baseUom),
        })),
      ),
    ],
    link: null,
    traceFrom: null,
  };
}

function closeDetail(card: TraceCard, { graph, nodes }: Ctx): DetailModel {
  const n = card.node;
  const output = graph.edges
    .filter((e) => e.from === n.id && e.kind === 'Produced')
    .map((e) => nodes.get(e.to)!)[0];
  const order = graph.groups.find((g) => g.productionOrderId === n.productionOrderId);
  const lines = n.lines ?? [];
  const showCost = lines.some((l) => l.unitCost !== null);
  const rows = [
    ...lines.map((l) => ({
      item: l.sku,
      lot: l.lotNumber ?? 'sin lote',
      qty: formatQty(l.actualQty, l.baseUom),
      cost: money(l.unitCost === null ? null : l.unitCost * l.actualQty) ?? '',
    })),
    ...(n.unlottedConsumption ?? [])
      .filter((u) => !lines.some((l) => l.itemId === u.itemId && l.lotId === null))
      .map((u) => ({ item: u.sku, lot: 'sin lote', qty: formatQty(u.qty, u.baseUom), cost: '' })),
  ];
  const shelfLife =
    output?.createdAt && output.expirationDate
      ? daysTo(output.expirationDate, output.createdAt)
      : null;
  const note =
    n.kind === 'Final'
      ? 'Con este cierre la OP quedó terminada.'
      : n.sequence === 1
        ? 'Con este cierre la OP pasó a En proceso.'
        : null;
  const sections: DetailSection[] = [
    {
      kind: 'facts',
      title: 'Datos',
      items: [
        {
          label: 'Fecha y turno',
          value: [shortDate(n.businessDate), enumLabel('Shift', n.shift)]
            .filter(Boolean)
            .join(' · '),
        },
        { label: 'Registró', value: n.closedByName ?? '—' },
        { label: 'Lote generado', value: output?.lotNumber ?? '—' },
        {
          label: 'Caducidad',
          value: output?.expirationDate
            ? `${shortDate(output.expirationDate)}${shelfLife === null ? '' : ` · vida útil ${shelfLife} días`}`
            : '—',
        },
      ],
    },
    table(
      'Consumo real por lote',
      [
        { key: 'item', label: 'Componente' },
        { key: 'lot', label: 'Lote' },
        { key: 'qty', label: 'Cantidad', end: true },
        showCost ? { key: 'cost', label: 'Costo', end: true } : null,
      ],
      rows,
      showCost && n.totalCost !== null && n.totalCost !== undefined
        ? { item: 'Total', lot: '', qty: '', cost: formatMxn(n.totalCost) }
        : null,
    ),
  ];
  if (note) sections.push({ kind: 'note', title: null, text: note, tone: 'info' });
  return {
    icon: 'factory',
    type: `Cierre ${n.kind === 'Final' ? 'final' : 'parcial'} · #${n.sequence ?? ''}`,
    title: n.folio ?? n.label,
    subtitle: order ? `${order.folio} · ${order.itemName}` : '',
    status: null,
    stats: stats(
      stat('Producido', formatQty(n.producedQty, n.baseUom)),
      stat('Costo del cierre', money(n.totalCost)),
      stat('Costo por pieza', money(n.unitCost, 4)),
      stat('Merma', money(n.wasteCost)),
      stat('Fecha', shortDateTime(n.closedAt)),
      stat('Componentes', String(rows.length)),
    ),
    sections,
    link: n.closeId ? documentLink('ProductionClose', n.closeId) : null,
    traceFrom: n.productionOrderId ? { type: 'ProductionOrder', id: n.productionOrderId } : null,
  };
}

function lotDetail(card: TraceCard, { graph, nodes }: Ctx): DetailModel {
  const n = card.node;
  const produced = graph.edges.filter((e) => e.to === n.id && e.kind === 'Produced');
  const close = produced.map((e) => nodes.get(e.from)).find(Boolean);
  const order = graph.groups.find((g) => g.productionOrderId === close?.productionOrderId);
  const stocks = graph.nodes.filter((s) => s.type === 'Stock' && s.lotId === n.lotId);
  const onHand = stocks.reduce((s, x) => s + (x.onHandQty ?? 0), 0);
  const loss = graph.edges
    .filter(
      (e) => e.kind === 'Delivered' && e.shippedQty != null && nodes.get(e.to)?.lotId === n.lotId,
    )
    .reduce((s, e) => s + Math.max(0, (e.shippedQty ?? 0) - (e.qty ?? 0)), 0);
  const total = onHand + loss;
  const days = daysTo(n.expirationDate, graph.asOf);
  const rawLots = close
    ? new Set(
        graph.edges.filter((e) => e.to === close.id && e.kind === 'Consumed').map((e) => e.from),
      ).size
    : 0;
  const parts = stocks
    .filter((s) => (s.onHandQty ?? 0) > 0)
    .map((s) => ({
      label: s.locationCode ?? '',
      text: formatQty(s.onHandQty, s.baseUom),
      share: total > 0 ? ((s.onHandQty ?? 0) / total) * 100 : 0,
      warn: false,
    }));
  if (loss > 0)
    parts.push({
      label: 'Pérdida en tránsito',
      text: formatQty(loss, n.baseUom),
      share: (loss / total) * 100,
      warn: true,
    });
  const sections: DetailSection[] = [
    { kind: 'stack', title: 'Dónde está hoy', parts },
    {
      kind: 'facts',
      title: 'Origen',
      items: [
        { label: 'Cierre', value: close?.folio ?? '—' },
        { label: 'OP', value: order?.folio ?? '—' },
        { label: 'Alta', value: shortDateTime(n.createdAt) || '—' },
        { label: 'Lotes de materia prima', value: String(rawLots) },
      ],
    },
  ];
  if (days !== null && days <= EXPIRY_ALERT_DAYS)
    sections.push({
      kind: 'note',
      title: null,
      text:
        days < 0
          ? 'El lote ya caducó.'
          : `El lote está en alerta de caducidad: vence en ${days} ${days === 1 ? 'día' : 'días'}.`,
      tone: 'warn',
    });
  return {
    icon: 'sell',
    type: n.itemType === 'SemiFinished' ? 'Lote semiterminado' : 'Lote terminado',
    title: n.lotNumber ?? n.label,
    subtitle: [n.sku, n.itemName].filter(Boolean).join(' · '),
    status: null,
    stats: stats(
      stat(
        'Producido',
        formatQty(
          produced.reduce((s, e) => s + (e.qty ?? 0), 0),
          n.baseUom,
        ),
      ),
      stat(
        'Caducidad',
        n.expirationDate ? shortDate(n.expirationDate) : null,
        days !== null && days <= EXPIRY_ALERT_DAYS ? 'warn' : null,
      ),
      stat('Costo por pieza', money(n.unitCost, 4)),
      stat('En existencia hoy', formatQty(onHand, n.baseUom), onHand > 0 ? 'warn' : null),
      stat('Ubicaciones', String(stocks.length)),
    ),
    sections,
    link: null,
    traceFrom: lotTrace(n.lotId),
  };
}

function stockDetail(n: TraceNode, card: TraceCard): DetailModel {
  const out = Object.values(n.outByType ?? {}).reduce((a, b) => a + b, 0);
  const movements = n.movements ?? [];
  const sections: DetailSection[] = [
    table(
      'Kardex del lote',
      [
        { key: 'at', label: 'Hora' },
        { key: 'folio', label: 'Documento' },
        { key: 'type', label: 'Movimiento' },
        { key: 'qty', label: 'Piezas', end: true },
        { key: 'balance', label: 'Saldo', end: true },
      ],
      movements.map((m) => ({
        at: shortDateTime(m.at),
        folio: m.folio,
        type: enumLabel('MovementType', m.type),
        qty: (m.quantity > 0 ? '+' : '') + formatQty(m.quantity, null),
        balance: formatQty(m.balance, null),
      })),
    ),
  ];
  if (n.movementsTruncated)
    sections.push({
      kind: 'note',
      title: null,
      text: 'Se muestran los últimos 50 movimientos.',
      tone: 'info',
    });
  return {
    icon: CARD_ICONS[card.kind].icon,
    type: card.kind === 'branch' ? 'Existencia en sucursal' : 'Existencia del lote',
    title: n.lotNumber ?? n.label,
    subtitle: [n.locationCode, n.locationName].filter(Boolean).join(' · '),
    status: null,
    stats: stats(
      stat('Entró', formatQty(n.inQty, n.baseUom)),
      stat('Salió', formatQty(out, n.baseUom)),
      stat('Saldo', formatQty(n.onHandQty, n.baseUom), (n.onHandQty ?? 0) > 0 ? 'warn' : null),
      stat('Salidas', String(movements.filter((m) => m.quantity < 0).length)),
    ),
    sections,
    link: null,
    traceFrom: lotTrace(n.lotId),
  };
}

function transferDetail(card: TraceCard, { graph }: Ctx): DetailModel {
  const n = card.node;
  const lines = n.transferLines ?? [];
  const shipped = lines.reduce((s, l) => s + l.shippedQty, 0);
  const receivedKnown = lines.every((l) => l.receivedQty !== null) && lines.length > 0;
  const received = lines.reduce((s, l) => s + (l.receivedQty ?? 0), 0);
  const difference = receivedKnown ? shipped - received : null;
  const missingOf = (l: (typeof lines)[number]) =>
    l.shippedQty - (l.receivedQty ?? 0) - (l.rejectedQty ?? 0);
  const minutes = minutesBetween(n.dispatchedAt, n.deliveredAt);
  const uom = n.baseUom ?? graph.edges.find((e) => e.to === n.id)?.baseUom ?? null;
  const sections: DetailSection[] = [];
  // RN-116: what the branch rejected (its own card) is not what was missing.
  for (const l of lines.filter((x) => x.receivedQty !== null && (x.rejectedQty ?? 0) > 0))
    sections.push({
      kind: 'note',
      title: 'Rechazo en la recepción',
      text: `Se rechazaron ${formatQty(l.rejectedQty, uom)} del lote ${l.lotNumber ?? 'sin lote'} · ${
        l.rejectionDisposition === 'Return' ? 'regresaron al origen' : 'merma'
      }`,
      tone: 'warn',
    });
  for (const l of lines.filter((x) => x.receivedQty !== null && missingOf(x) > 0))
    sections.push({
      kind: 'note',
      title: 'Diferencia en la recepción',
      text: [
        `Faltaron ${formatQty(missingOf(l), uom)} del lote ${l.lotNumber ?? 'sin lote'}`,
        l.discrepancyReason
          ? `motivo: ${enumLabel('DiscrepancyReason', l.discrepancyReason)}`
          : null,
        l.discrepancyNotes,
      ]
        .filter(Boolean)
        .join(' · '),
      tone: 'warn',
    });
  sections.push({
    kind: 'facts',
    title: 'Envío',
    items: [
      {
        label: 'Pedido',
        value: n.branchOrderFolio
          ? `${n.branchOrderFolio}${n.requestedQty == null ? '' : ` · solicitado ${formatQty(n.requestedQty, uom)}`}${n.approvedQty == null ? '' : ` · aprobado ${formatQty(n.approvedQty, uom)}`}`
          : '—',
      },
      { label: 'Aprobación', value: shortDateTime(n.approvedAt) || '—' },
      {
        label: 'Despacho',
        value:
          [shortDateTime(n.dispatchedAt), n.vehicleDescription, n.driverName]
            .filter(Boolean)
            .join(' · ') || '—',
      },
      { label: 'Recepción', value: shortDateTime(n.deliveredAt) || '—' },
    ],
  });
  sections.push(
    table(
      'Por lote',
      [
        { key: 'lot', label: 'Lote' },
        { key: 'shipped', label: 'Enviado', end: true },
        { key: 'received', label: 'Recibido', end: true },
      ],
      lines.map((l) => ({
        lot: l.lotNumber ?? 'sin lote',
        shipped: formatQty(l.shippedQty, uom),
        received: l.receivedQty === null ? '—' : formatQty(l.receivedQty, uom),
      })),
      lines.length > 1
        ? {
            lot: 'Total',
            shipped: formatQty(shipped, uom),
            received: receivedKnown ? formatQty(received, uom) : '—',
          }
        : null,
    ),
  );
  return {
    icon: 'local_shipping',
    type: `Traspaso · ${n.fromLocationCode ?? ''} → ${n.toLocationCode ?? ''}`,
    title: n.folio ?? n.label,
    subtitle: n.branchOrderFolio ? `Pedido ${n.branchOrderFolio}` : '',
    status: n.transferStatus ? { value: n.transferStatus, kind: 'TransferStatus' } : null,
    stats: stats(
      stat('Enviado', formatQty(shipped, uom)),
      stat(
        'Recibido',
        receivedKnown ? formatQty(received, uom) : null,
        difference ? 'warn' : receivedKnown ? 'ok' : null,
      ),
      stat(
        'Diferencia',
        difference === null ? null : formatQty(difference, uom),
        difference ? 'warn' : null,
      ),
      stat('Minutos en tránsito', minutes === null ? null : `${minutes} min`),
      stat('Lotes', String(lines.length)),
    ),
    sections,
    link: n.transferId ? documentLink('Transfer', n.transferId) : null,
    traceFrom: n.transferId ? { type: 'Transfer', id: n.transferId } : null,
  };
}

function branchDetail(card: TraceCard, ctx: Ctx): DetailModel {
  const { graph, nodes } = ctx;
  const n = card.node;
  const incoming = graph.edges.filter((e) => e.to === n.id && e.kind === 'Delivered');
  const received = incoming.reduce((s, e) => s + (e.qty ?? 0), 0);
  const shipped = incoming.reduce((s, e) => s + (e.shippedQty ?? e.qty ?? 0), 0);
  const transfers = incoming.map((e) => nodes.get(e.from)!).filter(Boolean);
  const lot = graph.nodes.find((x) => x.type === 'Lot' && x.lotId === n.lotId);
  const days = daysTo(lot?.expirationDate, graph.asOf);
  const outs = Object.entries(n.outByType ?? {});
  const sections: DetailSection[] = [
    table(
      'Existencia por lote',
      [
        { key: 'lot', label: 'Lote' },
        { key: 'qty', label: 'Piezas', end: true },
        { key: 'exp', label: 'Caducidad' },
      ],
      [
        {
          lot: n.lotNumber ?? '',
          qty: formatQty(n.onHandQty, n.baseUom),
          exp: lot?.expirationDate
            ? `${shortDate(lot.expirationDate)}${days === null ? '' : days < 0 ? ' · caducado' : ` · ${days} ${days === 1 ? 'día' : 'días'}`}`
            : '—',
        },
      ],
    ),
  ];
  if (transfers.length > 0)
    sections.push({
      kind: 'facts',
      title: 'Llegó por',
      items: transfers.flatMap((t) => [
        { label: 'Traspaso', value: t.folio ?? '' },
        { label: 'Pedido', value: t.branchOrderFolio ?? '—' },
        {
          label: 'Unidad',
          value: [t.vehicleDescription, t.driverName].filter(Boolean).join(' · ') || '—',
        },
      ]),
    });
  if (outs.length > 0)
    sections.push(
      table(
        'Consumos y mermas',
        [
          { key: 'type', label: 'Movimiento' },
          { key: 'qty', label: 'Piezas', end: true },
        ],
        outs.map(([type, qty]) => ({
          type: enumLabel('MovementType', type as never),
          qty: formatQty(qty, n.baseUom),
        })),
      ),
    );
  return {
    icon: 'store',
    type: 'Sucursal',
    title: n.locationCode ?? n.label,
    subtitle: [n.locationName, n.lotNumber].filter(Boolean).join(' · '),
    status: null,
    stats: stats(
      stat(
        'Recibido',
        incoming.length ? formatQty(received, n.baseUom) : null,
        received < shipped ? 'warn' : 'ok',
      ),
      stat('Enviado', incoming.length ? formatQty(shipped, n.baseUom) : null),
      stat(
        'Existencia actual',
        formatQty(n.onHandQty, n.baseUom),
        (n.onHandQty ?? 0) > 0 ? 'warn' : null,
      ),
      stat(
        'Hora de recepción',
        transfers[0]?.deliveredAt ? shortDateTime(transfers[0].deliveredAt) : null,
      ),
      stat('Entró', formatQty(n.inQty, n.baseUom)),
    ),
    sections,
    link: null,
    traceFrom: lotTrace(n.lotId),
  };
}

function shipmentDetail(card: TraceCard, { graph, nodes }: Ctx): DetailModel {
  const n = card.node;
  const shipments =
    card.kind === 'shipment'
      ? [n]
      : graph.edges
          .filter((e) => e.to === n.id)
          .map((e) => nodes.get(e.from)!)
          .filter(Boolean);
  const lines = graph.edges
    .filter((e) => e.kind === 'Shipped' && shipments.some((s) => s.id === e.to))
    .map((e) => ({ stock: nodes.get(e.from), qty: e.qty ?? 0, uom: e.baseUom }));
  const total = lines.reduce((s, l) => s + l.qty, 0);
  const uom = lines[0]?.uom ?? null;
  return {
    icon: CARD_ICONS[card.kind].icon,
    type: card.kind === 'shipment' ? 'Remisión' : 'Cliente',
    title: card.kind === 'shipment' ? (n.folio ?? n.label) : (n.customerName ?? n.label),
    subtitle: card.kind === 'shipment' ? (n.customerName ?? '') : (n.customerCode ?? ''),
    status:
      card.kind === 'shipment' && n.shipmentStatus
        ? { value: n.shipmentStatus, kind: 'CustomerShipmentStatus' }
        : null,
    stats: stats(
      stat('Remisionado', formatQty(total, uom)),
      stat('Lotes', String(new Set(lines.map((l) => l.stock?.lotId)).size)),
      stat('Fecha', card.kind === 'shipment' ? shortDateTime(n.dispatchedAt) : null),
      stat('Remisiones', card.kind === 'customer' ? String(shipments.length) : null),
      stat('Entrega', n.customerName),
    ),
    sections: [
      table(
        'Lotes',
        [
          { key: 'lot', label: 'Lote' },
          { key: 'qty', label: 'Piezas', end: true },
        ],
        lines.map((l) => ({ lot: l.stock?.lotNumber ?? 'sin lote', qty: formatQty(l.qty, l.uom) })),
      ),
      {
        kind: 'facts',
        title: 'Pedido del cliente',
        items: shipments.map((s) => ({ label: s.folio ?? '', value: s.customerOrderFolio ?? '—' })),
      },
    ],
    link:
      card.kind === 'shipment' && n.shipmentId
        ? documentLink('CustomerShipment', n.shipmentId)
        : null,
    traceFrom:
      card.kind === 'shipment' && n.shipmentId
        ? { type: 'CustomerShipment', id: n.shipmentId }
        : null,
  };
}
