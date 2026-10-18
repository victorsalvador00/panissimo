import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Help } from './core/help/help';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, Help],
  // The help floats over every screen, the login included (frontend §4.3); it loads once the page is idle, so the
  // manual is not part of the first download.
  template: '<router-outlet />@defer (on idle) {<app-help />}',
})
export class App {}
