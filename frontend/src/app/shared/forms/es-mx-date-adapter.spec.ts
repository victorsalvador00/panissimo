import { TestBed } from '@angular/core/testing';
import { DateAdapter } from '@angular/material/core';
import { MatDatepickerIntl } from '@angular/material/datepicker';
import { ES_MX_DATE_FORMATS, provideEsMxDates } from './es-mx-date-adapter';

describe('EsMxDateAdapter', () => {
  let adapter: DateAdapter<Date>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideEsMxDates()] });
    adapter = TestBed.inject(DateAdapter);
  });

  it('reads day first', () => {
    const date = adapter.parse('05/03/2026', 'dd/MM/yyyy');
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(2);
    expect(date?.getDate()).toBe(5);
  });

  it('rejects impossible dates and accepts an empty field', () => {
    expect(adapter.isValid(adapter.parse('31/02/2026', '') as Date)).toBe(false);
    expect(adapter.isValid(adapter.parse('hoy', '') as Date)).toBe(false);
    expect(adapter.parse('', '')).toBeNull();
  });

  it('writes dd/MM/yyyy', () => {
    expect(adapter.format(new Date(2026, 9, 7), ES_MX_DATE_FORMATS.display.dateInput)).toBe(
      '07/10/2026',
    );
  });
});

describe('EsMxDatepickerIntl', () => {
  it('announces the date picker in Spanish', () => {
    TestBed.configureTestingModule({ providers: provideEsMxDates() });
    const intl = TestBed.inject(MatDatepickerIntl);
    expect(intl.openCalendarLabel).toBe('Abrir el calendario');
    expect(intl.nextMonthLabel).toBe('Mes siguiente');
  });
});
