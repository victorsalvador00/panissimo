import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { provideRouter, TitleStrategy, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { AuthService } from './core/auth/auth.service';
import { apiBaseInterceptor } from './core/http/api-base.interceptor';
import { errorInterceptor } from './core/http/error.interceptor';
import { provideAppLocale } from './core/i18n/locale';
import { AppTitleStrategy } from './core/layout/app-title-strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    // Orden: la URL base primero; el de errores es el más interno, así ve la respuesta final
    // de cada intento y no avisa de los 401 que `authInterceptor` resuelve con un refresh.
    provideHttpClient(
      withFetch(),
      withInterceptors([apiBaseInterceptor, authInterceptor, errorInterceptor]),
    ),
    provideAppLocale(),
    { provide: TitleStrategy, useClass: AppTitleStrategy },
    // Íconos: Material Symbols (empaquetados localmente) en lugar de Material Icons.
    provideAppInitializer(() => {
      inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-outlined');
    }),
    // Recupera la sesión con la cookie de refresh antes de la primera navegación (F5).
    provideAppInitializer(() => inject(AuthService).restoreSession()),
  ],
};
