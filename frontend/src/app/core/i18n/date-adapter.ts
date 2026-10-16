import { Injectable, Provider } from '@angular/core';
import {
  DateAdapter,
  MAT_DATE_FORMATS,
  MAT_DATE_LOCALE,
  MatDateFormats,
  NativeDateAdapter,
} from '@angular/material/core';
import { APP_LOCALE } from './locale';

/**
 * Fechas del selector en `dd/MM/yyyy` (spec frontend §4). Para mostrar basta Intl con es-MX, pero el
 * `NativeDateAdapter` interpreta lo tecleado con `Date.parse` (formato de EE. UU.); este lee día/mes/año.
 */
@Injectable()
export class EsMxDateAdapter extends NativeDateAdapter {
  override parse(value: unknown): Date | null {
    if (typeof value === 'string') {
      const match = /^\s*(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\s*$/.exec(value);
      if (!match) {
        return value.trim() ? this.invalid() : null;
      }
      const [, day, month, year] = match.map(Number);
      const date = new Date(year, month - 1, day);
      const valid =
        date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
      return valid ? date : this.invalid();
    }
    return super.parse(value);
  }

  override getFirstDayOfWeek(): number {
    return 1;
  }
}

const DATE_INPUT_FORMAT = { year: 'numeric', month: '2-digit', day: '2-digit' };

export const ES_MX_DATE_FORMATS: MatDateFormats = {
  parse: { dateInput: DATE_INPUT_FORMAT },
  display: {
    dateInput: DATE_INPUT_FORMAT,
    monthYearLabel: { year: 'numeric', month: 'short' },
    dateA11yLabel: { year: 'numeric', month: 'long', day: 'numeric' },
    monthYearA11yLabel: { year: 'numeric', month: 'long' },
  },
};

/** Para las pantallas o componentes con `mat-datepicker` (no se carga en el arranque). */
export function provideAppDates(): Provider[] {
  return [
    { provide: MAT_DATE_LOCALE, useValue: APP_LOCALE },
    { provide: DateAdapter, useClass: EsMxDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: ES_MX_DATE_FORMATS },
  ];
}
