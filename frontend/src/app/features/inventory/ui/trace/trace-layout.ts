import { formatQty } from '../../../../shared/pipes/pipes';
import type {
  TraceEdge,
  TraceGraph,
  TraceGroup,
  TraceNode,
} from '../../data-access/traceability-api';

// Measures of the map (trazabilidad-ui §4.2).
export const LANE_WIDTH = 248;
export const CARD_W = 184;
export const CARD_H = 88;
export const STEP = 104;
export const TOP = 72;
export const ORDER_HEADER = 112;
export const LOCATION_HEADER = 52;
const GROUP_PAD = 10;
const THIN = 1.3;

export type CardKind =
  | 'supplier'
  | 'origin'
  | 'receipt'
  | 'rawLot'
  | 'close'
  | 'lot'
  | 'stock'
  | 'transfer'
  | 'shipment'
  | 'branch'
  | 'customer'
  /** RN-114: what a customer rejected on delivery. */
  | 'rejection';

export type LinkType = 'supplier' | 'material' | 'product' | 'difference';

export interface TraceLane {
  key: string;
  /** Stage number shown in the header (1 = Proveedor). */
  stage: number;
  label: string;
  icon: string;
  x: number;
  count: number;
}

export interface TraceCard {
  id: string;
  kind: CardKind;
  lane: string;
  x: number;
  y: number;
  /** The node the card stands for (a compacted receipt keeps its lot in `lot`). */
  node: TraceNode;
  lot: TraceNode | null;
  /** Every graph node drawn by this card (selection and "Rastrear"). */
  nodeIds: string[];
  groupId: string | null;
  date: string | null;
}

export interface TraceGroupBox {
  id: string;
  kind: 'order' | 'location';
  x: number;
  y: number;
  width: number;
  height: number;
  cardIds: string[];
  order: TraceGroup | null;
  location: { code: string; name: string; onHand: number; uom: string } | null;
}

export interface TraceLink {
  id: string;
  from: string;
  to: string;
  type: LinkType;
  qty: number | null;
  uom: string | null;
  shippedQty: number | null;
  width: number;
  edges: TraceEdge[];
  d: string;
  labelX: number;
  labelY: number;
  label: string | null;
}

export interface TraceLayout {
  lanes: TraceLane[];
  cards: TraceCard[];
  groups: TraceGroupBox[];
  links: TraceLink[];
  width: number;
  height: number;
  /** Card of each graph node (compacted nodes map to the card that draws them). */
  cardOf: ReadonlyMap<string, string>;
}

const RAW_TYPES = new Set(['RawMaterial', 'Supply']);

interface LaneDef {
  key: string;
  label: string;
  icon: string;
}

/**
 * Lanes, cards, groups and links of the traceability map (trazabilidad-ui §4): fixed stages left to right, compaction
 * (§4.4), order by barycenter with a minimum step (§4.3), stacked ports and band width by quantity (§4.5). Pure: the
 * graph from `/traceability/graph` does not change.
 */
export function layoutTrace(graph: TraceGraph): TraceLayout {
  const receiptsOfLot = new Map<string, TraceNode[]>();
  for (const n of graph.nodes)
    if (n.type === 'PurchaseReceipt' && n.lotId)
      receiptsOfLot.set(n.lotId, [...(receiptsOfLot.get(n.lotId) ?? []), n]);
  const levels = closeLevels(graph);

  // ---- Cards ----
  const cards = new Map<string, TraceCard>();
  const cardOf = new Map<string, string>();
  const lotCardOf = new Map<string, string>(); // lotId → card that draws the lot
  const add = (
    node: TraceNode,
    kind: CardKind,
    lane: string,
    date: string | null,
    groupId: string | null = null,
  ) => {
    cards.set(node.id, {
      id: node.id,
      kind,
      lane,
      x: 0,
      y: 0,
      node,
      lot: null,
      nodeIds: [node.id],
      groupId,
      date,
    });
    cardOf.set(node.id, node.id);
  };
  for (const n of graph.nodes) {
    switch (n.type) {
      case 'Supplier':
        add(n, 'supplier', 'supplier', null);
        break;
      case 'InitialStock':
        add(n, 'origin', 'supplier', n.postedAt ?? null);
        break;
      case 'PurchaseReceipt':
        add(n, 'receipt', 'purchase', n.receivedAt ?? null);
        break;
      case 'ProductionClose':
        add(
          n,
          'close',
          laneKey('production', levels.close.get(n.id) ?? 0),
          n.closedAt ?? null,
          `op:${n.productionOrderId}`,
        );
        break;
      case 'Transfer':
        add(n, 'transfer', 'shipping', n.dispatchedAt ?? null);
        break;
      case 'CustomerShipment':
        add(n, 'shipment', 'shipping', n.dispatchedAt ?? null);
        break;
      case 'Customer':
        add(n, 'customer', 'destination', null);
        break;
      case 'Rejection':
        add(n, 'rejection', 'destination', n.deliveredAt ?? null);
        break;
    }
  }
  for (const n of graph.nodes.filter((x) => x.type === 'Lot')) {
    const receipts = receiptsOfLot.get(n.lotId!) ?? [];
    if (RAW_TYPES.has(n.itemType ?? '') && receipts.length === 1) {
      // §4.4: a receipt with a single lot is one card (OC, lot, quantity used).
      const card = cards.get(receipts[0].id)!;
      card.lot = n;
      card.nodeIds.push(n.id);
      cardOf.set(n.id, card.id);
      lotCardOf.set(n.lotId!, card.id);
    } else if (RAW_TYPES.has(n.itemType ?? '')) {
      add(n, 'rawLot', 'purchase', n.createdAt ?? null);
      lotCardOf.set(n.lotId!, n.id);
    } else {
      add(n, 'lot', laneKey('lot', levels.lot.get(n.id) ?? 0), n.createdAt ?? null);
      lotCardOf.set(n.lotId!, n.id);
    }
  }
  for (const n of graph.nodes.filter((x) => x.type === 'Stock')) {
    const lotCard = lotCardOf.get(n.lotId!);
    const finished = n.itemType === 'FinishedGood';
    if (n.locationType === 'Plant' && !finished && lotCard) {
      // §4.4: the plant stock of a raw or semi-finished lot is not drawn; its links leave from the lot.
      cards.get(lotCard)!.nodeIds.push(n.id);
      cardOf.set(n.id, lotCard);
    } else if (n.locationType === 'Plant') {
      add(n, 'stock', 'warehouse', null, `loc:${n.locationId}`);
    } else {
      add(n, 'branch', 'destination', null);
    }
  }

  // ---- Lanes ----
  const maxLevel = Math.max(0, ...levels.close.values(), ...levels.lot.values());
  const defs: LaneDef[] = [
    { key: 'supplier', label: 'Proveedor', icon: 'storefront' },
    { key: 'purchase', label: 'Orden de compra', icon: 'receipt_long' },
  ];
  for (let level = maxLevel; level >= 1; level--)
    defs.push(
      {
        key: laneKey('production', level),
        label: `Producción · nivel ${level + 1}`,
        icon: 'factory',
      },
      { key: laneKey('lot', level), label: `Lote · nivel ${level + 1}`, icon: 'sell' },
    );
  defs.push(
    { key: 'production', label: 'Producción', icon: 'factory' },
    { key: 'lot', label: 'Lote', icon: 'sell' },
    { key: 'warehouse', label: 'Almacén', icon: 'inventory_2' },
    { key: 'shipping', label: 'Envío', icon: 'local_shipping' },
    { key: 'destination', label: 'Destino', icon: 'store' },
  );
  const used = defs.filter((d) => [...cards.values()].some((c) => c.lane === d.key));
  const lanes: TraceLane[] = used.map((d, i) => ({
    ...d,
    stage: i + 1,
    x: i * LANE_WIDTH,
    count: [...cards.values()].filter((c) => c.lane === d.key).length,
  }));
  const laneIndex = new Map(lanes.map((l, i) => [l.key, i]));
  for (const card of cards.values())
    card.x = laneIndex.get(card.lane)! * LANE_WIDTH + (LANE_WIDTH - CARD_W) / 2;

  // ---- Links (card level) ----
  const merged = new Map<string, TraceLink>();
  for (const edge of graph.edges) {
    const from = cardOf.get(edge.from);
    const to = cardOf.get(edge.to);
    if (!from || !to || from === to) continue; // compacted: Received and Entered inside one card
    const type = linkType(edge, cards.get(from)!);
    const id = `${from}>${to}>${type}`;
    const link = merged.get(id);
    if (link) {
      link.qty = (link.qty ?? 0) + (edge.qty ?? 0);
      link.shippedQty =
        edge.shippedQty == null ? link.shippedQty : (link.shippedQty ?? 0) + edge.shippedQty;
      link.edges.push(edge);
    } else {
      merged.set(id, {
        id,
        from,
        to,
        type,
        qty: edge.qty ?? null,
        uom: edge.baseUom ?? null,
        shippedQty: edge.shippedQty ?? null,
        width: THIN,
        edges: [edge],
        d: '',
        labelX: 0,
        labelY: 0,
        label: null,
      });
    }
  }
  const links = [...merged.values()];
  const maxQty = Math.max(1, ...links.filter((l) => isBand(l.type)).map((l) => l.qty ?? 0));
  for (const link of links)
    link.width = isBand(link.type) ? bandWidth(link.qty ?? 0, maxQty) : THIN;

  // ---- Vertical order (§4.3) ----
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  for (const l of links) {
    parents.set(l.to, [...(parents.get(l.to) ?? []), l.from]);
    children.set(l.from, [...(children.get(l.from) ?? []), l.to]);
  }
  const inLane = (key: string) => [...cards.values()].filter((c) => c.lane === key);
  const supplierOf = (card: TraceCard) =>
    (parents.get(card.id) ?? []).map((p) => cards.get(p)!).find((p) => p.kind === 'supplier')?.node
      .label ?? '';

  place(
    inLane('supplier').sort((a, b) => a.node.label.localeCompare(b.node.label, 'es')),
    null,
  );
  place(
    inLane('purchase').sort(
      (a, b) =>
        supplierOf(a).localeCompare(supplierOf(b), 'es') ||
        (a.node.purchaseOrderFolio ?? '').localeCompare(b.node.purchaseOrderFolio ?? '') ||
        compareDate(a, b),
    ),
    null,
  );
  for (const lane of lanes.filter((l) => l.key !== 'supplier' && l.key !== 'purchase')) {
    const list = inLane(lane.key);
    const desired = new Map(
      list.map((c) => [c.id, mean((parents.get(c.id) ?? []).map((p) => cards.get(p)!.y))]),
    );
    // The cards of a group stay together: the group goes where its cards want to be on average.
    const groupDesired = new Map<string, number>();
    for (const c of list)
      if (c.groupId && !groupDesired.has(c.groupId))
        groupDesired.set(
          c.groupId,
          mean(
            list.filter((x) => x.groupId === c.groupId).map((x) => desired.get(x.id) ?? Infinity),
          ) ?? Infinity,
        );
    const key = (c: TraceCard) =>
      c.groupId ? groupDesired.get(c.groupId)! : (desired.get(c.id) ?? Infinity);
    list.sort(
      (a, b) =>
        key(a) - key(b) ||
        (a.groupId ?? '').localeCompare(b.groupId ?? '') ||
        (desired.get(a.id) ?? Infinity) - (desired.get(b.id) ?? Infinity) ||
        compareDate(a, b) ||
        folio(a).localeCompare(folio(b)),
    );
    place(list, desired);
  }
  // Backward pass: suppliers next to their purchase orders.
  const suppliers = inLane('supplier');
  const desiredSuppliers = new Map(
    suppliers.map((c) => [c.id, mean((children.get(c.id) ?? []).map((ch) => cards.get(ch)!.y))]),
  );
  place(
    suppliers.sort(
      (a, b) => (desiredSuppliers.get(a.id) ?? Infinity) - (desiredSuppliers.get(b.id) ?? Infinity),
    ),
    desiredSuppliers,
  );

  // ---- Groups ----
  const groups: TraceGroupBox[] = [];
  const byGroup = new Map<string, TraceCard[]>();
  for (const c of cards.values())
    if (c.groupId) byGroup.set(c.groupId, [...(byGroup.get(c.groupId) ?? []), c]);
  for (const [id, list] of byGroup) {
    const kind = id.startsWith('op:') ? 'order' : 'location';
    const top =
      Math.min(...list.map((c) => c.y)) - (kind === 'order' ? ORDER_HEADER : LOCATION_HEADER);
    const bottom = Math.max(...list.map((c) => c.y)) + CARD_H + GROUP_PAD;
    const stock = list[0].node;
    groups.push({
      id,
      kind,
      x: list[0].x - (LANE_WIDTH - CARD_W) / 2 + GROUP_PAD,
      y: top,
      width: LANE_WIDTH - 2 * GROUP_PAD,
      height: bottom - top,
      cardIds: list.map((c) => c.id),
      order: kind === 'order' ? (graph.groups.find((g) => g.id === id) ?? null) : null,
      location:
        kind === 'location'
          ? {
              code: stock.locationCode ?? '',
              name: stock.locationName ?? '',
              onHand: list.reduce((sum, c) => sum + (c.node.onHandQty ?? 0), 0),
              uom: stock.baseUom ?? '',
            }
          : null,
    });
  }

  // ---- Ports and paths (§4.5) ----
  const outgoing = new Map<string, TraceLink[]>();
  const incoming = new Map<string, TraceLink[]>();
  for (const l of links) {
    outgoing.set(l.from, [...(outgoing.get(l.from) ?? []), l]);
    incoming.set(l.to, [...(incoming.get(l.to) ?? []), l]);
  }
  const sourceY = new Map<string, number>();
  const targetY = new Map<string, number>();
  for (const card of cards.values()) {
    const outs = (outgoing.get(card.id) ?? []).sort(
      (a, b) => cards.get(a.to)!.y - cards.get(b.to)!.y,
    );
    for (const [id, y] of stackPorts(card, outs)) sourceY.set(id, y);
    const ins = (incoming.get(card.id) ?? []).sort(
      (a, b) => cards.get(a.from)!.y - cards.get(b.from)!.y,
    );
    for (const [id, y] of stackPorts(card, ins)) targetY.set(id, y);
  }
  for (const l of links) {
    const a = cards.get(l.from)!;
    const b = cards.get(l.to)!;
    const x1 = a.x + CARD_W;
    const x2 = b.x;
    const y1 = sourceY.get(l.id)!;
    const y2 = targetY.get(l.id)!;
    const mx = (x1 + x2) / 2;
    l.d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
    const t = l.type === 'material' ? 0.3 : 0.5;
    const [px, py] = bezier(t, [x1, y1], [mx, y1], [mx, y2], [x2, y2]);
    l.labelX = px;
    l.labelY = py - (isBand(l.type) ? l.width / 2 : 0) - 4;
    l.label =
      l.type === 'supplier'
        ? null
        : l.type === 'difference' && l.shippedQty != null
          ? `${formatQty(l.qty, null)} de ${formatQty(l.shippedQty, l.uom)}`
          : l.qty == null
            ? null
            : formatQty(l.qty, l.uom);
  }

  const height =
    Math.max(
      TOP + CARD_H,
      ...[...cards.values()].map((c) => c.y + CARD_H),
      ...groups.map((g) => g.y + g.height),
    ) + 16;
  return {
    lanes,
    cards: [...cards.values()],
    groups,
    links,
    width: Math.max(1, lanes.length) * LANE_WIDTH,
    height,
    cardOf,
  };

  /** §4.3 step 4: nobody closer than a step; a group reserves its header above its first card. */
  function place(list: TraceCard[], desired: Map<string, number | null> | null): void {
    let previous: TraceCard | null = null;
    for (const card of list) {
      let min = previous ? previous.y + STEP : TOP;
      const opens = card.groupId && card.groupId !== previous?.groupId;
      if (opens)
        min +=
          (card.groupId!.startsWith('op:') ? ORDER_HEADER : LOCATION_HEADER) +
          (previous ? GROUP_PAD : 0);
      else if (previous?.groupId && previous.groupId !== card.groupId) min += GROUP_PAD;
      const wanted = desired?.get(card.id);
      card.y = wanted == null ? min : Math.max(min, wanted);
      previous = card;
    }
  }
}

function laneKey(base: 'production' | 'lot', level: number): string {
  return level === 0 ? base : `${base}-${level}`;
}

function isBand(type: LinkType): boolean {
  return type === 'product' || type === 'difference';
}

/** §4.5: product band width by quantity. */
export function bandWidth(qty: number, maxQty: number): number {
  return Math.max(2.5, (12 * qty) / maxQty);
}

function linkType(edge: TraceEdge, from: TraceCard): LinkType {
  if (edge.kind === 'Supplied' || edge.kind === 'Created') return 'supplier';
  if (edge.kind === 'Received') return 'material';
  if (
    edge.kind === 'Consumed' &&
    (from.kind === 'receipt' || from.kind === 'rawLot' || from.kind === 'lot')
  )
    return 'material';
  if (edge.kind === 'Delivered' && edge.shippedQty != null && (edge.qty ?? 0) < edge.shippedQty)
    return 'difference';
  // RN-114: what the customer rejected is drawn like a difference.
  if (edge.kind === 'Rejected') return 'difference';
  return 'product';
}

/**
 * Stacked ports (Sankey): the links of one side of a card, already sorted by the position of their other end, centred on
 * the middle of the card, each with its width and 3 px between bands (5 px between thin lines).
 */
export function stackPorts(
  card: { y: number },
  links: readonly { id: string; width: number }[],
): Map<string, number> {
  const gaps = links.slice(1).map((l, i) => (l.width <= THIN && links[i].width <= THIN ? 5 : 3));
  const total = links.reduce((sum, l) => sum + l.width, 0) + gaps.reduce((sum, g) => sum + g, 0);
  let cursor = card.y + CARD_H / 2 - total / 2;
  const result = new Map<string, number>();
  links.forEach((l, i) => {
    result.set(l.id, cursor + l.width / 2);
    cursor += l.width + (gaps[i] ?? 0);
  });
  return result;
}

/**
 * Production level of each close and lot: 0 for the closes whose lot no other close of the graph consumed, N + 1 for the
 * closes that fed a close of level N (semi-finished goods, RN-103).
 */
export function closeLevels(graph: TraceGraph): {
  close: Map<string, number>;
  lot: Map<string, number>;
} {
  const producedBy = new Map<string, string>(); // lot node → close node
  const consumers = new Map<string, string[]>(); // lotId → closes that consumed it
  const lotNodeOf = new Map(
    graph.nodes.filter((n) => n.type === 'Lot').map((n) => [n.lotId!, n.id]),
  );
  const stockLot = new Map(
    graph.nodes.filter((n) => n.type === 'Stock').map((n) => [n.id, n.lotId!]),
  );
  for (const e of graph.edges) {
    if (e.kind === 'Produced') producedBy.set(e.to, e.from);
    if (e.kind === 'Consumed') {
      const lot = stockLot.get(e.from);
      if (lot) consumers.set(lot, [...(consumers.get(lot) ?? []), e.to]);
    }
  }
  const outputOf = new Map<string, string>(); // close → lotId
  for (const [lotNode, close] of producedBy) {
    const lotId = graph.nodes.find((n) => n.id === lotNode)?.lotId;
    if (lotId) outputOf.set(close, lotId);
  }
  const close = new Map<string, number>();
  const visiting = new Set<string>();
  const levelOf = (id: string): number => {
    if (close.has(id)) return close.get(id)!;
    if (visiting.has(id)) return 0; // a cycle is not followed twice
    visiting.add(id);
    const lot = outputOf.get(id);
    const next = (lot ? (consumers.get(lot) ?? []) : []).filter((c) => c !== id);
    const level = next.length === 0 ? 0 : 1 + Math.max(...next.map(levelOf));
    visiting.delete(id);
    close.set(id, level);
    return level;
  };
  for (const n of graph.nodes) if (n.type === 'ProductionClose') levelOf(n.id);
  const lot = new Map<string, number>();
  for (const [lotId, nodeId] of lotNodeOf) {
    const producer = producedBy.get(nodeId);
    if (producer) lot.set(nodeId, close.get(producer) ?? 0);
    else {
      const used = consumers.get(lotId) ?? [];
      lot.set(nodeId, used.length === 0 ? 0 : 1 + Math.max(...used.map((c) => close.get(c) ?? 0)));
    }
  }
  return { close, lot };
}

function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
}

function compareDate(a: TraceCard, b: TraceCard): number {
  return (a.date ?? '').localeCompare(b.date ?? '');
}

function folio(card: TraceCard): string {
  return card.node.folio ?? card.node.lotNumber ?? card.node.label;
}

function bezier(
  t: number,
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
): [number, number] {
  const u = 1 - t;
  const f = (i: 0 | 1) =>
    u * u * u * p0[i] + 3 * u * u * t * p1[i] + 3 * u * t * t * p2[i] + t * t * t * p3[i];
  return [f(0), f(1)];
}
