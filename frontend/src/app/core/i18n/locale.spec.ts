import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideAppLocale } from './locale';
import { SpanishPaginatorIntl } from './spanish-paginator-intl';

describe('provideAppLocale', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideAppLocale(), CurrencyPipe, DatePipe, DecimalPipe],
    });
  });

  it('formatea moneda en pesos como $1,234.56', () => {
    expect(TestBed.inject(CurrencyPipe).transform(1234.56)).toBe('$1,234.56');
  });

  it('formatea fechas como dd/MM/yyyy HH:mm', () => {
    const date = new Date(2026, 8, 5, 14, 7);
    expect(TestBed.inject(DatePipe).transform(date, 'dd/MM/yyyy HH:mm')).toBe('05/09/2026 14:07');
  });

  it('usa coma para miles y punto para decimales', () => {
    expect(TestBed.inject(DecimalPipe).transform(12345.5, '1.0-4')).toBe('12,345.5');
  });

  it('traduce el paginador al español', () => {
    const intl = new SpanishPaginatorIntl();
    expect(intl.itemsPerPageLabel).toBe('Registros por página');
    expect(intl.getRangeLabel(1, 20, 45)).toBe('21 – 40 de 45');
    expect(intl.getRangeLabel(0, 20, 0)).toBe('0 de 0');
  });
});
