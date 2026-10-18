import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import type { ApiEnum } from '../../../core/api/api';
import { LocationContextService } from '../../../core/context/location-context.service';
import { CellDef, DataTable } from '../../../shared/components/data-table/data-table';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import {
  RecordDialogService,
  RecordField,
} from '../../../shared/components/record-dialog/record-dialog';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { ListQuery } from '../../../shared/data-access/list-query';
import { ENUM_LABELS } from '../../../shared/pipes/labels';
import { CategoriesApi } from '../../catalog/data-access/catalog-api';
import { CountsApi } from '../data-access/inventory-api';
import { stockWarehouses } from '../ui/stock-warehouses';

type CountStatus = ApiEnum<'PhysicalCountStatus'>;

/** /inventario/conteos (frontend §7.3): counts of the active location and the creation of a new one. */
@Component({
  selector: 'app-counts-list-page',
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
  ],
  template: `
    <app-page-header title="Conteos físicos">
      @if (location()) {
        <button matButton="filled" type="button" (click)="create()">
          <mat-icon>add</mat-icon>
          Nuevo conteo
        </button>
      }
    </app-page-header>

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
      label="Conteos físicos"
      [rows]="rows()"
      [total]="total()"
      [query]="query()"
      [loading]="counts.isLoading()"
      emptyMessage="No hay conteos en esta ubicación."
      (queryChange)="query.set($event)"
    >
      <ng-template appCell="folio" header="Folio" sortable [appCellOf]="rows()" let-count>
        <a class="row-link" [routerLink]="count.id">{{ count.folio }}</a>
      </ng-template>
      <ng-template appCell="location" header="Ubicación" [appCellOf]="rows()" let-count>
        {{ count.locationCode }}
      </ng-template>
      <ng-template appCell="status" header="Estado" sortable [appCellOf]="rows()" let-count>
        <app-status-tag [value]="count.status" kind="PhysicalCountStatus" />
      </ng-template>
      <ng-template appCell="progress" header="Avance" end [appCellOf]="rows()" let-count>
        {{ count.countedLines }} / {{ count.lineCount }}
      </ng-template>
      <ng-template appCell="createdAt" header="Creado" sortable [appCellOf]="rows()" let-count>
        {{ count.createdAt | date: 'dd/MM/yyyy HH:mm' }}
      </ng-template>
      <ng-template appCell="closedAt" header="Cerrado" [appCellOf]="rows()" let-count>
        {{ count.closedAt ? (count.closedAt | date: 'dd/MM/yyyy HH:mm') : '—' }}
      </ng-template>
    </app-data-table>
  `,
  styleUrl: './inventory.scss',
})
export class CountsListPage {
  private readonly api = inject(CountsApi);
  private readonly categoriesApi = inject(CategoriesApi);
  private readonly dialogs = inject(RecordDialogService);
  private readonly router = inject(Router);
  protected readonly location = inject(LocationContextService).active;
  private readonly warehouses = stockWarehouses(this.location);

  protected readonly statusOptions = Object.entries(ENUM_LABELS.PhysicalCountStatus).map(
    ([value, label]) => ({ value: value as CountStatus, label }),
  );
  protected readonly status = signal<CountStatus | null>(null);
  protected readonly query = signal<ListQuery>({ page: 1, pageSize: 25, sort: 'createdAt:desc' });

  protected readonly counts = rxResource({
    params: () => {
      const location = this.location();
      return location
        ? { query: this.query(), locationId: location.id, status: this.status() }
        : undefined;
    },
    stream: ({ params }) =>
      this.api.list(params.query, { locationId: params.locationId, status: params.status }),
  });
  protected readonly rows = computed(() =>
    this.counts.hasValue() ? this.counts.value().items : [],
  );
  protected readonly total = computed(() =>
    this.counts.hasValue() ? this.counts.value().total : 0,
  );

  private readonly categories = rxResource({
    stream: () =>
      this.categoriesApi.list().pipe(map((page) => page.items.filter((c) => c.isActive))),
    defaultValue: [],
  });

  protected setStatus(status: CountStatus | null): void {
    this.status.set(status);
    this.query.update((x) => ({ ...x, page: 1 }));
  }

  protected async create(): Promise<void> {
    const location = this.location();
    if (!location) return;
    const warehouses = this.warehouses();
    const fields: RecordField[] = [
      ...(warehouses.length > 0
        ? [
            {
              key: 'warehouseId',
              label: 'Subalmacén',
              type: 'select' as const,
              required: true,
              options: warehouses.map((w) => ({ value: w.id, label: w.name })),
              hint: 'El conteo se hace en un subalmacén.',
            },
          ]
        : []),
      {
        key: 'categoryId',
        label: 'Categoría (opcional)',
        type: 'select',
        options: [
          { value: null, label: 'Todas: conteo completo' },
          ...this.categories.value().map((c) => ({ value: c.id, label: c.name })),
        ],
        hint: 'Con una categoría, el conteo es parcial.',
      },
      { key: 'notes', label: 'Notas', type: 'textarea', maxLength: 500 },
    ];
    const created = await this.dialogs.open({
      title: `Nuevo conteo · ${location.name}`,
      fields,
      value: { categoryId: null },
      saveLabel: 'Crear conteo',
      save: (value) =>
        this.api.create({
          locationId: (value['warehouseId'] as string | undefined) ?? location.id,
          categoryId: (value['categoryId'] as string | null) ?? null,
          notes: (value['notes'] as string | null) ?? null,
        }),
    });
    if (created) await this.router.navigate(['/inventario/conteos', created.id]);
  }
}
