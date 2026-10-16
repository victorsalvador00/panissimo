import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { LocationContextService } from '../../context/location-context.service';
import { provideAppDates } from '../../i18n/date-adapter';
import { HelpButton } from '../../help/help-button';
import { THEME_OPTIONS, ThemeService } from '../../theme/theme.service';
import { filterMenu, MENU } from '../menu';

/** Estructura base: barra superior, menú lateral filtrado por permisos y contenido. */
@Component({
  selector: 'app-shell',
  imports: [
    HelpButton,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatSidenavModule,
    MatListModule,
    MatMenuModule,
    MatDividerModule,
    MatFormFieldModule,
    MatSelectModule,
    MatTooltipModule,
  ],
  // Fechas dd/MM/yyyy para todas las pantallas (aquí y no en app.config: no pesa en el arranque).
  providers: [provideAppDates()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  protected readonly auth = inject(AuthService);
  protected readonly locationContext = inject(LocationContextService);
  protected readonly theme = inject(ThemeService);
  protected readonly themeOptions = THEME_OPTIONS;

  protected readonly isMobile = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 767.98px)')
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );
  private readonly mobileMenuOpen = signal(false);
  protected readonly menuOpened = computed(() => !this.isMobile() || this.mobileMenuOpen());
  /** En escritorio el menú se reduce a íconos; se recuerda entre sesiones. */
  protected readonly collapsed = signal(readCollapsed());
  protected readonly showCollapsed = computed(() => this.collapsed() && !this.isMobile());

  protected readonly menu = computed(() => filterMenu(MENU, (p) => this.auth.can(p)));

  protected toggleMenu(): void {
    if (this.isMobile()) {
      this.mobileMenuOpen.update((open) => !open);
      return;
    }
    this.collapsed.update((collapsed) => !collapsed);
    try {
      localStorage.setItem(COLLAPSED_KEY, String(this.collapsed()));
    } catch {
      // Sin almacenamiento: el estado dura lo que dure la pestaña.
    }
  }

  protected closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  protected logout(): void {
    this.auth.logout();
  }
}

const COLLAPSED_KEY = 'sgo.sidebarCollapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}
