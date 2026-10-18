import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { LocationContextService } from '../context/location-context.service';
import { ThemeMenu } from '../theme/theme-menu';
import { visibleNavigation } from './navigation';

const collapsedKey = 'pan.sidebar';

/**
 * App shell (frontend §4.1): top bar (menu button, brand, active location, user menu with profile, theme and sign
 * out) and the sidebar with the menu filtered by permissions. The sidebar collapses on desktop (remembered per
 * device) and is a drawer on phones.
 */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatDividerModule,
    MatSidenavModule,
    MatSelectModule,
    MatTooltipModule,
    ThemeMenu,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  private readonly auth = inject(AuthService);
  protected readonly context = inject(LocationContextService);

  protected readonly user = this.auth.user;
  protected readonly navigation = computed(() => visibleNavigation((p) => this.auth.can(p)));
  protected readonly isHandset = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 767.98px)')
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );
  protected readonly collapsed = signal(readCollapsed());
  /** Collapsed only applies on desktop; the phone drawer always shows the labels. */
  protected readonly showCollapsed = computed(() => this.collapsed() && !this.isHandset());

  protected toggleMenu(drawer: MatSidenav): void {
    if (this.isHandset()) {
      void drawer.toggle();
      return;
    }
    const collapsed = !this.collapsed();
    this.collapsed.set(collapsed);
    try {
      if (collapsed) localStorage.setItem(collapsedKey, 'collapsed');
      else localStorage.removeItem(collapsedKey);
    } catch {
      // Without storage the state lasts for this session.
    }
  }

  protected closeOnPhone(drawer: MatSidenav): void {
    if (this.isHandset()) void drawer.close();
  }

  protected logout(): void {
    void this.auth.logout();
  }
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(collapsedKey) === 'collapsed';
  } catch {
    return false;
  }
}
