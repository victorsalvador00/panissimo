import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Notifier } from '../../../core/http/notifier.service';
import { defaultListQuery, ListQuery } from '../../../core/http/list-query';
import {
  CardDef,
  CellDef,
  DataTable,
  TableColumn,
} from '../../../shared/components/data-table/data-table';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { MxnPipe } from '../../../shared/pipes/mxn.pipe';
import { SupplierItemDto, SupplierItemFilters, SuppliersApi } from '../data-access/suppliers.api';
import { SupplierItemDialog, SupplierItemDialogData } from './supplier-item-dialog';
import { pricePerBaseUnit } from './supplier-validators';

/** Pestaña "Artículos" del proveedor: precio por unidad de compra (sin IVA), clave y preferido. */
@Component({
  selector: 'app-supplier-items',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    DataTable,
    CellDef,
    CardDef,
    StatusTag,
    MxnPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sgo-row toolbar">
      <mat-slide-toggle
        [checked]="!!filters().includeInactive"
        (change)="setIncludeInactive($event.checked)"
      >
        Mostrar inactivos
      </mat-slide-toggle>
      @if (editable()) {
        <span class="spacer"></span>
        <button mat-flat-button type="button" (click)="add()">
          <mat-icon>add</mat-icon>
          Agregar artículo
        </button>
      }
    </div>

    <app-data-table
      [columns]="columns"
      [rows]="items.value()?.items ?? []"
      [total]="items.value()?.total ?? 0"
      [loading]="items.isLoading()"
      [query]="query()"
      [searchable]="true"
      searchPlaceholder="Buscar por SKU o nombre"
      emptyMessage="Este proveedor todavía no tiene artículos."
      [emptyActionLabel]="editable() ? 'Agregar artículo' : undefined"
      (emptyAction)="add()"
      [rowClickable]="editable()"
      (rowClick)="edit($event)"
      (queryChange)="query.set($event)"
    >
      <ng-template appCell="price" let-row>
        {{ row.price | mxn: '1.2-4' }} / {{ row.purchaseUomCode }}
      </ng-template>
      <ng-template appCell="perBase" let-row>
        {{ perBase(row) | mxn: '1.2-4' }} / {{ row.baseUomCode }}
      </ng-template>
      <ng-template appCell="isPreferred" let-row>
        @if (row.isPreferred) {
          <app-status-tag label="Preferido" color="blue" />
        }
      </ng-template>
      <ng-template appCell="isActive" let-row>
        <app-status-tag
          [label]="row.isActive ? 'Activo' : 'Inactivo'"
          [color]="row.isActive ? 'green' : 'gray'"
        />
      </ng-template>
      <ng-template appCardDef let-row>
        <strong>{{ row.sku }} · {{ row.name }}</strong>
        <div>
          {{ row.price | mxn: '1.2-4' }} / {{ row.purchaseUomCode }}
          @if (row.purchaseToBaseFactor !== 1) {
            <span class="muted">({{ perBase(row) | mxn: '1.2-4' }} / {{ row.baseUomCode }})</span>
          }
        </div>
        <div class="muted">
          Entrega: {{ row.leadTimeDays }} días
          @if (row.supplierSku) {
            · Clave: {{ row.supplierSku }}
          }
          @if (row.isPreferred) {
            · Preferido
          }
          @if (!row.isActive) {
            · Inactivo
          }
        </div>
      </ng-template>
    </app-data-table>
  `,
  styles: `
    .toolbar {
      align-items: center;
      margin-bottom: var(--sgo-space-3);
    }
    .spacer {
      flex: 1;
    }
    .muted {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class SupplierItems {
  private readonly api = inject(SuppliersApi);
  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(Notifier);

  readonly supplierId = input.required<string>();
  /** Con `purchasing.suppliers.manage` y el proveedor activo. */
  readonly editable = input(false);

  protected readonly columns: TableColumn<SupplierItemDto>[] = [
    { key: 'sku', header: 'SKU', sortable: true },
    { key: 'name', header: 'Artículo', sortable: true },
    { key: 'supplierSku', header: 'Clave proveedor' },
    { key: 'price', header: 'Precio sin IVA', sortable: true, align: 'end' },
    { key: 'perBase', header: 'Por unidad base', align: 'end' },
    {
      key: 'leadTimeDays',
      header: 'Entrega',
      sortable: true,
      align: 'end',
      value: (row) => `${row.leadTimeDays} días`,
    },
    { key: 'isPreferred', header: 'Preferido' },
    { key: 'isActive', header: 'Estado' },
  ];

  protected readonly query = signal<ListQuery>(defaultListQuery('name:asc'));
  protected readonly filters = signal<SupplierItemFilters>({});

  protected readonly items = rxResource({
    params: () => ({ id: this.supplierId(), query: this.query(), filters: this.filters() }),
    stream: ({ params }) => this.api.items(params.id, params.query, params.filters),
  });

  protected perBase(row: SupplierItemDto): number {
    return pricePerBaseUnit(row.price, row.purchaseToBaseFactor);
  }

  protected setIncludeInactive(checked: boolean): void {
    this.filters.set({ includeInactive: checked || null });
    this.query.update((query) => ({ ...query, page: 1 }));
  }

  protected add(): void {
    this.open(null);
  }

  protected edit(row: SupplierItemDto): void {
    if (this.editable()) {
      this.open(row);
    }
  }

  private open(row: SupplierItemDto | null): void {
    this.dialog
      .open<SupplierItemDialog, SupplierItemDialogData, SupplierItemDto>(SupplierItemDialog, {
        data: { supplierId: this.supplierId(), row },
        width: '520px',
        maxWidth: 'calc(100vw - 32px)',
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          this.notifier.success(
            row ? `${saved.sku} actualizado.` : `${saved.sku} agregado al proveedor.`,
          );
          this.items.reload();
        }
      });
  }
}
