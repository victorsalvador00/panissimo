import { Injectable, Provider } from '@angular/core';
import { MatDatepickerIntl } from '@angular/material/datepicker';
import {
  DateAdapter,
  MAT_DATE_FORMATS,
  MAT_DATE_LOCALE,
  MatDateFormats,
  NativeDateAdapter,
} from '@angular/material/core';

/** Dates as `dd/MM/yyyy` (frontend §4.2): the datepicker reads and writes day first. */
@Injectable()
export class EsMxDateAdapter extends NativeDateAdapter {
  override parse(value: unknown): Date | null {
    if (typeof value === 'string') {
      const match = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(value);
      if (!match) return value.trim() ? this.invalid() : null;
      const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
      const date = new Date(year, month - 1, day);
      return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
        ? date
        : this.invalid();
    }
    return super.parse(value);
  }

  override format(date: Date, displayFormat: object): string {
    if (displayFormat === ES_MX_DATE_FORMATS.display.dateInput) {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
    }
    return super.format(date, displayFormat);
  }
}

export const ES_MX_DATE_FORMATS: MatDateFormats = {
  parse: { dateInput: 'dd/MM/yyyy' },
  display: {
    dateInput: { day: '2-digit', month: '2-digit', year: 'numeric' },
    monthYearLabel: { year: 'numeric', month: 'short' },
    dateA11yLabel: { year: 'numeric', month: 'long', day: 'numeric' },
    monthYearA11yLabel: { year: 'numeric', month: 'long' },
  },
};

/** Texts of the date picker that screen readers announce ("Open calendar"…), in Spanish. */
@Injectable()
export class EsMxDatepickerIntl extends MatDatepickerIntl {
  override calendarLabel = 'Calendario';
  override openCalendarLabel = 'Abrir el calendario';
  override closeCalendarLabel = 'Cerrar el calendario';
  override prevMonthLabel = 'Mes anterior';
  override nextMonthLabel = 'Mes siguiente';
  override prevYearLabel = 'Año anterior';
  override nextYearLabel = 'Año siguiente';
  override prevMultiYearLabel = 'Años anteriores';
  override nextMultiYearLabel = 'Años siguientes';
  override switchToMonthViewLabel = 'Elegir día';
  override switchToMultiYearViewLabel = 'Elegir mes y año';
  override startDateLabel = 'Fecha inicial';
  override endDateLabel = 'Fecha final';
  override comparisonDateLabel = 'Fecha de comparación';
}

export function provideEsMxDates(): Provider[] {
  return [
    { provide: MAT_DATE_LOCALE, useValue: 'es-MX' },
    { provide: DateAdapter, useClass: EsMxDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: ES_MX_DATE_FORMATS },
    { provide: MatDatepickerIntl, useClass: EsMxDatepickerIntl },
  ];
}
