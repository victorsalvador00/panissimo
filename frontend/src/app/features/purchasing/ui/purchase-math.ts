/**
 * Amounts of a purchase order exactly as the backend computes them (`PurchaseOrderMath`): cents rounded half away from
 * zero, the line's VAT on its rounded subtotal, and the totals as sums of the rounded lines.
 */
export function money(value: number): number {
  // toPrecision(15) removes the binary noise of the product (2.675 * 100 = 267.49999...) before rounding.
  const cents = Math.round(Number((Math.abs(value) * 100).toPrecision(15)));
  return (Math.sign(value) * cents) / 100;
}

export function lineSubtotal(quantity: number, unitPrice: number): number {
  return money(quantity * unitPrice);
}

export function lineTax(quantity: number, unitPrice: number, taxRate: number): number {
  return money(lineSubtotal(quantity, unitPrice) * taxRate);
}

export function orderTotals(
  lines: readonly { quantity: number; unitPrice: number; taxRate: number }[],
): { subtotal: number; tax: number; total: number } {
  const subtotal = money(lines.reduce((sum, l) => sum + lineSubtotal(l.quantity, l.unitPrice), 0));
  const tax = money(lines.reduce((sum, l) => sum + lineTax(l.quantity, l.unitPrice, l.taxRate), 0));
  return { subtotal, tax, total: money(subtotal + tax) };
}
