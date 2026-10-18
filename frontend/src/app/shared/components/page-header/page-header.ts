import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { BreadcrumbsService } from '../../../core/layout/breadcrumbs.service';

/** Page title with its breadcrumbs and actions (projected content) on the right (frontend §8). */
@Component({
  selector: 'app-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatIconModule],
  template: `
    @if (crumbs().length > 1) {
      <nav aria-label="Migas de pan">
        <ol class="crumbs">
          @for (crumb of crumbs(); track $index; let last = $last) {
            <li>
              @if (crumb.url) {
                <a [routerLink]="crumb.url">{{ crumb.label }}</a>
              } @else {
                <span aria-current="page">{{ crumb.label }}</span>
              }
              @if (!last) {
                <mat-icon aria-hidden="true">chevron_right</mat-icon>
              }
            </li>
          }
        </ol>
      </nav>
    }
    <div class="title-row">
      <h1 class="pan-page-title">{{ title() }}</h1>
      <div class="actions"><ng-content /></div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      margin-bottom: 16px;
    }

    .crumbs {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      margin: 0 0 4px;
      padding: 0;
      list-style: none;
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
    }

    li {
      display: inline-flex;
      align-items: center;
    }

    a,
    span {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      padding: 0 2px;
    }

    a {
      color: inherit;
    }

    mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }

    .title-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .pan-page-title {
      margin: 0;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
  `,
})
export class PageHeader {
  readonly title = input.required<string>();
  protected readonly crumbs = inject(BreadcrumbsService).crumbs;
}
