import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { CellDef, DataTable } from '../../../shared/components/data-table/data-table';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { ListQuery } from '../../../shared/data-access/list-query';
import { OrderImportsApi } from '../data-access/production-api';

/** /produccion/importaciones (frontend §7.4): history of the Excel imports with their orders. */
@Component({
  selector: 'app-imports-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule, PageHeader, DataTable, CellDef],
  template: `
    <app-page-header title="Importaciones de órdenes">
      @if (canImport) {
        <a matButton="filled" routerLink="/produccion/importar">
          <mat-icon>upload_file</mat-icon>
          Importar desde Excel
        </a>
      }
    </app-page-header>

    <app-data-table
      label="Importaciones de órdenes"
      [rows]="rows()"
      [total]="total()"
      [query]="query()"
      [loading]="imports.isLoading()"
      emptyMessage="Todavía no hay importaciones."
      (queryChange)="query.set($event)"
    >
      <ng-template appCell="folio" header="Folio" [appCellOf]="rows()" let-item>
        <a class="row-link" [routerLink]="item.id">{{ item.folio }}</a>
      </ng-template>
      <ng-template appCell="createdAt" header="Fecha" [appCellOf]="rows()" let-item>
        {{ item.createdAt | date: 'dd/MM/yyyy HH:mm' }}
      </ng-template>
      <ng-template appCell="file" header="Archivo" [appCellOf]="rows()" let-item>
        {{ item.fileName }}
      </ng-template>
      <ng-template appCell="rows" header="Filas" end [appCellOf]="rows()" let-item>
        {{ item.rowCount }}
      </ng-template>
      <ng-template appCell="orders" header="Órdenes" end [appCellOf]="rows()" let-item>
        {{ item.orderCount }}
      </ng-template>
      <ng-template appCell="released" header="Liberadas" [appCellOf]="rows()" let-item>
        {{ item.releasedOnImport ? 'Sí' : 'No' }}
      </ng-template>
      <ng-template appCell="user" header="Importó" [appCellOf]="rows()" let-item>
        {{ item.createdByName ?? '—' }}
      </ng-template>
    </app-data-table>
  `,
})
export class ImportsListPage {
  private readonly api = inject(OrderImportsApi);
  protected readonly canImport = inject(AuthService).can('production.orders.import');
  protected readonly query = signal<ListQuery>({ page: 1, pageSize: 25 });

  protected readonly imports = rxResource({
    params: () => this.query(),
    stream: ({ params }) => this.api.list(params),
  });
  protected readonly rows = computed(() =>
    this.imports.hasValue() ? this.imports.value().items : [],
  );
  protected readonly total = computed(() =>
    this.imports.hasValue() ? this.imports.value().total : 0,
  );
}
