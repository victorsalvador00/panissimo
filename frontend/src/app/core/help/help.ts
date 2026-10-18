import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { HelpService } from './help.service';

/**
 * Contextual help (frontend §4.3): a floating button at the bottom right (HUD rings that turn and stop when the panel
 * opens; still with "reduce motion"; it rises over a fixed action bar) and a panel with the manual of the current screen.
 * The panel closes with X, Esc, the button or on navigation, and focus goes back to the button. The video of a capture
 * screen only downloads once the panel is open.
 */
@Component({
  selector: 'app-help',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './help.html',
  styleUrl: './help.scss',
  host: { '(document:keydown.escape)': 'onEscape()' },
})
export class Help {
  protected readonly help = inject(HelpService);
  private readonly button = viewChild.required<ElementRef<HTMLButtonElement>>('button');
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  private wasOpen = false;
  /** The video failed to load (not recorded yet or offline): it is hidden, the text stays. */
  protected readonly videoFailed = signal(false);

  constructor() {
    // Focus follows the panel: into its title when it opens, back to the button when it closes.
    afterRenderEffect(() => {
      const open = this.help.open();
      untracked(() => {
        if (open && !this.wasOpen) this.heading()?.nativeElement.focus();
        else if (!open && this.wasOpen) this.button().nativeElement.focus();
        this.wasOpen = open;
        if (open) this.videoFailed.set(false);
      });
    });
  }

  protected onEscape(): void {
    if (this.help.open()) this.help.close();
  }
}
