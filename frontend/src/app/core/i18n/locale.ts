import { registerLocaleData } from '@angular/common';
import localeEsMx from '@angular/common/locales/es-MX';
import {
  DEFAULT_CURRENCY_CODE,
  EnvironmentProviders,
  LOCALE_ID,
  makeEnvironmentProviders,
} from '@angular/core';

export const APP_LOCALE = 'es-MX';

registerLocaleData(localeEsMx, APP_LOCALE);

/**
 * Locale es-MX para los pipes de Angular (moneda MXN). La traducción del paginador de Material
 * (`SpanishPaginatorIntl`) la provee `app-data-table` para no cargarlo en el arranque.
 */
export function provideAppLocale(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: LOCALE_ID, useValue: APP_LOCALE },
    { provide: DEFAULT_CURRENCY_CODE, useValue: 'MXN' },
  ]);
}
