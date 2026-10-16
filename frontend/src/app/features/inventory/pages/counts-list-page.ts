import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';
import { debounceTime, filter } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { LocationContextService } from '../../../core/context/location-context.service';
import { defaultListQuery, ListQuery } from '../../../core/http/list-query';
import {
  CardDef,
  CellDef,
  DataTable,
  TableColumn,
} from '../../../shared/components/data-table/data-table';
import { LocationPicker } from '../../../shared/components/location-picker/location-picker';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { ENUM_LABELS } from '../../../shared/pipes/status-label.pipe';
import {
  PhysicalCountDto,
  PhysicalCountFilters,
  PhysicalCountListItem,
  PhysicalCountsApi,
  PhysicalCountStatus,
} from '../data-access/physical-counts.api';
import { NewCountDialog } from '../ui/new-count-dialog';

/** Conteos físicos de la ubicación (spec frontend §7.3, RN-06). */
@Component({
  selector: 'app-counts-list-page',
  imports: [
    ReactiveFormsModule,
    DatePipe,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    PageHeader,
    DataTable,
    CellDef,
    CardDef,
    StatusTag,
    LocationPicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sgo-page">
      <app-page-header
        title="Conteos físicos"
        subtitle="Cuenta lo que hay en anaquel; al cerrar se ajustan las diferencias."
      >
        @if (canCount) {
          <button mat-flat-button type="button" (click)="create()">
            <mat-icon>add</mat-icon>
            Nuevo conteo
          </button>
        }
      </app-page-header>

      <form [formGroup]="filtersForm" class="filters" novalidate>
        <app-location-picker
          formControlName="locationId"
          label="Ubicación"
          subscriptSizing="dynamic"
        />
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Estado</mat-label>
          <mat-select formControlName="status">
            <mat-option [value]="null">Todos</mat-option>
            @for (status of statuses; track status) {
              <mat-option [value]="status">{{ statusLabels[status] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </form>

      <app-data-table
        [columns]="columns"
        [rows]="counts.value()?.items ?? []"
        [total]="counts.value()?.total ?? 0"
        [loading]="counts.isLoading()"
        [query]="query()"
        [searchable]="true"
        searchPlaceholder="Buscar por folio"
        emptyMessage="No hay conteos con esos filtros."
        [emptyActionLabel]="canCount ? 'Nuevo conteo' : undefined"
        (emptyAction)="create()"
        [rowClickable]="true"
        (rowClick)="open($event)"
        (queryChange)="query.set($event)"
      >
        <ng-template appCell="createdAt" let-row>{{
          row.createdAt | date: 'dd/MM/yyyy HH:mm'
        }}</ng-template>
        <ng-template appCell="status" let-row>
          <app-status-tag [status]="row.status" kind="PhysicalCountStatus" />
        </ng-template>
        <ng-template appCardDef let-row>
          <div class="card-row">
            <strong>{{ row.folio }}</strong>
            <app-status-tag [status]="row.status" kind="PhysicalCountStatus" />
          </div>
          <div class="muted">
            {{ row.createdAt | date: 'dd/MM/yyyy HH:mm' }} · {{ row.locationCode }} ·
            {{ progressText(row) }}
          </div>
        </ng-template>
      </app-data-table>
    </section>
  `,
  styles: `
    .filters {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: var(--sgo-space-2) var(--sgo-space-3);
      margin-bottom: var(--sgo-space-4);
    }
    .card-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--sgo-space-2);
    }
    .muted {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class CountsListPage {
  private readonly api = inject(PhysicalCountsApi);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);

  protected readonly canCount = inject(AuthService).can('inventory.count');
  protected readonly statuses = Object.keys(
    ENUM_LABELS.PhysicalCountStatus,
  ) as PhysicalCountStatus[];
  protected readonly statusLabels = ENUM_LABELS.PhysicalCountStatus;

  protected readonly columns: TableColumn<PhysicalCountListItem>[] = [
    { key: 'folio', header: 'Folio', sortable: true },
    { key: 'createdAt', header: 'Creado', sortable: true },
    { key: 'locationCode', header: 'Ubicación' },
    { key: 'progress', header: 'Contadas', align: 'end', value: (row) => progressText(row) },
    { key: 'status', header: 'Estado', sortable: true },
  ];

  protected readonly filtersForm = new FormGroup({
    locationId: new FormControl<string | null>(inject(LocationContextService).activeLocationId()),
    status: new FormControl<PhysicalCountStatus | null>(null),
  });

  protected readonly query = signal<ListQuery>(defaultListQuery('createdAt:desc'));
  private readonly filters = signal<PhysicalCountFilters>(this.filtersForm.getRawValue());

  protected readonly counts = rxResource({
    params: () => ({ query: this.query(), filters: this.filters() }),
    stream: ({ params }) => this.api.list(params.query, params.filters),
  });

  protected readonly progressText = progressText;

  constructor() {
    this.filtersForm.valueChanges.pipe(debounceTime(150), takeUntilDestroyed()).subscribe(() => {
      this.filters.set(this.filtersForm.getRawValue());
      this.query.update((query) => ({ ...query, page: 1 }));
    });
  }

  protected create(): void {
    this.dialog
      .open<NewCountDialog, void, PhysicalCountDto>(NewCountDialog, {
        width: '480px',
        maxWidth: 'calc(100vw - 32px)',
      })
      .afterClosed()
      .pipe(filter(Boolean))
      .subscribe((count) => void this.router.navigate(['/inventario/conteos', count.id]));
  }

  protected open(count: PhysicalCountListItem): void {
    void this.router.navigate(['/inventario/conteos', count.id]);
  }
}

/** "12 de 40"; en borrador aún no hay líneas (se generan al iniciar). */
export function progressText(row: PhysicalCountListItem): string {
  return row.status === 'Draft' ? 'Sin iniciar' : `${row.countedLines} de ${row.lineCount}`;
}
