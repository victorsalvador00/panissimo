import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { LocationContextService } from '../context/location-context.service';
import { ThemeMenu } from '../theme/theme-menu';
import { visibleNavigation } from './navigation';

/**
 * App shell: top bar (brand, active location, user menu with profile, theme and sign out) and the menu filtered by
 * permissions. F-03 gives it the final design (tag sidebar, collapse, breadcrumbs).
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
    MatListModule,
    MatSelectModule,
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
      .observe('(max-width: 959.98px)')
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );

  protected logout(): void {
    void this.auth.logout();
  }
}
