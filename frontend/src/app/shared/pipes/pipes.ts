import { Pipe, PipeTransform } from '@angular/core';
import type { ApiEnum } from '../../core/api/api';
import { EnumName, enumLabel } from './labels';

const quantityFormats = new Map<number, Intl.NumberFormat>();
const currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

/**
 * Quantity in es-MX with up to 4 decimals and no trailing zeros, with its unit: `12.5 kg`, `3,200 pza` (frontend §4.2).
 * Pieces never show decimals (RN-03b).
 */
export function formatQty(
  value: number | null | undefined,
  unit?: string | null,
  decimals = 4,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  const digits = unit === 'pza' ? 0 : decimals;
  let format = quantityFormats.get(digits);
  if (!format) {
    format = new Intl.NumberFormat('es-MX', { maximumFractionDigits: digits });
    quantityFormats.set(digits, format);
  }
  const text = format.format(value);
  return unit ? `${text} ${unit}` : text;
}

const unitCurrencies = new Map<number, Intl.NumberFormat>();

/**
 * Pesos: `$1,234.56`. With `maxDecimals` > 2 (unit costs), up to that many decimals without trailing zeros:
 * `$0.045`, `$1.3214`.
 */
export function formatMxn(value: number | null | undefined, maxDecimals = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  if (maxDecimals <= 2) return currency.format(value);
  let format = unitCurrencies.get(maxDecimals);
  if (!format) {
    format = new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 2,
      maximumFractionDigits: maxDecimals,
    });
    unitCurrencies.set(maxDecimals, format);
  }
  return format.format(value);
}

/** `{{ line.qty | qty: line.unit }}` */
@Pipe({ name: 'qty' })
export class QtyPipe implements PipeTransform {
  transform(value: number | null | undefined, unit?: string | null, decimals?: number): string {
    return formatQty(value, unit, decimals);
  }
}

/** `{{ order.total | mxn }}` */
@Pipe({ name: 'mxn' })
export class MxnPipe implements PipeTransform {
  transform(value: number | null | undefined, maxDecimals?: number): string {
    return formatMxn(value, maxDecimals);
  }
}

/** `{{ transfer.status | statusLabel: 'TransferStatus' }}`: the Spanish label of any API enum. */
@Pipe({ name: 'statusLabel' })
export class StatusLabelPipe implements PipeTransform {
  transform<K extends EnumName>(value: ApiEnum<K> | null | undefined, kind: K): string {
    return enumLabel(kind, value);
  }
}
