import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  inject,
  input,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { CellDef, DataTable } from '../../../shared/components/data-table/data-table';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { ItemsApi } from '../data-access/catalog-api';

/** Packaged versions of a bulk finished good (D-05), with the shortcut to add one. */
@Component({
  selector: 'app-packaged-versions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButtonModule, MatIconModule, DataTable, CellDef, StatusTag],
  template: `
    <div class="head">
      <p class="muted">Productos empaquetados que se surten a partir de este granel.</p>
      @if (canCreate()) {
        <a
          matButton="filled"
          routerLink="/catalogos/articulos/nuevo"
          [queryParams]="{ granel: bulkItemId() }"
        >
          <mat-icon>add</mat-icon>
          Nueva versión empaquetada
        </a>
      }
    </div>
    <app-data-table
      label="Versiones empaquetadas"
      [rows]="rows()"
      [loading]="versions.isLoading()"
      emptyMessage="Este granel todavía no tiene versiones empaquetadas."
    >
      <ng-template appCell="sku" header="SKU" [appCellOf]="rows()" let-item>
        <a class="row-link" [routerLink]="['/catalogos/articulos', item.id]">{{ item.sku }}</a>
      </ng-template>
      <ng-template appCell="name" header="Nombre" [appCellOf]="rows()" let-item>
        {{ item.name }}
      </ng-template>
      <ng-template appCell="status" header="Estado" [appCellOf]="rows()" let-item>
        <app-status-tag
          [text]="item.isActive ? 'Activo' : 'Inactivo'"
          [color]="item.isActive ? 'green' : 'grey'"
        />
      </ng-template>
    </app-data-table>
  `,
  styles: `
    :host {
      display: block;
      padding-top: 16px;
    }

    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
    }

    .muted {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
    }

    .row-link {
      color: var(--mat-sys-primary);
      font-weight: 600;
      text-decoration: none;
    }
  `,
})
export class PackagedVersions {
  readonly bulkItemId = input.required<string>();
  readonly canCreate = input(false, { transform: booleanAttribute });

  private readonly api = inject(ItemsApi);
  protected readonly versions = rxResource({
    params: () => this.bulkItemId(),
    stream: ({ params }) =>
      this.api.list(
        { page: 1, pageSize: 100, sort: 'name' },
        { bulkItemId: params, includeInactive: true },
      ),
  });
  protected readonly rows = computed(() =>
    this.versions.hasValue() ? this.versions.value().items : [],
  );
}
