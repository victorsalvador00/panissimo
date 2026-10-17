import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import localeEsMx from '@angular/common/locales/es-MX';
import {
  ApplicationConfig,
  LOCALE_ID,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { MAT_DATE_LOCALE } from '@angular/material/core';
import { MatIconRegistry } from '@angular/material/icon';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { AuthService } from './core/auth/auth.service';
import { apiBaseInterceptor } from './core/http/api-base.interceptor';
import { errorInterceptor } from './core/http/error.interceptor';
import { ThemeService } from './core/theme/theme.service';

// es-MX: $1,234.56 and dd/MM/yyyy (frontend §4.2).
registerLocaleData(localeEsMx);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    // Order: the URL gets its /api/v1 prefix, then the bearer; the notices see the final error.
    provideHttpClient(
      withFetch(),
      withInterceptors([apiBaseInterceptor, authInterceptor, errorInterceptor]),
    ),
    { provide: LOCALE_ID, useValue: 'es-MX' },
    { provide: MAT_DATE_LOCALE, useValue: 'es-MX' },
    provideAppInitializer(() => {
      // <mat-icon> uses the local Material Symbols subset (frontend §4.1).
      inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-outlined');
      // Starts following the system theme right away.
      inject(ThemeService);
      // The session survives F5: the refresh cookie gives a new access token before the first navigation.
      return inject(AuthService).restoreSession();
    }),
  ],
};
