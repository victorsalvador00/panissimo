import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterOutlet } from '@angular/router';
import { ThemeMode, ThemeService } from '../theme/theme.service';

interface ThemeOption {
  mode: ThemeMode;
  label: string;
  icon: string;
}

/**
 * App shell: top bar with the brand and the theme menu, and the routed page. F-03 adds the sidebar, the active
 * location, the user menu and the breadcrumbs.
 */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, MatToolbarModule, MatButtonModule, MatIconModule, MatMenuModule],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  protected readonly theme = inject(ThemeService);

  protected readonly options: ThemeOption[] = [
    { mode: 'light', label: 'Claro', icon: 'light_mode' },
    { mode: 'dark', label: 'Oscuro', icon: 'dark_mode' },
    { mode: 'system', label: 'Según el sistema', icon: 'contrast' },
  ];

  protected readonly themeIcon = computed(() => (this.theme.isDark() ? 'dark_mode' : 'light_mode'));
}
