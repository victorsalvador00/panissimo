import { formatCurrency } from '@angular/common';
import { inject, LOCALE_ID, Pipe, PipeTransform } from '@angular/core';

/** Pesos mexicanos con 2 decimales: `$1,234.56`. `digits` permite más decimales (costos unitarios). */
export function formatMxn(
  value: number | null | undefined,
  locale: string,
  digits = '1.2-2',
): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '';
  }
  return formatCurrency(value, locale, '$', 'MXN', digits);
}

@Pipe({ name: 'mxn' })
export class MxnPipe implements PipeTransform {
  private readonly locale = inject(LOCALE_ID);

  transform(value: number | null | undefined, digits?: string): string {
    return formatMxn(value, this.locale, digits);
  }
}
