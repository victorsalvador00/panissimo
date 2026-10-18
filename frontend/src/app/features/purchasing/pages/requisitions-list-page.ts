import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { ApiEnum } from '../../../core/api/api';
import { AuthService } from '../../../core/auth/auth.service';
import { CellDef, DataTable } from '../../../shared/components/data-table/data-table';
import { ConfirmService } from '../../../shared/components/confirm-summary/confirm-summary';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { documentLink } from '../../../shared/data-access/document-links';
import { ListQuery } from '../../../shared/data-access/list-query';
import { ENUM_LABELS } from '../../../shared/pipes/labels';
import { MxnPipe } from '../../../shared/pipes/pipes';
import {
  ConvertedOrder,
  RequisitionListItem,
  RequisitionsApi,
} from '../data-access/purchasing-api';

type Status = ApiEnum<'RequisitionStatus'>;

/**
 * /compras/requisiciones (frontend §7.6, RN-34): requisitions by state; the approved ones are selected and
 * **Convertir a OC (n)** creates the draft purchase orders grouped by supplier, shown at once.
 */
@Component({
  selector: 'app-requisitions-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    PageHeader,
    DataTable,
    CellDef,
    StatusTag,
    MxnPipe,
  ],
  template: `
    <app-page-header title="Requisiciones">
      @if (canConvert && convertible().length > 0) {
        <button matButton="tonal" type="button" [disabled]="converting()" (click)="convert()">
          <mat-icon>shopping_cart_checkout</mat-icon>
          Convertir a OC ({{ convertible().length }})
        </button>
      }
      @if (canManage) {
        <a matButton="filled" routerLink="nueva">
          <mat-icon>add</mat-icon>
          Nueva requisición
        </a>
      }
    </app-page-header>

    @if (converted(); as orders) {
      <section class="pan-card result" role="status" aria-labelledby="converted-title">
        <h2 id="converted-title">
          {{ orders.length }}
          {{ orders.length === 1 ? 'orden de compra generada' : 'órdenes de compra generadas' }}
          en borrador
        </h2>
        <div class="table-wrap">
          <table aria-label="Órdenes de compra generadas">
            <thead>
              <tr>
                <th scope="col">OC</th>
                <th scope="col">Proveedor</th>
                <th scope="col">Requisiciones</th>
                <th scope="col">Fecha esperada</th>
                <th scope="col" class="end">Líneas</th>
                <th scope="col" class="end">Total con IVA</th>
              </tr>
            </thead>
            <tbody>
              @for (order of orders; track order.id) {
                <tr>
                  <td>
                    @if (orderLink(order.id); as link) {
                      <a class="row-link" [routerLink]="link">{{ order.folio }}</a>
                    } @else {
                      <strong>{{ order.folio }}</strong>
                    }
                  </td>
                  <td>{{ order.supplierName }}</td>
                  <td>{{ order.requisitionFolios.join(', ') }}</td>
                  <td>{{ order.expectedDate | date: 'dd/MM/yyyy' }}</td>
                  <td class="end">{{ order.lineCount }}</td>
                  <td class="end">{{ order.total | mxn }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <button matButton type="button" (click)="converted.set(null)">Cerrar</button>
      </section>
    }

    <div class="filters">
      <mat-form-field>
        <mat-label>Estado</mat-label>
        <mat-select [value]="status()" (valueChange)="setStatus($event)">
          <mat-option [value]="null">Todos</mat-option>
          @for (option of statusOptions; track option.value) {
            <mat-option [value]="option.value">{{ option.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
    </div>

    <app-data-table
      label="Requisiciones"
      [rows]="rows()"
      [total]="total()"
      [query]="query()"
      [loading]="requisitions.isLoading()"
      [selectable]="canConvert"
      [(selection)]="selection"
      emptyMessage="No hay requisiciones con estos filtros."
      (queryChange)="query.set($event)"
    >
      <ng-template appCell="folio" header="Folio" sortable [appCellOf]="rows()" let-requisition>
        <a class="row-link" [routerLink]="requisition.id">{{ requisition.folio }}</a>
      </ng-template>
      <ng-template
        appCell="neededBy"
        header="Se necesita"
        sortable
        [appCellOf]="rows()"
        let-requisition
      >
        {{ requisition.neededBy | date: 'dd/MM/yyyy' }}
      </ng-template>
      <ng-template appCell="location" header="Ubicación" [appCellOf]="rows()" let-requisition>
        {{ requisition.locationCode }}
      </ng-template>
      <ng-template appCell="status" header="Estado" sortable [appCellOf]="rows()" let-requisition>
        <app-status-tag [value]="requisition.status" kind="RequisitionStatus" />
      </ng-template>
      <ng-template appCell="lines" header="Líneas" end [appCellOf]="rows()" let-requisition>
        {{ requisition.lineCount }}
      </ng-template>
      <ng-template appCell="amount" header="Estimado" end [appCellOf]="rows()" let-requisition>
        {{ requisition.estimatedSubtotal | mxn }}
      </ng-template>
      <ng-template appCell="user" header="Creó" [appCellOf]="rows()" let-requisition>
        {{ requisition.createdByName ?? '—' }}
      </ng-template>
    </app-data-table>
    @if (canConvert && selection().length > convertible().length) {
      <p class="muted">Solo se convierten las requisiciones aprobadas.</p>
    }
  `,
  styleUrl: '../../catalog/pages/catalog-list.scss',
  styles: `
    .result {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 16px;
      border-left: 4px solid var(--pan-status-green-fg);

      h2 {
        margin: 0;
        font: var(--mat-sys-title-medium);
        font-weight: 700;
      }
    }

    .table-wrap {
      align-self: stretch;
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;

      th,
      td {
        padding: 8px;
        border-bottom: 1px solid var(--pan-row-divider);
        text-align: left;
      }

      th {
        color: var(--mat-sys-on-surface-variant);
        font: var(--mat-sys-label-large);
      }
    }

    .end {
      text-align: right !important;
    }

    .muted {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class RequisitionsListPage {
  private readonly api = inject(RequisitionsApi);
  private readonly auth = inject(AuthService);
  private readonly confirmService = inject(ConfirmService);
  protected readonly canManage = this.auth.can('purchasing.requisitions.manage');
  protected readonly canConvert = this.auth.can('purchasing.po.manage');
  protected readonly statusOptions = Object.entries(ENUM_LABELS.RequisitionStatus).map(
    ([value, label]) => ({ value: value as Status, label }),
  );

  protected readonly status = signal<Status | null>(null);
  protected readonly query = signal<ListQuery>({ page: 1, pageSize: 25, sort: 'neededBy:desc' });
  protected readonly selection = signal<readonly RequisitionListItem[]>([]);
  protected readonly converting = signal(false);
  protected readonly converted = signal<ConvertedOrder[] | null>(null);

  protected readonly requisitions = rxResource({
    params: () => ({ query: this.query(), status: this.status() }),
    stream: ({ params }) => this.api.list(params.query, { status: params.status }),
  });
  protected readonly rows = computed(() =>
    this.requisitions.hasValue() ? this.requisitions.value().items : [],
  );
  protected readonly total = computed(() =>
    this.requisitions.hasValue() ? this.requisitions.value().total : 0,
  );
  protected readonly convertible = computed(() =>
    this.selection().filter((r) => r.status === 'Approved'),
  );

  protected setStatus(status: Status | null): void {
    this.status.set(status);
    this.query.update((x) => ({ ...x, page: 1 }));
  }

  protected orderLink(id: string): string[] | null {
    return documentLink('PurchaseOrder', id);
  }

  protected async convert(): Promise<void> {
    const requisitions = this.convertible();
    const confirmed = await this.confirmService.confirm({
      title: 'Convertir a órdenes de compra',
      message:
        'Se crean órdenes de compra en borrador agrupadas por proveedor y ubicación de entrega, con el precio del catálogo y el IVA de cada artículo.',
      summary: requisitions.map((r) => ({ label: r.folio, value: `${r.lineCount} líneas` })),
      confirmLabel: `Convertir (${requisitions.length})`,
    });
    if (!confirmed) return;
    this.converting.set(true);
    try {
      this.converted.set(await firstValueFrom(this.api.convert(requisitions.map((r) => r.id))));
      this.selection.set([]);
      this.requisitions.reload();
    } catch {
      // The error interceptor shows why (a requisition changed, a supplier no longer sells an item…).
    } finally {
      this.converting.set(false);
    }
  }
}
