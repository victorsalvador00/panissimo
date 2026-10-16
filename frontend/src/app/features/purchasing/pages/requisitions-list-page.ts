import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { LocationContextService } from '../../../core/context/location-context.service';
import { defaultListQuery, ListQuery } from '../../../core/http/list-query';
import {
  CardDef,
  CellDef,
  DataTable,
  TableColumn,
} from '../../../shared/components/data-table/data-table';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { enumLabel } from '../../../shared/pipes/status-label.pipe';
import {
  RequisitionFilters,
  RequisitionListItem,
  RequisitionsApi,
  RequisitionStatus,
} from '../data-access/requisitions.api';
import { RequisitionConversion } from '../ui/requisition-conversion';
import { isPurchaseLocation, REQUISITION_STATUSES } from '../ui/requisition-lines';

/**
 * Requisiciones (`/compras/requisiciones`, `purchasing.view`) de las ubicaciones del usuario. Con
 * `purchasing.po.manage` se eligen las aprobadas y se convierten en OC (RN-34).
 */
@Component({
  selector: 'app-requisitions-list-page',
  imports: [
    RouterLink,
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    PageHeader,
    DataTable,
    CellDef,
    CardDef,
    StatusTag,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sgo-page">
      <app-page-header
        title="Requisiciones"
        subtitle="Solicitudes de compra de la fábrica y el comisariato."
      >
        @if (canManage) {
          <a mat-flat-button routerLink="nueva">
            <mat-icon>add</mat-icon>
            Nueva requisición
          </a>
        }
      </app-page-header>

      <form [formGroup]="form" class="filters" novalidate>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Estado</mat-label>
          <mat-select formControlName="status">
            <mat-option [value]="null">Todos</mat-option>
            @for (status of statuses; track status) {
              <mat-option [value]="status">{{ statusLabel(status) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        @if (locations().length > 1) {
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Ubicación</mat-label>
            <mat-select formControlName="locationId">
              <mat-option [value]="null">Todas</mat-option>
              @for (location of locations(); track location.id) {
                <mat-option [value]="location.id"
                  >{{ location.code }} · {{ location.name }}</mat-option
                >
              }
            </mat-select>
          </mat-form-field>
        }
      </form>

      @if (canConvert) {
        <div class="sgo-row convert" role="region" aria-label="Convertir a orden de compra">
          <span class="muted">
            @if (selection().length) {
              {{ selection().length }}
              {{ selection().length === 1 ? 'requisición elegida' : 'requisiciones elegidas' }}
            } @else {
              Elige requisiciones aprobadas para convertirlas en órdenes de compra.
            }
          </span>
          @if (selection().length) {
            <button mat-button type="button" (click)="selection.set([])">Quitar selección</button>
          }
          <button
            mat-flat-button
            type="button"
            [disabled]="!selection().length || converting()"
            (click)="convert()"
          >
            <mat-icon>shopping_cart_checkout</mat-icon>
            Convertir a OC{{ selection().length ? ' (' + selection().length + ')' : '' }}
          </button>
        </div>
      }

      <app-data-table
        [columns]="columns"
        [rows]="requisitions.value()?.items ?? []"
        [total]="requisitions.value()?.total ?? 0"
        [loading]="requisitions.isLoading()"
        [query]="query()"
        [searchable]="true"
        searchPlaceholder="Buscar por folio"
        emptyMessage="No hay requisiciones con esos filtros."
        [emptyActionLabel]="canManage ? 'Nueva requisición' : undefined"
        (emptyAction)="create()"
        [rowClickable]="true"
        (rowClick)="open($event)"
        (queryChange)="query.set($event)"
        [selectable]="canConvert ? convertible : null"
        [selectionLabel]="selectionLabel"
        [(selection)]="selection"
      >
        <ng-template appCell="neededBy" let-row>{{
          row.neededBy | date: 'dd/MM/yyyy'
        }}</ng-template>
        <ng-template appCell="createdAt" let-row>{{
          row.createdAt | date: 'dd/MM/yyyy HH:mm'
        }}</ng-template>
        <ng-template appCell="status" let-row>
          <app-status-tag [status]="row.status" kind="RequisitionStatus" />
        </ng-template>
        <ng-template appCardDef let-row>
          <div class="card-row">
            <strong>{{ row.folio }}</strong>
            <app-status-tag [status]="row.status" kind="RequisitionStatus" />
          </div>
          <div class="muted">
            {{ row.location.code }} · se requiere {{ row.neededBy | date: 'dd/MM/yyyy' }} ·
            {{ row.lineCount }} {{ row.lineCount === 1 ? 'línea' : 'líneas' }}
          </div>
        </ng-template>
      </app-data-table>
    </section>
  `,
  styles: `
    .filters {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      max-width: 600px;
      gap: var(--sgo-space-3);
      margin-bottom: var(--sgo-space-4);
    }
    .convert {
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      margin-bottom: var(--sgo-space-3);
    }
    .convert .muted {
      flex: 1 1 240px;
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
export class RequisitionsListPage {
  private readonly api = inject(RequisitionsApi);
  private readonly conversion = inject(RequisitionConversion);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly locationContext = inject(LocationContextService);

  protected readonly canManage = this.auth.can('purchasing.requisitions.manage');
  protected readonly canConvert = this.auth.can('purchasing.po.manage');
  protected readonly statuses = REQUISITION_STATUSES;
  protected readonly locations = computed(() =>
    this.locationContext.locations().filter((location) => isPurchaseLocation(location.type)),
  );

  protected readonly columns: TableColumn<RequisitionListItem>[] = [
    { key: 'folio', header: 'Folio', sortable: true },
    { key: 'location', header: 'Ubicación', value: (row) => row.location.code },
    { key: 'neededBy', header: 'Se requiere', sortable: true },
    { key: 'lineCount', header: 'Líneas', align: 'end' },
    { key: 'createdAt', header: 'Creada', sortable: true },
    { key: 'status', header: 'Estado', sortable: true },
  ];

  protected readonly form = new FormGroup({
    status: new FormControl<RequisitionStatus | null>(null),
    locationId: new FormControl<string | null>(null),
  });

  /** Las más recientes primero. */
  protected readonly query = signal<ListQuery>(defaultListQuery('createdAt:desc'));
  private readonly filters = signal<RequisitionFilters>({});
  protected readonly selection = signal<RequisitionListItem[]>([]);
  protected readonly converting = signal(false);

  protected readonly requisitions = rxResource({
    params: () => ({ query: this.query(), filters: this.filters() }),
    stream: ({ params }) => this.api.list(params.query, params.filters),
  });

  protected readonly convertible = (row: RequisitionListItem) => row.status === 'Approved';
  protected readonly selectionLabel = (row: RequisitionListItem) => `Seleccionar ${row.folio}`;

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.filters.set(this.form.getRawValue());
      this.query.update((query) => ({ ...query, page: 1 }));
    });
  }

  protected statusLabel(status: RequisitionStatus): string {
    return enumLabel('RequisitionStatus', status);
  }

  protected convert(): void {
    this.converting.set(true);
    this.conversion
      .convert(this.selection(), () => this.requisitions.reload())
      .subscribe({
        next: () => {
          this.converting.set(false);
          this.selection.set([]);
          this.requisitions.reload();
        },
        error: () => this.converting.set(false),
        complete: () => this.converting.set(false),
      });
  }

  protected create(): void {
    void this.router.navigate(['/compras/requisiciones/nueva']);
  }

  protected open(requisition: RequisitionListItem): void {
    void this.router.navigate(['/compras/requisiciones', requisition.id]);
  }
}
