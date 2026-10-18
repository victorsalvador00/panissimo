import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { CellDef, DataTable } from '../../../shared/components/data-table/data-table';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { ListQuery } from '../../../shared/data-access/list-query';
import { MxnPipe } from '../../../shared/pipes/pipes';
import { GoodsReceiptsApi } from '../data-access/purchasing-api';

/** /compras/recepciones (frontend §7.6): history of goods receipts, by folio or invoice. */
@Component({
  selector: 'app-goods-receipts-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    PageHeader,
    DataTable,
    CellDef,
    MxnPipe,
  ],
  template: `
    <app-page-header title="Recepciones de compra">
      @if (canReceive) {
        <a matButton="filled" routerLink="/compras/ordenes" [queryParams]="{ tab: 'ToReceive' }">
          <mat-icon>inventory</mat-icon>
          Órdenes por recibir
        </a>
      }
    </app-page-header>

    <div class="filters">
      <mat-form-field class="search">
        <mat-label>Buscar por folio o factura</mat-label>
        <input matInput type="search" [formControl]="search" />
        <mat-icon matSuffix aria-hidden="true">search</mat-icon>
      </mat-form-field>
    </div>

    <app-data-table
      label="Recepciones de compra"
      [rows]="rows()"
      [total]="total()"
      [query]="query()"
      [loading]="receipts.isLoading()"
      emptyMessage="No hay recepciones."
      (queryChange)="query.set($event)"
    >
      <ng-template appCell="folio" header="Folio" sortable [appCellOf]="rows()" let-receipt>
        <a class="row-link" [routerLink]="receipt.id">{{ receipt.folio }}</a>
      </ng-template>
      <ng-template appCell="receivedAt" header="Fecha" sortable [appCellOf]="rows()" let-receipt>
        {{ receipt.receivedAt | date: 'dd/MM/yyyy HH:mm' }}
      </ng-template>
      <ng-template appCell="order" header="OC" [appCellOf]="rows()" let-receipt>
        <a class="row-link" [routerLink]="['/compras/ordenes', receipt.purchaseOrderId]">
          {{ receipt.purchaseOrderFolio }}
        </a>
      </ng-template>
      <ng-template appCell="supplier" header="Proveedor" [appCellOf]="rows()" let-receipt>
        {{ receipt.supplierName }}
      </ng-template>
      <ng-template appCell="invoice" header="Factura" [appCellOf]="rows()" let-receipt>
        {{ receipt.supplierInvoiceNumber ?? '—' }}
      </ng-template>
      <ng-template appCell="lines" header="Líneas" end [appCellOf]="rows()" let-receipt>
        {{ receipt.lineCount }}
      </ng-template>
      <ng-template appCell="cost" header="Costo" end [appCellOf]="rows()" let-receipt>
        {{ receipt.totalCost | mxn }}
      </ng-template>
    </app-data-table>
  `,
  styleUrl: '../../catalog/pages/catalog-list.scss',
})
export class GoodsReceiptsListPage {
  private readonly api = inject(GoodsReceiptsApi);
  protected readonly canReceive = inject(AuthService).can('purchasing.receive');
  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly query = signal<ListQuery>({ page: 1, pageSize: 25, sort: 'receivedAt:desc' });

  protected readonly receipts = rxResource({
    params: () => this.query(),
    stream: ({ params }) => this.api.list(params),
  });
  protected readonly rows = computed(() =>
    this.receipts.hasValue() ? this.receipts.value().items : [],
  );
  protected readonly total = computed(() =>
    this.receipts.hasValue() ? this.receipts.value().total : 0,
  );

  constructor() {
    this.search.valueChanges
      .pipe(debounceTime(300), takeUntilDestroyed())
      .subscribe((q) => this.query.update((x) => ({ ...x, page: 1, q: q.trim() || undefined })));
  }
}
