import { ChangeDetectionStrategy, Component, inject, viewChild } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatMenu, MatMenuModule } from '@angular/material/menu';
import { ThemeMode, ThemeService } from './theme.service';

interface ThemeOption {
  mode: ThemeMode;
  label: string;
  icon: string;
}

/**
 * The three theme options as a menu, to open from any trigger:
 * `<app-theme-menu #theme />` and `[matMenuTriggerFor]="theme.menu()"` (login corner, user menu).
 */
@Component({
  selector: 'app-theme-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatMenuModule, MatIconModule],
  template: `
    <mat-menu #menu="matMenu">
      @for (option of options; track option.mode) {
        <button
          mat-menu-item
          role="menuitemradio"
          [attr.aria-checked]="theme.mode() === option.mode"
          [class.pan-menu-selected]="theme.mode() === option.mode"
          (click)="theme.setMode(option.mode)"
        >
          <mat-icon>{{ option.icon }}</mat-icon>
          <span>{{ option.label }}</span>
        </button>
      }
    </mat-menu>
  `,
})
export class ThemeMenu {
  protected readonly theme = inject(ThemeService);
  readonly menu = viewChild.required(MatMenu);

  protected readonly options: ThemeOption[] = [
    { mode: 'light', label: 'Claro', icon: 'light_mode' },
    { mode: 'dark', label: 'Oscuro', icon: 'dark_mode' },
    { mode: 'system', label: 'Según el sistema', icon: 'contrast' },
  ];
}
