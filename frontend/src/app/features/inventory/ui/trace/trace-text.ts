import { formatQty } from '../../../../shared/pipes/pipes';
import type { TraceCard, TraceLayout } from './trace-layout';

/** RN-07: default of `inventory.expiry_alert_days` (the graph does not carry the setting). */
export const EXPIRY_ALERT_DAYS = 3;

export type TagTone = 'green' | 'orange' | 'lot' | 'grey';

export interface CardText {
  icon: string;
  header: string;
  tag: string | null;
  tone: TagTone | null;
  title: string;
  figure: string;
  secondary: string;
}

export const CARD_ICONS: Readonly<Record<TraceCard['kind'], { icon: string }>> = {
  supplier: { icon: 'storefront' },
  origin: { icon: 'inventory' },
  receipt: { icon: 'receipt_long' },
  rawLot: { icon: 'sell' },
  close: { icon: 'factory' },
  lot: { icon: 'sell' },
  stock: { icon: 'inventory_2' },
  transfer: { icon: 'local_shipping' },
  shipment: { icon: 'local_shipping' },
  branch: { icon: 'store' },
  customer: { icon: 'person' },
  rejection: { icon: 'move_to_inbox' },
};

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function parts(value: string): Record<string, string> {
  const formatter = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: 'numeric',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return Object.fromEntries(formatter.formatToParts(new Date(value)).map((p) => [p.type, p.value]));
}

/** `21-oct 05:40` (trazabilidad-ui §3, in the plant's time zone). */
export function shortDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const p = parts(value);
  return `${p['day']}-${MONTHS[Number(p['month']) - 1]} ${p['hour']}:${p['minute']}`;
}

/** `05:40`. */
export function shortTime(value: string | null | undefined): string {
  if (!value) return '';
  const p = parts(value);
  return `${p['hour']}:${p['minute']}`;
}

/** `22-oct-2026` from a date (`yyyy-MM-dd`) or a moment. */
export function shortDate(value: string | null | undefined): string {
  if (!value) return '';
  const [y, m, d] = value.slice(0, 10).split('-');
  return `${d}-${MONTHS[Number(m) - 1]}-${y}`;
}

/** Whole days from `asOf` to the expiration date (negative when expired). */
export function daysTo(expiration: string | null | undefined, asOf: string): number | null {
  if (!expiration) return null;
  const [y, m, d] = expiration.slice(0, 10).split('-').map(Number);
  const end = Date.UTC(y, m - 1, d);
  const p = parts(asOf);
  const start = Date.UTC(Number(p['year']), Number(p['month']) - 1, Number(p['day']));
  return Math.round((end - start) / 86_400_000);
}

export function minutesBetween(
  from: string | null | undefined,
  to: string | null | undefined,
): number | null {
  if (!from || !to) return null;
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000);
}

/** The four rows of a card (trazabilidad-ui §4.6): header with an optional tag, title, figure and a secondary line. */
export function cardText(
  card: TraceCard,
  layout: Pick<TraceLayout, 'cards' | 'links'>,
  asOf: string,
): CardText {
  const n = card.node;
  const ins = layout.links.filter((l) => l.to === card.id);
  const outs = layout.links.filter((l) => l.from === card.id);
  const sum = (links: typeof ins) => links.reduce((total, l) => total + (l.qty ?? 0), 0);
  const uom = n.baseUom ?? ins[0]?.uom ?? outs[0]?.uom ?? null;
  const base = { icon: CARD_ICONS[card.kind].icon, tag: null, tone: null } as const;
  switch (card.kind) {
    case 'supplier': {
      const receipts = outs.map((l) => layout.cards.find((c) => c.id === l.to)!);
      const orders = new Set(receipts.map((c) => c.node.purchaseOrderId)).size;
      return {
        ...base,
        header: n.taxId ?? 'Proveedor',
        title: n.label,
        figure: orders === 1 ? '1 OC recibida' : `${orders} OC recibidas`,
        secondary: [...new Set(receipts.map((c) => c.node.itemName ?? c.node.sku))].join(', '),
      };
    }
    case 'origin':
      return {
        ...base,
        header: 'Existencia inicial',
        title: n.folio ?? n.label,
        figure: formatQty(sum(outs), outs[0]?.uom),
        secondary: shortDateTime(n.postedAt),
      };
    case 'receipt': {
      const lot = card.lot;
      return {
        ...base,
        header: n.itemName ?? n.sku ?? '',
        title: n.purchaseOrderFolio ?? n.label,
        figure: `${formatQty(sum(outs.filter((l) => l.type === 'material')), lot?.baseUom ?? uom)} usados`,
        secondary: [
          lot ? `Lote ${lot.lotNumber}` : null,
          n.receivedAt ? `rec. ${shortDate(n.receivedAt).slice(0, 6)}` : null,
        ]
          .filter(Boolean)
          .join(' · '),
      };
    }
    case 'rawLot':
      return {
        ...base,
        header: n.itemName ?? n.sku ?? 'Lote de materia prima',
        title: n.lotNumber ?? n.label,
        figure: `${formatQty(sum(outs.filter((l) => l.type === 'material')), uom)} usados`,
        secondary: n.expirationDate ? `Caduca ${shortDate(n.expirationDate)}` : '',
      };
    case 'close':
      return {
        ...base,
        header: `Cierre · #${n.sequence ?? ''}`,
        tag: n.kind === 'Final' ? 'Final' : 'Parcial',
        tone: 'green',
        title: n.folio ?? n.label,
        figure: formatQty(n.producedQty, uom),
        secondary: shortDateTime(n.closedAt),
      };
    case 'lot': {
      const days = daysTo(n.expirationDate, asOf);
      return {
        ...base,
        header: n.itemType === 'SemiFinished' ? 'Lote semiterminado' : 'Lote terminado',
        tag: days === null ? null : days < 0 ? 'Caducado' : days === 1 ? '1 día' : `${days} días`,
        tone: days === null ? null : days <= EXPIRY_ALERT_DAYS ? 'orange' : 'lot',
        title: n.lotNumber ?? n.label,
        // Going forward only the close is not in the graph: what entered the plant tells how much was produced.
        figure: formatQty(
          sum(ins) || sum(outs.filter((l) => l.edges.some((e) => e.kind === 'Entered'))),
          uom,
        ),
        secondary: n.expirationDate ? `Caduca ${shortDate(n.expirationDate)}` : (n.itemName ?? ''),
      };
    }
    case 'stock': {
      const exits = outs.length;
      return {
        ...base,
        header: 'Existencia del lote',
        title: n.lotNumber ?? n.label,
        figure: `${formatQty(n.onHandQty, uom)} de saldo`,
        secondary: exits === 1 ? '1 salida' : `${exits} salidas`,
      };
    }
    case 'transfer': {
      const shipped = sum(ins);
      const received = sum(outs);
      const delivered =
        n.transferStatus === 'Received' || n.transferStatus === 'ReceivedWithDiscrepancies';
      const minutes = minutesBetween(n.dispatchedAt, n.deliveredAt);
      return {
        ...base,
        header: `${n.fromLocationCode ?? ''} → ${n.toLocationCode ?? ''}`,
        tag: delivered ? (received < shipped ? 'Diferencia' : 'Recibido') : 'En tránsito',
        tone: delivered ? (received < shipped ? 'orange' : 'green') : 'grey',
        title: n.folio ?? n.label,
        figure: `${formatQty(shipped, uom)} enviadas`,
        secondary: [
          n.dispatchedAt ? `Sale ${shortTime(n.dispatchedAt)}` : null,
          minutes === null ? null : `${minutes} min`,
        ]
          .filter(Boolean)
          .join(' · '),
      };
    }
    case 'branch': {
      const received = sum(ins);
      const shipped = ins.reduce((total, l) => total + (l.shippedQty ?? l.qty ?? 0), 0);
      const short = shipped - received;
      const from = ins
        .map((l) => layout.cards.find((c) => c.id === l.from)?.node)
        .find((x) => x?.deliveredAt);
      return {
        ...base,
        header: n.locationName ?? 'Sucursal',
        tag: ins.length === 0 ? null : short > 0 ? `−${formatQty(short, null)}` : 'Completo',
        tone: ins.length === 0 ? null : short > 0 ? 'orange' : 'green',
        title: n.locationCode ?? n.label,
        figure:
          ins.length === 0
            ? `${formatQty(n.onHandQty, uom)} de saldo`
            : short > 0
              ? `${formatQty(received, null)} de ${formatQty(shipped, uom)}`
              : formatQty(received, uom),
        secondary: from
          ? `Recibió ${shortTime(from.deliveredAt)} · ${n.lotNumber}`
          : (n.lotNumber ?? ''),
      };
    }
    case 'shipment':
      return {
        ...base,
        header: n.customerName ?? 'Remisión',
        // RN-114: delivered as dispatched, or with something rejected.
        tag:
          n.shipmentStatus === 'Delivered'
            ? 'Entregada'
            : n.shipmentStatus === 'DeliveredWithDiscrepancies'
              ? 'Con rechazo'
              : null,
        tone:
          n.shipmentStatus === 'Delivered'
            ? 'green'
            : n.shipmentStatus === 'DeliveredWithDiscrepancies'
              ? 'orange'
              : null,
        title: n.folio ?? n.label,
        figure: formatQty(sum(ins), uom),
        secondary: shortDateTime(n.dispatchedAt),
      };
    case 'customer':
      return {
        ...base,
        header: 'Cliente',
        title: n.customerName ?? n.label,
        figure: formatQty(sum(ins), ins[0]?.uom),
        secondary: n.customerCode ?? '',
      };
    case 'rejection': {
      const returned = n.returnedQty ?? 0;
      const lost = n.lostQty ?? 0;
      return {
        ...base,
        header: 'Rechazo del cliente',
        tag: returned > 0 ? 'Regresó' : 'Merma',
        tone: 'orange',
        title: n.folio ?? n.label,
        figure: `${formatQty(returned + lost, uom)} rechazadas`,
        secondary: [
          returned > 0
            ? `${formatQty(returned, uom)} a ${n.returnLocationCodes ?? 'la Planta'}`
            : null,
          lost > 0 ? `${formatQty(lost, uom)} merma` : null,
        ]
          .filter(Boolean)
          .join(' · '),
      };
    }
  }
}
