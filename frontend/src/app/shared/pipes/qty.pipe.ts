import { formatNumber } from '@angular/common';
import { inject, LOCALE_ID, Pipe, PipeTransform } from '@angular/core';

/** Cantidades se guardan con 4 decimales (numeric(18,4)). */
export const QTY_MAX_DECIMALS = 4;

/** Cantidad con hasta 4 decimales, sin ceros sobrantes, y la unidad al lado: `12.5 kg`. */
export function formatQty(
  value: number | null | undefined,
  locale: string,
  unit?: string | null,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '';
  }
  const text = formatNumber(value, locale, `1.0-${QTY_MAX_DECIMALS}`);
  return unit ? `${text} ${unit}` : text;
}

@Pipe({ name: 'qty' })
export class QtyPipe implements PipeTransform {
  private readonly locale = inject(LOCALE_ID);

  transform(value: number | null | undefined, unit?: string | null): string {
    return formatQty(value, this.locale, unit);
  }
}
