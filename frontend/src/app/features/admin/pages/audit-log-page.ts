import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { debounceTime, map, of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { defaultListQuery, ListQuery } from '../../../core/http/list-query';
import { AuditChangesDialog } from '../../../shared/components/audit-panel/audit-changes-dialog';
import {
  CardDef,
  CellDef,
  DataTable,
  TableColumn,
} from '../../../shared/components/data-table/data-table';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import {
  AuditLogEntry,
  AuditLogFilters,
  AuditLogService,
} from '../../../shared/data-access/audit-log.service';
import {
  AUDIT_ENTITY_LABELS,
  auditActionLabel,
  AuditActionPipe,
  auditEntityLabel,
  AuditEntityPipe,
} from '../../../shared/pipes/audit-labels';
import { dayRange } from '../../../shared/forms/date-range';
import { UsersApi } from '../data-access/users.api';

@Component({
  selector: 'app-audit-log-page',
  imports: [
    ReactiveFormsModule,
    DatePipe,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatDatepickerModule,
    MatButtonModule,
    PageHeader,
    DataTable,
    CellDef,
    CardDef,
    AuditEntityPipe,
    AuditActionPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sgo-page">
      <app-page-header
        title="Bitácora"
        subtitle="Quién cambió qué y cuándo. Toca un registro para ver el detalle."
      />

      <form [formGroup]="filtersForm" class="sgo-row filters" novalidate>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Entidad</mat-label>
          <mat-select formControlName="entityType">
            <mat-option [value]="null">Todas</mat-option>
            @for (option of entityOptions; track option.value) {
              <mat-option [value]="option.value">{{ option.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        @if (canListUsers) {
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Usuario</mat-label>
            <mat-select formControlName="userId">
              <mat-option [value]="null">Todos</mat-option>
              @for (user of users.value() ?? []; track user.id) {
                <mat-option [value]="user.id">{{ user.fullName }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Periodo</mat-label>
          <mat-date-range-input [rangePicker]="range">
            <input matStartDate formControlName="from" placeholder="Desde" />
            <input matEndDate formControlName="to" placeholder="Hasta" />
          </mat-date-range-input>
          <mat-datepicker-toggle matIconSuffix [for]="range" />
          <mat-date-range-picker #range />
        </mat-form-field>
        <button mat-button type="button" (click)="clear()">Limpiar filtros</button>
      </form>

      <app-data-table
        [columns]="columns"
        [rows]="log.value()?.items ?? []"
        [total]="log.value()?.total ?? 0"
        [loading]="log.isLoading()"
        [query]="query()"
        emptyMessage="No hay registros con esos filtros."
        [rowClickable]="true"
        (rowClick)="open($event)"
        (queryChange)="query.set($event)"
      >
        <ng-template appCell="occurredAt" let-row>
          <span class="nowrap">{{ row.occurredAt | date: 'dd/MM/yyyy HH:mm' }}</span>
        </ng-template>
        <ng-template appCardDef let-row>
          <strong>{{ row.action | auditAction }} · {{ row.entityType | auditEntity }}</strong>
          <div class="muted">
            {{ row.occurredAt | date: 'dd/MM/yyyy HH:mm' }} · {{ row.userName ?? 'Sistema' }}
          </div>
        </ng-template>
      </app-data-table>
    </section>
  `,
  styles: `
    .filters {
      margin-bottom: var(--sgo-space-4);
    }
    .filters mat-form-field {
      width: 240px;
    }
    .muted {
      color: var(--mat-sys-on-surface-variant);
    }
    .nowrap {
      white-space: nowrap;
    }
  `,
})
export class AuditLogPage {
  private readonly audit = inject(AuditLogService);
  private readonly usersApi = inject(UsersApi);
  private readonly dialog = inject(MatDialog);

  /** La lista de usuarios exige `security.users.manage`: sin ese permiso no se filtra por usuario. */
  protected readonly canListUsers = inject(AuthService).can('security.users.manage');

  protected readonly entityOptions = Object.keys(AUDIT_ENTITY_LABELS)
    .map((value) => ({ value, label: auditEntityLabel(value) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));

  protected readonly columns: TableColumn<AuditLogEntry>[] = [
    { key: 'occurredAt', header: 'Fecha' },
    { key: 'userName', header: 'Usuario', value: (row) => row.userName ?? 'Sistema' },
    { key: 'action', header: 'Acción', value: (row) => auditActionLabel(row.action) },
    { key: 'entityType', header: 'Entidad', value: (row) => auditEntityLabel(row.entityType) },
    { key: 'entityId', header: 'Registro' },
  ];

  protected readonly filtersForm = new FormGroup({
    entityType: new FormControl<string | null>(null),
    userId: new FormControl<string | null>(null),
    from: new FormControl<Date | null>(null),
    to: new FormControl<Date | null>(null),
  });

  protected readonly query = signal<ListQuery>(defaultListQuery());
  private readonly filters = signal<AuditLogFilters>({});

  protected readonly log = rxResource({
    params: () => ({ query: this.query(), filters: this.filters() }),
    stream: ({ params }) =>
      this.audit.list({ page: params.query.page, pageSize: params.query.pageSize }, params.filters),
  });

  protected readonly users = rxResource({
    stream: () =>
      this.canListUsers
        ? this.usersApi.list({ page: 1, pageSize: 100 }).pipe(map((page) => page.items))
        : of([]),
  });

  constructor() {
    this.filtersForm.valueChanges
      .pipe(debounceTime(200), takeUntilDestroyed())
      .subscribe((value) => {
        this.filters.set({
          entityType: value.entityType,
          userId: value.userId,
          ...dayRange(value.from ?? null, value.to ?? null),
        });
        this.query.update((query) => ({ ...query, page: 1 }));
      });
  }

  protected clear(): void {
    this.filtersForm.reset();
  }

  protected open(entry: AuditLogEntry): void {
    this.dialog.open(AuditChangesDialog, {
      data: entry,
      width: '640px',
      maxWidth: 'calc(100vw - 32px)',
    });
  }
}
