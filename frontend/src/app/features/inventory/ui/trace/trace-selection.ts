import type { TraceDirection } from '../../data-access/traceability-api';
import type { TraceCard, TraceLayout, TraceLink } from './trace-layout';

export interface TraceChain {
  cards: ReadonlySet<string>;
  links: ReadonlySet<string>;
}

/**
 * The chain of the selected cards (trazabilidad-ui §5.2): their ancestors going back, their descendants going forward or
 * both. Branches do not mix: a sibling of the selection (another child of one of its parents) is not part of it.
 */
export function traceChain(
  layout: Pick<TraceLayout, 'links'>,
  seeds: readonly string[],
  direction: TraceDirection,
): TraceChain {
  const cards = new Set(seeds);
  const links = new Set<string>();
  const walk = (forward: boolean) => {
    const reached = new Set(seeds);
    const queue = [...seeds];
    while (queue.length > 0) {
      const id = queue.shift()!;
      for (const link of layout.links) {
        const [from, to] = forward ? [link.from, link.to] : [link.to, link.from];
        if (from !== id) continue;
        links.add(link.id);
        if (!reached.has(to)) {
          reached.add(to);
          cards.add(to);
          queue.push(to);
        }
      }
    }
  };
  if (direction !== 'Forward') walk(false);
  if (direction !== 'Backward') walk(true);
  return { cards, links };
}

export interface SelectionSummary {
  suppliers: number;
  purchaseOrders: number;
  rawLots: number;
  closes: number;
  finishedLots: number;
  transfers: number;
  branches: string[];
  /** Sum of the highlighted links that leave a stock towards a transfer. */
  shippedQty: number;
  shippedUom: string | null;
}

/** What the selection reaches, for the selection bar (§5.3). */
export function summarizeChain(
  layout: Pick<TraceLayout, 'cards' | 'links'>,
  chain: TraceChain,
): SelectionSummary {
  const cards = layout.cards.filter((c) => chain.cards.has(c.id));
  const of = (...kinds: TraceCard['kind'][]) => cards.filter((c) => kinds.includes(c.kind));
  const shipped = layout.links.filter(
    (l) => chain.links.has(l.id) && l.edges.some((e) => e.kind === 'Dispatched'),
  );
  return {
    suppliers: of('supplier', 'origin').length,
    purchaseOrders: new Set(of('receipt').map((c) => c.node.purchaseOrderId)).size,
    rawLots: of('receipt').filter((c) => c.lot).length + of('rawLot').length,
    closes: of('close').length,
    finishedLots: of('lot').length,
    transfers: of('transfer').length,
    branches: [...new Set(of('branch').map((c) => c.node.locationCode ?? ''))].sort(),
    shippedQty: shipped.reduce((sum, l) => sum + (l.qty ?? 0), 0),
    shippedUom: shipped[0]?.uom ?? null,
  };
}

/** Arrow keys over the map (§5.4): ← first parent, → first child, ↑/↓ previous and next card of the lane. */
export function neighbour(
  layout: Pick<TraceLayout, 'cards' | 'links'>,
  cardId: string,
  key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown',
): string | null {
  const card = layout.cards.find((c) => c.id === cardId);
  if (!card) return null;
  const byY = (ids: string[]) =>
    ids
      .map((id) => layout.cards.find((c) => c.id === id)!)
      .sort((a, b) => a.y - b.y)
      .map((c) => c.id);
  if (key === 'ArrowLeft')
    return byY(layout.links.filter((l) => l.to === cardId).map((l) => l.from))[0] ?? null;
  if (key === 'ArrowRight')
    return byY(layout.links.filter((l) => l.from === cardId).map((l) => l.to))[0] ?? null;
  const lane = layout.cards.filter((c) => c.lane === card.lane).sort((a, b) => a.y - b.y);
  const index = lane.indexOf(card) + (key === 'ArrowUp' ? -1 : 1);
  return lane[index]?.id ?? null;
}

/** Opacity of a card or a link in each state (§4.7). */
export function cardOpacity(
  id: string,
  hover: TraceChain | null,
  selected: TraceChain | null,
): number {
  if (selected) return selected.cards.has(id) ? 1 : 0.28;
  if (hover) return hover.cards.has(id) ? 1 : 0.6;
  return 1;
}

export function linkOpacity(
  link: TraceLink,
  hover: TraceChain | null,
  selected: TraceChain | null,
): number {
  const band = link.type === 'product' || link.type === 'difference';
  const rest = band ? 0.5 : 1;
  if (selected) return selected.links.has(link.id) ? (band ? 0.85 : 1) : 0.1;
  if (hover) return hover.links.has(link.id) ? (band ? 0.85 : 1) : 0.22;
  return rest;
}
