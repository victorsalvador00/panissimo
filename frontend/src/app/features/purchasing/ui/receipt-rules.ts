/** What a line of a goods receipt may still take (RN-32). */
export interface ReceivableLine {
  quantity: number;
  receivedQty: number;
  pendingQty: number;
  /** Ordered quantity plus the receipt tolerance (`purchasing.receipt_tolerance_pct`). */
  maxReceivableQty: number;
}

export type ReceiptCheck = 'ok' | 'over' | 'exceeds';

function round(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/** Most this receipt may bring of the line: the ordered quantity with its tolerance, minus what already arrived. */
export function receivableNow(line: ReceivableLine): number {
  return Math.max(0, round(line.maxReceivableQty - line.receivedQty));
}

/**
 * RN-32: up to what is pending is normal; above it a warning (over-receiving is allowed up to the tolerance); above
 * the tolerance it is not accepted.
 */
export function checkReceipt(line: ReceivableLine, total: number): ReceiptCheck {
  if (total > receivableNow(line)) return 'exceeds';
  if (total > line.pendingQty) return 'over';
  return 'ok';
}

/** Sum of the lots of a line, with the 4 decimals of the API. */
export function receiptTotal(quantities: readonly (number | null)[]): number {
  return round(quantities.reduce<number>((sum, q) => sum + (q ?? 0), 0));
}
